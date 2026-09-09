-- Gerenciamento de membros e alocacoes diretamente no projeto.
-- Reaproveita project_members/resource_allocations e preserva o RBAC existente:
-- role_label e' o papel funcional; project_role continua sendo papel de acesso.

alter table public.profiles
  add column employee_number text;

create unique index profiles_employee_number_uk
  on public.profiles (lower(employee_number))
  where employee_number is not null and btrim(employee_number) <> '';

alter table public.project_members
  add column start_date date,
  add column end_date date,
  add column status text,
  add column notes text;

update public.project_members
set start_date = created_at::date,
    status = 'ativo'
where start_date is null or status is null;

alter table public.project_members
  alter column start_date set default current_date,
  alter column start_date set not null,
  alter column status set default 'ativo',
  alter column status set not null,
  add constraint project_members_period_ck check (end_date is null or end_date >= start_date),
  add constraint project_members_status_ck check (status in ('ativo', 'inativo')),
  drop constraint project_members_uk;

create unique index project_members_active_uk
  on public.project_members (project_id, profile_id)
  where status = 'ativo';

create index project_members_project_status_idx
  on public.project_members (project_id, status, start_date);

alter table public.resource_allocations
  add column description text,
  add column status text not null default 'ativa',
  add column overload_justification text,
  add constraint resource_allocations_status_ck check (status in ('ativa', 'cancelada'));

create index resource_allocations_active_period_idx
  on public.resource_allocations (profile_id, period_start, period_end)
  where status = 'ativa';

-- Usa a mesma capacidade semanal e o mesmo limite da Area que alimentam
-- v_resource_capacity. As horas existentes sao rateadas pela sobreposicao.
create or replace function public.check_resource_allocation_capacity(
  p_profile_id uuid,
  p_period_start date,
  p_period_end date,
  p_allocated_hours numeric,
  p_exclude_allocation_id uuid default null
)
returns table (
  capacity_hours numeric,
  current_hours numeric,
  requested_hours numeric,
  total_hours numeric,
  total_pct numeric,
  limit_pct numeric,
  overloaded boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with person as (
    select p.weekly_capacity_hours,
           coalesce(a.max_allocation_pct, 100)::numeric as max_pct
    from public.profiles p
    left join public.areas a on a.id = p.area_id
    where p.id = p_profile_id
  ), existing as (
    select coalesce(sum(
      ra.allocated_hours *
      ((least(ra.period_end, p_period_end) - greatest(ra.period_start, p_period_start) + 1)::numeric /
       nullif((ra.period_end - ra.period_start + 1)::numeric, 0))
    ), 0)::numeric as hours
    from public.resource_allocations ra
    where ra.profile_id = p_profile_id
      and ra.status = 'ativa'
      and ra.period_start <= p_period_end
      and ra.period_end >= p_period_start
      and (p_exclude_allocation_id is null or ra.id <> p_exclude_allocation_id)
  ), totals as (
    select round((person.weekly_capacity_hours * ((p_period_end - p_period_start + 1)::numeric / 7)), 2) as cap,
           existing.hours as cur,
           greatest(coalesce(p_allocated_hours, 0), 0)::numeric as req,
           person.max_pct as max_pct
    from person cross join existing
  )
  select cap, cur, req, cur + req,
         round(case when cap > 0 then ((cur + req) / cap) * 100 else 0 end, 2),
         max_pct,
         case when cap > 0 then ((cur + req) / cap) * 100 > max_pct else cur + req > 0 end
  from totals;
$$;

revoke all on function public.check_resource_allocation_capacity(uuid, date, date, numeric, uuid) from public, anon;
grant execute on function public.check_resource_allocation_capacity(uuid, date, date, numeric, uuid)
to authenticated;

create or replace function app.validate_project_resource_allocation()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_check record;
begin
  if new.status = 'cancelada' then
    return new;
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = new.project_id
      and pm.profile_id = new.profile_id
      and pm.status = 'ativo'
      and pm.start_date <= new.period_end
      and (pm.end_date is null or pm.end_date >= new.period_start)
  ) then
    raise exception 'O colaborador precisa ter vinculo ativo com o projeto no periodo da alocacao.';
  end if;

  select * into v_check
  from public.check_resource_allocation_capacity(
    new.profile_id, new.period_start, new.period_end, new.allocated_hours,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if v_check.overloaded and length(btrim(coalesce(new.overload_justification, ''))) < 10 then
    raise exception 'A alocacao ultrapassa a capacidade. Informe uma justificativa com pelo menos 10 caracteres.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_project_resource_allocation
before insert or update of project_id, profile_id, period_start, period_end,
  allocated_hours, status, overload_justification
on public.resource_allocations
for each row execute function app.validate_project_resource_allocation();

-- Alocacao e' gestao de recurso: leitura segue o projeto, escrita exige
-- can_manage_project, igual ao proprio project_members.
drop policy if exists resource_allocations_insert on public.resource_allocations;
drop policy if exists resource_allocations_update on public.resource_allocations;
drop policy if exists resource_allocations_delete on public.resource_allocations;

create policy resource_allocations_insert on public.resource_allocations
for insert to authenticated with check (app.can_manage_project(project_id));
create policy resource_allocations_update on public.resource_allocations
for update to authenticated
using (app.can_manage_project(project_id))
with check (app.can_manage_project(project_id));
create policy resource_allocations_delete on public.resource_allocations
for delete to authenticated using (app.can_manage_project(project_id));

-- Vínculos inativos permanecem históricos e não concedem leitura/escrita.
create or replace function app.can_read_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.is_portfolio_reader() then true
    else exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and (p.owner_id = auth.uid() or p.sponsor_id = auth.uid())
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id and m.profile_id = auth.uid()
         and m.status = 'ativo'
         and m.start_date <= current_date
         and (m.end_date is null or m.end_date >= current_date)
    )
  end;
