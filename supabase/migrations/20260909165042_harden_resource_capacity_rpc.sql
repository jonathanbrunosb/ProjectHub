-- Separa o calculo privilegiado interno do RPC exposto. O RPC exige gestao
-- do projeto e permanece SECURITY INVOKER; o trigger usa a funcao interna.
create or replace function app.calculate_resource_allocation_capacity(
  p_profile_id uuid, p_period_start date, p_period_end date,
  p_allocated_hours numeric, p_exclude_allocation_id uuid default null
)
returns table (
  capacity_hours numeric, current_hours numeric, requested_hours numeric,
  total_hours numeric, total_pct numeric, limit_pct numeric, overloaded boolean
)
language sql stable security definer set search_path = public, app as $$
  with person as (
    select p.weekly_capacity_hours, coalesce(a.max_allocation_pct, 100)::numeric as max_pct
    from public.profiles p left join public.areas a on a.id = p.area_id
    where p.id = p_profile_id
  ), existing as (
    select coalesce(sum(
      ra.allocated_hours *
      ((least(ra.period_end, p_period_end) - greatest(ra.period_start, p_period_start) + 1)::numeric /
       nullif((ra.period_end - ra.period_start + 1)::numeric, 0))
    ), 0)::numeric as hours
    from public.resource_allocations ra
    where ra.profile_id = p_profile_id and ra.status = 'ativa'
      and ra.period_start <= p_period_end and ra.period_end >= p_period_start
      and (p_exclude_allocation_id is null or ra.id <> p_exclude_allocation_id)
  ), totals as (
    select round((person.weekly_capacity_hours * ((p_period_end - p_period_start + 1)::numeric / 7)), 2) as cap,
           existing.hours as cur, greatest(coalesce(p_allocated_hours, 0), 0)::numeric as req,
           person.max_pct as max_pct
    from person cross join existing
  )
  select cap, cur, req, cur + req,
         round(case when cap > 0 then ((cur + req) / cap) * 100 else 0 end, 2),
         max_pct,
         case when cap > 0 then ((cur + req) / cap) * 100 > max_pct else cur + req > 0 end
  from totals;
$$;

revoke all on function app.calculate_resource_allocation_capacity(uuid, date, date, numeric, uuid)
from public, anon, authenticated;

create or replace function app.validate_project_resource_allocation()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_check record;
begin
  if new.status = 'cancelada' then return new; end if;
  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = new.project_id and pm.profile_id = new.profile_id
      and pm.status = 'ativo' and pm.start_date <= new.period_end
      and (pm.end_date is null or pm.end_date >= new.period_start)
  ) then
    raise exception 'O colaborador precisa ter vinculo ativo com o projeto no periodo da alocacao.';
  end if;
  select * into v_check from app.calculate_resource_allocation_capacity(
    new.profile_id, new.period_start, new.period_end, new.allocated_hours,
    case when tg_op = 'UPDATE' then new.id else null end
  );
  if v_check.overloaded and length(btrim(coalesce(new.overload_justification, ''))) < 10 then
    raise exception 'A alocacao ultrapassa a capacidade. Informe uma justificativa com pelo menos 10 caracteres.';
  end if;
  return new;
end;
$$;

drop function public.check_resource_allocation_capacity(uuid, date, date, numeric, uuid);

create function public.check_resource_allocation_capacity(
  p_project_id uuid, p_profile_id uuid, p_period_start date, p_period_end date,
  p_allocated_hours numeric, p_exclude_allocation_id uuid default null
)
returns table (
  capacity_hours numeric, current_hours numeric, requested_hours numeric,
  total_hours numeric, total_pct numeric, limit_pct numeric, overloaded boolean
)
language plpgsql stable security invoker set search_path = public, app as $$
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Sem permissao para verificar ou registrar recursos neste projeto.';
  end if;
  return query select * from app.calculate_resource_allocation_capacity(
    p_profile_id, p_period_start, p_period_end, p_allocated_hours, p_exclude_allocation_id
  );
end;
$$;

revoke all on function public.check_resource_allocation_capacity(uuid, uuid, date, date, numeric, uuid)
from public, anon;
grant execute on function public.check_resource_allocation_capacity(uuid, uuid, date, date, numeric, uuid)
to authenticated;
