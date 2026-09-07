-- =============================================================================
-- 0022 - Area substitui Equipe: uma unica unidade organizacional
-- =============================================================================
--
-- Contexto: a 0020 criou `areas` como filha de `business_units` (Gerencia) mas
-- deixou `teams` de pe em paralelo, e a Etapa 3 ainda criou uma ponte
-- (teams.area_id) com aviso de divergencia entre os dois campos. Precisar
-- sincronizar e avisar sobre inconsistencia e' o sintoma classico de duas
-- entidades representando a mesma coisa.
--
-- Modelo definitivo:
--
--   business_units (Gerencia)
--         └── areas
--               └── profiles
--
-- Nao existe mais nivel intermediario. `areas` absorve o papel de `teams`.
--
-- Momento: PRD esta vazio (0 equipes, 0 projetos, 0 alocacoes) e QA so' tem
-- seed ficticio. Nenhum dado real corre risco - por isso a migracao e a
-- remocao acontecem juntas, sem janela de convivencia entre duas entidades
-- equivalentes.
--
-- Ainda assim a migracao e' escrita para preservar dados de verdade: se
-- houvesse equipes reais, cada uma viraria uma Area com nome, gestor, limite
-- de alocacao e situacao preservados, e os vinculos de pessoas e projetos
-- seriam repontuados - nada seria descartado.

-- -----------------------------------------------------------------------------
-- 1. `areas` absorve a configuracao de governanca que vinha de `teams`
-- -----------------------------------------------------------------------------
-- max_allocation_pct e' o limite que dispara o alerta de sobrecarga em
-- Recursos & Capacidade. Perder isso seria regressao de governanca.
-- weekly_capacity_hours NAO vem junto de proposito: era um total denormalizado
-- so' de exibicao - a capacidade real sempre veio de profiles.weekly_capacity_hours.
alter table public.areas
  add column max_allocation_pct numeric(5,2) not null default 100;

alter table public.areas
  add constraint areas_alloc_ck check (max_allocation_pct > 0 and max_allocation_pct <= 200);

-- -----------------------------------------------------------------------------
-- 2. Area responsavel do projeto (substitui projects.team_id)
-- -----------------------------------------------------------------------------
-- Um projeto continua podendo envolver pessoas de varias areas - essas sao
-- derivadas das alocacoes. Este campo e' so' "quem responde pelo projeto".
alter table public.projects
  add column area_id uuid references public.areas(id) on delete set null;
create index projects_area_idx on public.projects(area_id);

-- -----------------------------------------------------------------------------
-- 3. Migracao de dados: cada equipe vira (ou aponta para) uma Area
-- -----------------------------------------------------------------------------
do $$
declare
  v_team record;
  v_area_id uuid;
  v_bu uuid;
  v_placeholder uuid;
  v_base text;
  v_code text;
  v_i int;
