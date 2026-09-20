-- =============================================================================
-- Recupera a view v_task_planned_allocation, aplicada em QA fora do controle
-- de versao (via MCP apply_migration) e nunca commitada como arquivo.
-- Conteudo capturado direto de supabase_migrations.schema_migrations em QA
-- (versao original 20260909195349) para fechar a divergencia entre o schema
-- real do banco e o historico versionado no repositorio.
-- =============================================================================

drop view if exists public.v_task_planned_allocation;
create view public.v_task_planned_allocation as
with responsible as (
  select t.id as task_id, t.project_id, t.assignee_id as profile_id,
         t.assignee_allocation_percent as custom_percent
  from public.tasks t
  where t.assignee_id is not null
  union all
  select t.id as task_id, t.project_id, tc.profile_id,
         tc.allocation_percent as custom_percent
  from public.tasks t
  join public.task_corresponsibles tc on tc.task_id = t.id
),
responsible_count as (
  select
    task_id,
    count(*) as n,
    count(*) filter (where custom_percent is not null) as n_with_percent,
    sum(custom_percent) as percent_sum
  from responsible
  group by task_id
),
base as (
  select
    t.id as task_id,
    t.project_id,
    t.code,
    t.title,
    t.status,
    t.estimated_hours,
    t.baseline_estimated_hours,
    coalesce(t.start_date, t.due_date) as period_start,
    t.due_date as period_end
  from public.tasks t
  where t.status <> 'cancelada'
    and t.estimated_hours is not null
    and t.estimated_hours > 0
    and t.due_date is not null
)
select
  b.task_id,
  b.project_id,
  b.code,
  b.title,
  b.status,
  r.profile_id,
  rc.n as responsible_count,
  (rc.n_with_percent = rc.n and rc.percent_sum between 99.5 and 100.5) as uses_custom_percent,
  case
    when rc.n_with_percent = rc.n and rc.percent_sum between 99.5 and 100.5
      then round(r.custom_percent, 2)
    else round(100.0 / rc.n, 2)
  end as allocation_percent,
  case
    when rc.n_with_percent = rc.n and rc.percent_sum between 99.5 and 100.5
      then round(b.estimated_hours * r.custom_percent / 100, 2)
    else round(b.estimated_hours / rc.n, 2)
  end as planned_hours,
  case
    when b.baseline_estimated_hours is null then null
    when rc.n_with_percent = rc.n and rc.percent_sum between 99.5 and 100.5
      then round(b.baseline_estimated_hours * r.custom_percent / 100, 2)
    else round(b.baseline_estimated_hours / rc.n, 2)
  end as baseline_planned_hours,
  b.period_start,
  b.period_end,
  greatest(app.count_business_days_inclusive(b.period_start, b.period_end), 1) as business_days
from base b
join responsible r on r.task_id = b.task_id
join responsible_count rc on rc.task_id = b.task_id;

alter view public.v_task_planned_allocation set (security_invoker = on);
