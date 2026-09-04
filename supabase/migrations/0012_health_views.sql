-- =============================================================================
-- 0012 - Health score, visoes consolidadas e motor de alertas
-- =============================================================================

create table public.health_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  schedule_deviation_yellow numeric(5,2) not null default 5,
  schedule_deviation_red numeric(5,2) not null default 15,
  budget_deviation_yellow numeric(5,2) not null default 5,
  budget_deviation_red numeric(5,2) not null default 10,
  stale_update_days int not null default 14,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select app.attach_stamps('public.health_rules');

-- Tabela criada apos 0011: habilita RLS explicitamente.
alter table public.health_rules enable row level security;
create policy health_rules_read on public.health_rules for select to authenticated
  using (auth.uid() is not null);
create policy health_rules_write on public.health_rules for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

insert into public.health_rules (key) values ('default') on conflict do nothing;

-- Saude automatica: desvio de avanco, desvio financeiro, marco critico vencido
-- e risco critico sem plano de mitigacao.
create or replace function app.calc_project_health(p_project_id uuid)
returns app.health language plpgsql stable security definer set search_path = public, app as $$
declare
  r record; cfg record;
  v_schedule_dev numeric; v_budget_dev numeric;
  v_overdue_milestone int; v_unmitigated_critical int;
begin
  select * into cfg from public.health_rules where key = 'default';
  select p.*, f.budget, f.forecast into r
    from public.projects p
    left join public.v_project_financials f on f.project_id = p.id
   where p.id = p_project_id;

  if r is null then return 'cinza'; end if;
  if r.status in ('em_espera', 'cancelado') then return 'cinza'; end if;
  if r.status = 'concluido' then return 'verde'; end if;

  v_schedule_dev := greatest(0, coalesce(r.progress_planned, 0) - coalesce(r.progress_actual, 0));
  v_budget_dev := case when coalesce(r.budget, 0) = 0 then 0
                       else (coalesce(r.forecast, 0) - r.budget) * 100 / r.budget end;

  select count(*) into v_overdue_milestone
    from public.milestones m
   where m.project_id = p_project_id and m.is_critical
     and m.completed_at is null and m.due_date < current_date;

  select count(*) into v_unmitigated_critical
    from public.risks k
   where k.project_id = p_project_id and k.kind = 'risco'
     and k.score >= 15 and k.status in ('aberto', 'em_tratamento')
     and (k.mitigation_plan is null or k.strategy is null);

  if v_overdue_milestone > 0
     or v_unmitigated_critical > 0
     or v_schedule_dev >= cfg.schedule_deviation_red
     or v_budget_dev >= cfg.budget_deviation_red then
    return 'vermelho';
  end if;

  if v_schedule_dev >= cfg.schedule_deviation_yellow
     or v_budget_dev >= cfg.budget_deviation_yellow
     or exists (select 1 from public.risks k where k.project_id = p_project_id
                 and k.score >= 9 and k.status in ('aberto','em_tratamento'))
     or r.updated_at < now() - make_interval(days => cfg.stale_update_days) then
    return 'amarelo';
  end if;

  return 'verde';
end $$;

-- Recalcula a saude respeitando override manual (que exige justificativa).
create or replace function public.refresh_project_health(p_project_id uuid)
returns app.health language plpgsql security definer set search_path = public, app as $$
declare v_health app.health;
begin
  if not app.can_read_project(p_project_id) then
    raise exception 'Acesso negado ao projeto' using errcode = 'insufficient_privilege';
  end if;
  select case when p.health_is_manual then p.health else app.calc_project_health(p_project_id) end
    into v_health from public.projects p where p.id = p_project_id;

  update public.projects set health = v_health where id = p_project_id and health is distinct from v_health;
  return v_health;
end $$;
grant execute on function public.refresh_project_health(uuid) to authenticated;

-- Override manual de saude: exige justificativa e fica registrado na auditoria.
create or replace function public.override_project_health(
  p_project_id uuid, p_health app.health, p_reason text
) returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Somente Owner/PMO podem sobrepor a saude do projeto'
      using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'Justificativa obrigatoria (minimo 10 caracteres) para override de saude';
  end if;
  update public.projects
     set health = p_health,
         health_is_manual = true,
         health_override_reason = p_reason,
         health_overridden_by = auth.uid(),
         health_overridden_at = now()
   where id = p_project_id;
end $$;
grant execute on function public.override_project_health(uuid, app.health, text) to authenticated;