begin
  for v_team in select * from public.teams order by name loop

    if v_team.area_id is not null then
      -- A ponte criada na Etapa 3 ja dizia qual Area representa esta equipe.
      v_area_id := v_team.area_id;
    else
      -- Gerencia da nova Area: inferida da maioria dos membros que ja tem
      -- gerencia definida. Usa sinal real quando existe, em vez de chutar.
      select p.business_unit_id into v_bu
        from public.profiles p
       where p.primary_team_id = v_team.id
         and p.business_unit_id is not null
       group by p.business_unit_id
       order by count(*) desc, p.business_unit_id
       limit 1;

      if v_bu is null then
        -- Sem nenhum sinal nos dados: em vez de inventar uma hierarquia falsa
        -- em silencio, pendura numa Gerencia claramente marcada para
        -- saneamento administrativo (mesmo padrao dos colaboradores sem area).
        select id into v_placeholder from public.business_units where code = 'A-DEFINIR';
        if v_placeholder is null then
          insert into public.business_units (company_id, code, name)
          values (
            (select id from public.companies order by code limit 1),
            'A-DEFINIR',
            'Gerencia a definir (migracao de equipes)'
          )
          returning id into v_placeholder;
        end if;
        v_bu := v_placeholder;
      end if;

      -- Codigo unico dentro da Gerencia, derivado do nome da equipe.
      v_base := upper(left(regexp_replace(v_team.name, '[^a-zA-Z0-9]+', '', 'g'), 12));
      if length(v_base) < 2 then v_base := 'AREA'; end if;
      v_code := v_base;
      v_i := 1;
      while exists (
        select 1 from public.areas a where a.business_unit_id = v_bu and a.code = v_code
      ) loop
        v_i := v_i + 1;
        v_code := left(v_base, 10) || '-' || v_i::text;
      end loop;

      insert into public.areas (
        business_unit_id, code, name, manager_user_id, is_active, max_allocation_pct
      ) values (
        v_bu, v_code, v_team.name, v_team.manager_id, v_team.active, v_team.max_allocation_pct
      )
      returning id into v_area_id;
    end if;

    -- Projetos que respondiam pela equipe passam a responder pela Area.
    update public.projects set area_id = v_area_id where team_id = v_team.id;

    -- Pessoas da equipe ganham vinculo de Area, com historico (os gatilhos da
    -- 0020 fecham vinculo anterior e sincronizam profiles.area_id).
    insert into public.user_area_assignments (user_id, area_id, valid_from)
    select p.id, v_area_id, current_date
      from public.profiles p
     where p.primary_team_id = v_team.id
       and p.area_id is null
       and not exists (
         select 1 from public.user_area_assignments u
          where u.user_id = p.id and u.is_primary and u.valid_to is null
       );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Views sao recriadas sem Equipe (precisa vir antes de dropar as colunas)
-- -----------------------------------------------------------------------------
drop view if exists public.v_project_overview;
drop view if exists public.v_resource_capacity;

-- -----------------------------------------------------------------------------
-- 5. Colunas e tabelas que deixam de existir
-- -----------------------------------------------------------------------------
-- A area de uma alocacao e' derivavel do vinculo da pessoa no periodo (e' assim
-- que a view de capacidade calcula). Recriar como area_id reintroduziria a
-- duplicacao que esta migration existe para eliminar.
alter table public.resource_allocations drop column team_id;

-- team_memberships nunca teve uso na aplicacao (zero referencias no frontend):
-- o vinculo da pessoa e' profiles.area_id + historico em user_area_assignments.
drop table public.team_memberships;

alter table public.profiles drop column primary_team_id;
alter table public.projects drop column team_id;
drop table public.teams;

-- -----------------------------------------------------------------------------
-- 6. v_project_overview: Equipe da lugar a Area (+ Gerencia, para os filtros)
-- -----------------------------------------------------------------------------
create view public.v_project_overview as
select
  p.id, p.code, p.name, p.category, p.status, p.health, p.health_is_manual,
  p.priority, p.phase, p.portfolio_id, p.template_id, p.owner_id, p.sponsor_id,
  p.area_id, p.company_id,
  own.full_name as owner_name,
  spo.full_name as sponsor_name,
  ar.name as area_name,
  bu.id as business_unit_id,
  bu.name as business_unit_name,
  co.name as company_name,
  p.start_date, p.target_date, p.actual_end_date,
  p.progress_planned, p.progress_actual,
  round(p.progress_actual - p.progress_planned, 2) as progress_deviation,
  case
    when p.target_date is null or (p.status = any (array['concluido'::app.project_status, 'cancelado'::app.project_status])) then 0
    else greatest(0, current_date - p.target_date)
  end as days_overdue,
  fin.budget, fin.actual, fin.committed, fin.forecast, fin.remaining,
  fin.forecast_variance, fin.forecast_variance_pct,
  agg.critical_risks, agg.open_risks, agg.overdue_tasks, agg.open_tasks,
  agg.overdue_actions, agg.pending_decisions,
  nxt.next_milestone_name, nxt.next_milestone_date,
  p.updated_at as last_update_at,
  p.archived_at,
  p.financial_module_mode,
  case p.financial_module_mode
    when 'enabled' then true
    when 'disabled' then false
    else coalesce((select system_settings.financial_module_enabled from system_settings limit 1), true)
  end as financial_effective_enabled,
  coalesce(pgs.enabled, false) as goal_indicator_enabled,
  gi.indicator_realized as goal_indicator_realized,
  gi.indicator_projected as goal_indicator_projected,
  gi.deliveries_pending as goal_deliveries_pending