$$;

create or replace function app.can_write_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.my_role() in ('viewer', 'auditor') then false
    when app.is_portfolio_manager() then true
    else exists (
      select 1 from public.projects p where p.id = p_project_id and p.owner_id = auth.uid()
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id and m.profile_id = auth.uid()
         and m.status = 'ativo'
         and m.start_date <= current_date
         and (m.end_date is null or m.end_date >= current_date)
         and m.can_edit and m.project_role in ('project_owner', 'collaborator')
    )
  end;
$$;

create or replace function app.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.is_portfolio_manager() then true
    else exists (
      select 1 from public.projects p where p.id = p_project_id and p.owner_id = auth.uid()
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id and m.profile_id = auth.uid()
         and m.status = 'ativo'
         and m.start_date <= current_date
         and (m.end_date is null or m.end_date >= current_date)
         and m.project_role = 'project_owner'
    )
  end;
$$;

-- Mantém as visões corporativas no mesmo cálculo vigente e apenas exclui
-- alocações canceladas, sem duplicar capacidade entre projetos.
create or replace view public.v_resource_capacity as
select
  pr.id as profile_id,
  pr.full_name,
  m.month as reference_month,
  round(pr.weekly_capacity_hours * 4.33, 2) as capacity_hours,
  round(coalesce(a.allocated_hours, 0), 2) as allocated_hours,
  case when pr.weekly_capacity_hours = 0 then 0
       else round(coalesce(a.allocated_hours, 0) * 100 / (pr.weekly_capacity_hours * 4.33), 2)
  end as allocation_pct,
  coalesce(a.project_count, 0) as project_count,
  ar.id as area_id,
  ar.name as area_name,
  bu.id as business_unit_id,
  bu.name as business_unit_name
from public.profiles pr
cross join lateral (
  select generate_series(
    date_trunc('month', current_date - interval '2 month'),
    date_trunc('month', current_date + interval '4 month'),
    interval '1 month'
  )::date as month
) m
left join lateral (
  select uaa.area_id
    from public.user_area_assignments uaa
   where uaa.user_id = pr.id and uaa.is_primary
     and uaa.valid_from <= (m.month + interval '1 month - 1 day')::date
     and (uaa.valid_to is null or uaa.valid_to >= m.month)
   order by uaa.valid_from desc limit 1
) ua on true
left join public.areas ar on ar.id = ua.area_id
left join public.business_units bu on bu.id = ar.business_unit_id
left join lateral (
  select
    sum(ra.allocated_hours * (
      (least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
       - greatest(ra.period_start, m.month) + 1)::numeric
      / nullif((ra.period_end - ra.period_start + 1), 0)
    )) as allocated_hours,
    count(distinct ra.project_id) as project_count
  from public.resource_allocations ra
  where ra.profile_id = pr.id
    and ra.status = 'ativa'
    and ra.period_start <= (m.month + interval '1 month - 1 day')::date
    and ra.period_end >= m.month
) a on true
where pr.active;

alter view public.v_resource_capacity set (security_invoker = on);