create or replace function public.clear_health_override(p_project_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Acesso negado' using errcode = 'insufficient_privilege';
  end if;
  update public.projects
     set health_is_manual = false, health_override_reason = null,
         health_overridden_by = null, health_overridden_at = null,
         health = app.calc_project_health(p_project_id)
   where id = p_project_id;
end $$;
grant execute on function public.clear_health_override(uuid) to authenticated;

-- =============================================================================
-- Visao consolidada de projeto (base do portfolio e da visao executiva)
-- =============================================================================
create or replace view public.v_project_overview as
select
  p.id,
  p.code,
  p.name,
  p.category,
  p.status,
  p.health,
  p.health_is_manual,
  p.priority,
  p.phase,
  p.portfolio_id,
  p.template_id,
  p.owner_id,
  p.sponsor_id,
  p.team_id,
  p.company_id,
  own.full_name as owner_name,
  spo.full_name as sponsor_name,
  tm.name as team_name,
  co.name as company_name,
  p.start_date,
  p.target_date,
  p.actual_end_date,
  p.progress_planned,
  p.progress_actual,
  round(p.progress_actual - p.progress_planned, 2) as progress_deviation,
  case when p.target_date is null or p.status in ('concluido','cancelado') then 0
       else greatest(0, current_date - p.target_date) end as days_overdue,
  fin.budget,
  fin.actual,
  fin.committed,
  fin.forecast,
  fin.remaining,
  fin.forecast_variance,
  fin.forecast_variance_pct,
  agg.critical_risks,
  agg.open_risks,
  agg.overdue_tasks,
  agg.open_tasks,
  agg.overdue_actions,
  agg.pending_decisions,
  nxt.next_milestone_name,
  nxt.next_milestone_date,
  p.updated_at as last_update_at,
  p.archived_at
from public.projects p
left join public.profiles own on own.id = p.owner_id
left join public.profiles spo on spo.id = p.sponsor_id
left join public.teams tm on tm.id = p.team_id
left join public.companies co on co.id = p.company_id
left join public.v_project_financials fin on fin.project_id = p.id
left join lateral (
  select
    (select count(*) from public.risks r where r.project_id = p.id and r.score >= 15 and r.status in ('aberto','em_tratamento')) as critical_risks,
    (select count(*) from public.risks r where r.project_id = p.id and r.status in ('aberto','em_tratamento')) as open_risks,
    (select count(*) from public.tasks t where t.project_id = p.id and t.due_date < current_date and t.status not in ('concluida','cancelada')) as overdue_tasks,
    (select count(*) from public.tasks t where t.project_id = p.id and t.status not in ('concluida','cancelada')) as open_tasks,
    (select count(*) from public.action_plans a where a.project_id = p.id and a.due_date < current_date and a.status not in ('concluida','cancelada')) as overdue_actions,
    (select count(*) from public.decisions d where d.project_id = p.id and d.status = 'aguardando_decisao') as pending_decisions
) agg on true
left join lateral (
  select m.name as next_milestone_name, m.due_date as next_milestone_date
    from public.milestones m
   where m.project_id = p.id and m.completed_at is null and m.due_date >= current_date
   order by m.due_date asc limit 1
) nxt on true;

alter view public.v_project_overview set (security_invoker = on);
grant select on public.v_project_overview to authenticated;

-- =============================================================================
-- Motor de alertas: gera notificacoes in-app a partir das regras configuradas
-- =============================================================================
create or replace function public.generate_alerts()
returns int language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0; v_days int;
begin
  if not app.is_portfolio_manager() then
    raise exception 'Somente Admin/PMO executam o motor de alertas'
      using errcode = 'insufficient_privilege';
  end if;

  -- Tarefas vencidas
  select coalesce(threshold_days, 0) into v_days from public.automation_rules where key = 'task_due_soon' and enabled;
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select t.assignee_id, t.project_id, 'task_overdue', 'alta',
         'Tarefa vencida: ' || t.title,
         'Prazo em ' || to_char(t.due_date, 'DD/MM/YYYY') || ' ainda nao concluida.',
         '/projetos/' || t.project_id || '/tarefas'
    from public.tasks t
   where t.assignee_id is not null
     and t.due_date < current_date
     and t.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = t.assignee_id and n.rule_key = 'task_overdue'
          and n.link like '%' || t.project_id || '%'
          and n.created_at > now() - interval '1 day'
     );
  get diagnostics v_count = row_count;

  -- Riscos criticos sem plano de mitigacao
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select coalesce(r.owner_id, p.owner_id), r.project_id, 'risk_critical_no_plan', 'critica',
         'Risco critico sem plano: ' || r.title,
         'Score ' || r.score || ' sem estrategia ou plano de mitigacao definido.',
         '/projetos/' || r.project_id || '/riscos'
    from public.risks r
    join public.projects p on p.id = r.project_id
   where r.score >= 15 and r.status in ('aberto','em_tratamento')
     and (r.mitigation_plan is null or r.strategy is null)
     and coalesce(r.owner_id, p.owner_id) is not null
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'risk_critical_no_plan' and n.project_id = r.project_id
          and n.created_at > now() - interval '3 days'
     );

  -- Planos de acao vencidos
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select a.owner_id, a.project_id, 'action_overdue', 'alta',
         'Plano de acao vencido: ' || a.title,
         'Prazo ' || to_char(a.due_date, 'DD/MM/YYYY') || ' expirado.',
         '/projetos/' || a.project_id || '/acoes'
    from public.action_plans a
   where a.owner_id is not null and a.due_date < current_date
     and a.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'action_overdue' and n.project_id = a.project_id
          and n.profile_id = a.owner_id and n.created_at > now() - interval '1 day'
     );

  return v_count;
end $$;
grant execute on function public.generate_alerts() to authenticated;

-- Recalculo em lote da saude do portfolio (uso por PMO / Edge Function agendada)
create or replace function public.refresh_all_health()
returns int language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0; r record;
begin
  if not app.is_portfolio_manager() then
    raise exception 'Acesso negado' using errcode = 'insufficient_privilege';
  end if;
  for r in select id from public.projects where archived_at is null and not health_is_manual loop
    update public.projects set health = app.calc_project_health(r.id) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
grant execute on function public.refresh_all_health() to authenticated;