from public.projects p
  left join public.profiles own on own.id = p.owner_id
  left join public.profiles spo on spo.id = p.sponsor_id
  left join public.areas ar on ar.id = p.area_id
  left join public.business_units bu on bu.id = ar.business_unit_id
  left join public.companies co on co.id = p.company_id
  left join public.v_project_financials fin on fin.project_id = p.id
  left join public.project_goal_settings pgs on pgs.project_id = p.id
  left join public.v_project_goal_indicator gi on gi.project_id = p.id
  left join lateral (
    select
      (select count(*) from public.risks r where r.project_id = p.id and r.score >= 15
         and (r.status = any (array['aberto'::app.risk_status, 'em_tratamento'::app.risk_status]))) as critical_risks,
      (select count(*) from public.risks r where r.project_id = p.id
         and (r.status = any (array['aberto'::app.risk_status, 'em_tratamento'::app.risk_status]))) as open_risks,
      (select count(*) from public.tasks t where t.project_id = p.id and t.due_date < current_date
         and (t.status <> all (array['concluida'::app.task_status, 'cancelada'::app.task_status]))) as overdue_tasks,
      (select count(*) from public.tasks t where t.project_id = p.id
         and (t.status <> all (array['concluida'::app.task_status, 'cancelada'::app.task_status]))) as open_tasks,
      (select count(*) from public.action_plans a where a.project_id = p.id and a.due_date < current_date
         and (a.status <> all (array['concluida'::app.action_status, 'cancelada'::app.action_status]))) as overdue_actions,
      (select count(*) from public.decisions d where d.project_id = p.id
         and d.status = 'aguardando_decisao'::app.decision_status) as pending_decisions
  ) agg on true
  left join lateral (
    select m.name as next_milestone_name, m.due_date as next_milestone_date
      from public.milestones m
     where m.project_id = p.id and m.completed_at is null and m.due_date >= current_date
     order by m.due_date
     limit 1
  ) nxt on true;

alter view public.v_project_overview set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- 7. v_resource_capacity: mesma formula, sem as colunas de Equipe
-- -----------------------------------------------------------------------------
create view public.v_resource_capacity as
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
   where uaa.user_id = pr.id
     and uaa.is_primary
     and uaa.valid_from <= (m.month + interval '1 month - 1 day')::date
     and (uaa.valid_to is null or uaa.valid_to >= m.month)
   order by uaa.valid_from desc
   limit 1
) ua on true
left join public.areas ar on ar.id = ua.area_id
left join public.business_units bu on bu.id = ar.business_unit_id
left join lateral (
  select
    sum(
      ra.allocated_hours
      * (
          (least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
           - greatest(ra.period_start, m.month) + 1)::numeric
          / nullif((ra.period_end - ra.period_start + 1), 0)
        )
    ) as allocated_hours,
    count(distinct ra.project_id) as project_count
  from public.resource_allocations ra
  where ra.profile_id = pr.id
    and ra.period_start <= (m.month + interval '1 month - 1 day')::date
    and ra.period_end >= m.month
) a on true
where pr.active;

alter view public.v_resource_capacity set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- 8. create_project_from_template: p_team_id vira p_area_id
-- -----------------------------------------------------------------------------
-- Trocar o nome de um parametro exige recriar a funcao (CREATE OR REPLACE
-- recusa renomear parametro de entrada).
drop function if exists public.create_project_from_template(
  uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric, text
);

