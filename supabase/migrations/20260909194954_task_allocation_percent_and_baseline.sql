-- Fase 2 (parte 1) do calculo automatico de alocacao: rateio por percentual
-- customizavel por responsavel de tarefa, e baseline de horas por tarefa.

-- --- Rateio customizavel --------------------------------------------------
-- Percentual de participacao de cada responsavel na tarefa. Nulo = sem
-- percentual definido para aquele responsavel; a view so' usa percentual
-- customizado quando TODOS os responsaveis da tarefa tiverem um valor e a
-- soma fechar em 100% (tolerancia de 0.5pp) - caso contrario, cai no rateio
-- igualitario (mesmo comportamento da Fase 1). Isso implementa a secao 5/6
-- do pedido sem exigir que toda tarefa tenha percentual preenchido.
alter table public.tasks
  add column if not exists assignee_allocation_percent numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_assignee_allocation_pct_ck'
  ) then
    alter table public.tasks
      add constraint tasks_assignee_allocation_pct_ck
      check (assignee_allocation_percent is null or (assignee_allocation_percent > 0 and assignee_allocation_percent <= 100));
  end if;
end $$;

alter table public.task_corresponsibles
  add column if not exists allocation_percent numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_corresponsibles'::regclass and conname = 'task_corresponsibles_allocation_pct_ck'
  ) then
    alter table public.task_corresponsibles
      add constraint task_corresponsibles_allocation_pct_ck
      check (allocation_percent is null or (allocation_percent > 0 and allocation_percent <= 100));
  end if;
end $$;

-- --- Baseline de horas por tarefa -----------------------------------------
-- Espelha o baseline_due_date ja existente (capturado uma unica vez, nunca
-- sobrescrito por edicoes posteriores da estimativa) - secao 19 do pedido.
alter table public.tasks
  add column if not exists baseline_estimated_hours numeric(8,2);

-- app.tasks_progress_sync ja e' o trigger BEFORE INSERT OR UPDATE de tasks
-- (normaliza progresso a partir do status) - reaproveitado aqui em vez de
-- criar um segundo trigger so' para o baseline.
create or replace function app.tasks_progress_sync()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_project uuid := coalesce(new.project_id, old.project_id);
begin
  if tg_op = 'INSERT' then
    new.baseline_estimated_hours := coalesce(new.baseline_estimated_hours, new.estimated_hours);
  end if;
  -- normaliza progresso a partir do status
  if tg_op in ('INSERT', 'UPDATE') then
    if new.status = 'concluida' then
      new.progress := 100;
      new.completed_at := coalesce(new.completed_at, current_date);
    elsif new.status = 'nao_iniciada' and coalesce(new.progress, 0) = 0 then
      new.completed_at := null;
    end if;
  end if;
  perform app.refresh_project_progress(v_project);
  return coalesce(new, old);
end $$;

-- Backfill: tarefas ja existentes sem baseline recebem o valor atual como
-- ponto de partida (nao ha como recuperar o valor "original" retroativamente -
-- e' a mesma limitacao que baseline_due_date sempre teve para tarefas
-- criadas fora de um template).
update public.tasks set baseline_estimated_hours = estimated_hours where baseline_estimated_hours is null;

-- --- View recalculada com rateio customizavel e baseline -----------------
-- drop+create (nao create or replace): a ordem das colunas muda em relacao
-- a Fase 1, o que create or replace nao permite.
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
  -- reflete o percentual EFETIVAMENTE aplicado (nunca o valor bruto salvo
  -- quando o rateio cai no fallback igualitario, o que confundiria a UI).
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