create function public.create_project_from_template(
  p_template_id uuid,
  p_code text,
  p_name text,
  p_start_date date,
  p_target_date date default null,
  p_owner_id uuid default null,
  p_sponsor_id uuid default null,
  p_company_id uuid default null,
  p_area_id uuid default null,
  p_category text default null,
  p_priority app.priority default 'media',
  p_budget numeric default null,
  p_financial_module_mode text default null
) returns uuid
language plpgsql security definer set search_path = public, app
as $function$
declare
  v_project_id uuid;
  v_tpl record;
  v_phase record;
  v_task record;
  v_phase_map jsonb := '{}'::jsonb;
  v_new_phase_id uuid;
  v_task_id uuid;
  v_seq int := 0;
  v_financial_mode text;
begin
  if not (app.is_portfolio_manager() or app.my_role() = 'project_owner') then
    raise exception 'Sem permissao para criar projetos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tpl from public.project_templates where id = p_template_id;

  v_financial_mode := coalesce(p_financial_module_mode, v_tpl.financial_module_default, 'inherit');
  if v_financial_mode not in ('inherit', 'enabled', 'disabled') then
    v_financial_mode := 'inherit';
  end if;

  insert into public.projects (
    code, name, template_id, category, priority, status,
    owner_id, sponsor_id, company_id, area_id,
    start_date, target_date, baseline_start_date, baseline_target_date,
    progress_method, evm_enabled, financial_module_mode, created_by, updated_by
  ) values (
    upper(p_code), p_name, p_template_id,
    coalesce(p_category, v_tpl.category, 'Outros'), p_priority, 'planejamento',
    coalesce(p_owner_id, auth.uid()), p_sponsor_id, p_company_id, p_area_id,
    p_start_date, p_target_date, p_start_date, p_target_date,
    coalesce(v_tpl.default_progress_method, 'automatico'), coalesce(v_tpl.evm_enabled, false),
    v_financial_mode,
    auth.uid(), auth.uid()
  ) returning id into v_project_id;

  insert into public.project_members (project_id, profile_id, project_role, can_edit, created_by, updated_by)
  values (v_project_id, coalesce(p_owner_id, auth.uid()), 'project_owner', true, auth.uid(), auth.uid())
  on conflict do nothing;

  if p_budget is not null then
    insert into public.project_budgets (project_id, revision, amount, effective_from, is_current, created_by, updated_by)
    values (v_project_id, 0, p_budget, coalesce(p_start_date, current_date), true, auth.uid(), auth.uid());
  end if;

  if p_template_id is null then
    return v_project_id;
  end if;

  for v_phase in
    select * from public.template_phases where template_id = p_template_id order by position
  loop
    insert into public.project_phases (project_id, name, position, weight, created_by, updated_by)
    values (v_project_id, v_phase.name, v_phase.position, v_phase.weight, auth.uid(), auth.uid())
    returning id into v_new_phase_id;
    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
  end loop;

  for v_task in
    select * from public.template_tasks where template_id = p_template_id order by position
  loop
    v_seq := v_seq + 1;
    insert into public.tasks (
      project_id, phase_id, code, title, description, weight, position,
      start_date, due_date, baseline_due_date, is_milestone, created_by, updated_by
    ) values (
      v_project_id,
      nullif(v_phase_map ->> v_task.template_phase_id::text, '')::uuid,
      'T' || lpad(v_seq::text, 3, '0'),
      v_task.title, v_task.description, v_task.weight, v_task.position,
      coalesce(p_start_date, current_date) + v_task.offset_start_days,
      coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
      coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
      v_task.is_milestone, auth.uid(), auth.uid()
    ) returning id into v_task_id;

    if v_task.is_milestone then
      insert into public.milestones (project_id, task_id, name, due_date, baseline_date, is_critical, created_by, updated_by)
      values (
        v_project_id, v_task_id, v_task.title,
        coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
        coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
        true, auth.uid(), auth.uid()
      );
    end if;
  end loop;

  perform app.refresh_project_progress(v_project_id);
  return v_project_id;
end $function$;

revoke all on function public.create_project_from_template(
  uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric, text
) from public;
grant execute on function public.create_project_from_template(
  uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric, text
) to authenticated;
