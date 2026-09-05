-- =============================================================================
-- 0017 - Indicadores de Metas: nota de aderencia a prazo das entregas
--
-- Converte prazo planejado x data real de conclusao das tarefas em uma nota de
-- 1 a 15 (Racional minimo / Meta / Desafio), sem criar uma base paralela de
-- entregas - o modulo consome `tasks` diretamente. Duas tabelas de config:
--   1. project_goal_settings - regra padrao do projeto (habilitado, base de
--      dias, dias de desafio/racional minimo, notas de referencia, modo de peso).
--   2. task_goal_config - por tarefa: participa ou nao, peso, baseline (data
--      protegida contra reprogramacao) e override pontual de desafio/racional.
--
-- Feriados/dias uteis nao existiam no schema ate aqui - `holidays` e as
-- funcoes app.is_business_day/app.business_days_between sao criados do zero.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Feriados corporativos (cadastro global, igual ao padrao de companies/teams)
-- -----------------------------------------------------------------------------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint holidays_date_uk unique (date)
);
select app.attach_stamps('public.holidays');
select app.attach_audit('public.holidays');

alter table public.holidays enable row level security;
create policy holidays_read on public.holidays for select to authenticated
  using (auth.uid() is not null);
create policy holidays_write on public.holidays for insert to authenticated
  with check (app.is_portfolio_manager());
create policy holidays_update on public.holidays for update to authenticated
  using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());
create policy holidays_delete on public.holidays for delete to authenticated
  using (app.is_portfolio_manager());

-- -----------------------------------------------------------------------------
-- Dias uteis: fim de semana (ISO dow 6=sabado, 7=domingo) + feriados ativos.
-- -----------------------------------------------------------------------------
create or replace function app.is_business_day(p_date date)
returns boolean language sql stable as $$
  select extract(isodow from p_date) < 6
     and not exists (select 1 from public.holidays h where h.date = p_date and h.active);
$$;
grant execute on function app.is_business_day(date) to authenticated;

-- Dias uteis entre duas datas: positivo quando p_to > p_from (atraso), negativo
-- quando p_to < p_from (antecipacao), 0 quando iguais. Conta apenas os dias
-- uteis no intervalo aberto-fechado (p_from, p_to] (ou o espelho quando invertido) -
-- e' por isso que sexta -> segunda da' 1 (so a segunda conta), nao 3.
create or replace function app.business_days_between(p_from date, p_to date)
returns int language plpgsql stable as $$
declare v_sign int := 1; v_a date; v_b date; v_count int := 0; v_d date;
begin
  if p_from is null or p_to is null then return null; end if;
  if p_to = p_from then return 0; end if;
  if p_to < p_from then v_sign := -1; v_a := p_to; v_b := p_from;
  else v_a := p_from; v_b := p_to;
  end if;
  v_d := v_a;
  while v_d < v_b loop
    v_d := v_d + 1;
    if app.is_business_day(v_d) then v_count := v_count + 1; end if;
  end loop;
  return v_count * v_sign;
end $$;
grant execute on function app.business_days_between(date, date) to authenticated;

create or replace function app.calendar_days_between(p_from date, p_to date)
returns int language sql immutable as $$
  select case when p_from is null or p_to is null then null else p_to - p_from end;
$$;
grant execute on function app.calendar_days_between(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Funcao central de calculo da nota (unica formula - nunca duplicar no cliente
-- para o resultado oficial). Interpolacao linear:
--   diff <= 0 (antecipado/no prazo): nota = meta + (desafio-meta) * min(-diff,challenge_days)/challenge_days
--   diff >  0 (atrasado):            nota = meta - (meta-minimo) * min(diff,minimum_days)/minimum_days
-- sempre limitada a [minimo, desafio].
-- -----------------------------------------------------------------------------
create or replace function app.calc_delivery_score(
  p_target_date date, p_actual_date date, p_challenge_days int, p_minimum_days int,
  p_day_basis text, p_challenge_score numeric, p_target_score numeric, p_minimum_score numeric
) returns numeric language plpgsql stable as $$
declare v_diff int; v_score numeric;
begin
  if p_target_date is null or p_actual_date is null then return null; end if;

  v_diff := case when p_day_basis = 'uteis'
    then app.business_days_between(p_target_date, p_actual_date)
    else app.calendar_days_between(p_target_date, p_actual_date)
  end;

  if v_diff <= 0 then
    if p_challenge_days is null or p_challenge_days <= 0 then
      v_score := p_target_score;
    else
      v_score := p_target_score
        + (p_challenge_score - p_target_score) * (least(-v_diff, p_challenge_days)::numeric / p_challenge_days);
    end if;
    v_score := least(v_score, p_challenge_score);
  else
    if p_minimum_days is null or p_minimum_days <= 0 then
      v_score := p_minimum_score;
    else
      v_score := p_target_score
        - (p_target_score - p_minimum_score) * (least(v_diff, p_minimum_days)::numeric / p_minimum_days);
    end if;
    v_score := greatest(v_score, p_minimum_score);
  end if;

  return round(v_score, 2);
end $$;
grant execute on function app.calc_delivery_score(date, date, int, int, text, numeric, numeric, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Quem gerencia o indicador de metas: Admin, PMO ou Sponsor (mesmo mapeamento
-- de "Gerencia" usado no modulo financeiro - RoleKey nao tem um valor dedicado).
-- -----------------------------------------------------------------------------
create or replace function app.can_manage_goal_indicator()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() in ('admin', 'pmo', 'sponsor'), false);
$$;
grant execute on function app.can_manage_goal_indicator() to authenticated;

-- -----------------------------------------------------------------------------
-- Configuracao do indicador por projeto
-- -----------------------------------------------------------------------------
create table public.project_goal_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  day_basis text not null default 'uteis'
    constraint project_goal_settings_day_basis_ck check (day_basis in ('uteis', 'corridos')),
  challenge_days int not null default 2 constraint project_goal_settings_challenge_days_ck check (challenge_days > 0),
  minimum_days int not null default 5 constraint project_goal_settings_minimum_days_ck check (minimum_days > 0),
  challenge_score numeric(5,2) not null default 15,
  target_score numeric(5,2) not null default 10,
  minimum_score numeric(5,2) not null default 1,
  weight_mode text not null default 'igual'
    constraint project_goal_settings_weight_mode_ck check (weight_mode in ('igual', 'manual')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select app.attach_stamps('public.project_goal_settings');
select app.attach_audit('public.project_goal_settings');

alter table public.project_goal_settings enable row level security;
create policy pgs_read on public.project_goal_settings for select to authenticated
  using (app.can_read_project(project_id));
create policy pgs_write on public.project_goal_settings for insert to authenticated
  with check (app.can_manage_goal_indicator());
create policy pgs_update on public.project_goal_settings for update to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());
create policy pgs_delete on public.project_goal_settings for delete to authenticated
  using (app.can_manage_goal_indicator());

-- -----------------------------------------------------------------------------
-- Configuracao do indicador por tarefa/entrega
--
-- baseline_date nula = "Data Meta" segue devido `tasks.due_date` ao vivo; uma
-- vez congelada (setada explicitamente), reprogramar o prazo no cronograma nao
-- move mais a meta do indicador - e' o mecanismo anti-manipulacao do item 27/28.
--
-- override_score permite o ajuste manual do item 51/52 - sempre com
-- justificativa e sempre auditado (a tabela ja tem app.attach_audit).
-- -----------------------------------------------------------------------------
create table public.task_goal_config (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  included boolean not null default false,
  weight numeric(6,2) not null default 0 constraint task_goal_config_weight_ck check (weight >= 0),
  baseline_date date,
  challenge_days_override int constraint task_goal_config_challenge_override_ck check (challenge_days_override is null or challenge_days_override > 0),
  minimum_days_override int constraint task_goal_config_minimum_override_ck check (minimum_days_override is null or minimum_days_override > 0),
  override_score numeric(5,2),
  override_reason text,
  override_by uuid references public.profiles(id) on delete set null,
  override_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint task_goal_config_override_reason_ck check (
    override_score is null or (override_reason is not null and char_length(trim(override_reason)) >= 10)
  )
);
select app.attach_stamps('public.task_goal_config');
select app.attach_audit('public.task_goal_config');

alter table public.task_goal_config enable row level security;
create policy tgc_read on public.task_goal_config for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and app.can_read_project(t.project_id)));
create policy tgc_write on public.task_goal_config for insert to authenticated
  with check (app.can_manage_goal_indicator());
create policy tgc_update on public.task_goal_config for update to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());
create policy tgc_delete on public.task_goal_config for delete to authenticated
  using (app.can_manage_goal_indicator());

-- -----------------------------------------------------------------------------
-- v_task_goal_scores: nota realizada e projetada por tarefa, ja resolvendo a
-- cascata projeto -> override da tarefa. So' inclui tarefas marcadas como
-- "Compoe Indicador de Meta = Sim" (included) de projetos com o indicador ativo.
-- -----------------------------------------------------------------------------
create or replace view public.v_task_goal_scores as
select
  t.id as task_id,
  t.project_id,
  t.code,
  t.title,
  t.phase_id,
  t.assignee_id,
  gc.weight,
  coalesce(gc.baseline_date, t.due_date) as target_date,
  t.due_date as current_due_date,
  (gc.baseline_date is not null and gc.baseline_date is distinct from t.due_date) as baseline_frozen,
  t.completed_at as actual_date,
  coalesce(gc.challenge_days_override, s.challenge_days) as challenge_days,
  coalesce(gc.minimum_days_override, s.minimum_days) as minimum_days,
  s.day_basis,
  s.challenge_score,
  s.target_score,
  s.minimum_score,
  gc.override_score,
  gc.override_reason,
  (gc.override_score is not null) as is_override,
  coalesce(
    gc.override_score,
    app.calc_delivery_score(
      coalesce(gc.baseline_date, t.due_date), t.completed_at,
      coalesce(gc.challenge_days_override, s.challenge_days),
      coalesce(gc.minimum_days_override, s.minimum_days),
      s.day_basis, s.challenge_score, s.target_score, s.minimum_score
    )
  ) as score_realized,
  coalesce(
    gc.override_score,
    app.calc_delivery_score(
      coalesce(gc.baseline_date, t.due_date), coalesce(t.completed_at, current_date),
      coalesce(gc.challenge_days_override, s.challenge_days),
      coalesce(gc.minimum_days_override, s.minimum_days),
      s.day_basis, s.challenge_score, s.target_score, s.minimum_score
    )
  ) as score_projected
from public.tasks t
join public.project_goal_settings s on s.project_id = t.project_id and s.enabled
join public.task_goal_config gc on gc.task_id = t.id and gc.included;

alter view public.v_task_goal_scores set (security_invoker = on);
grant select on public.v_task_goal_scores to authenticated;

-- -----------------------------------------------------------------------------
-- v_project_goal_indicator: media ponderada por projeto.
--
-- Indicador Realizado considera so' as entregas concluidas (renormalizado pelo
-- peso das concluidas) - e' a leitura "o que ja foi entregue rendeu quanto".
-- Indicador Projetado usa o conjunto completo de entregas incluidas (pendentes
-- entram com a nota projetada) - e' a leitura "se nada mudar, fecha quanto".
-- Modo de peso 'igual' distribui 100%/quantidade de entregas dinamicamente, sem
-- reescrever o peso salvo de cada tarefa.
-- -----------------------------------------------------------------------------
create or replace view public.v_project_goal_indicator as
with base as (
  select
    v.*,
    s.weight_mode,
    count(*) over (partition by v.project_id) as included_count,
    sum(v.weight) over (partition by v.project_id) as weight_sum
  from public.v_task_goal_scores v
  join public.project_goal_settings s on s.project_id = v.project_id
),
eff as (
  select *,
    case
      when weight_mode = 'igual' or coalesce(weight_sum, 0) = 0
        then 100.0 / nullif(included_count, 0)
      else weight
    end as effective_weight
  from base
)
select
  project_id,
  count(*) as deliveries_total,
  count(*) filter (where score_realized is not null) as deliveries_done,
  count(*) filter (where score_realized is null) as deliveries_pending,
  round(sum(effective_weight) filter (where score_realized is not null), 2) as weight_done_sum,
  round(sum(effective_weight), 2) as weight_total_sum,
  round(
    sum(score_realized * effective_weight) filter (where score_realized is not null)
    / nullif(sum(effective_weight) filter (where score_realized is not null), 0)
  , 2) as indicator_realized,
  round(
    sum(score_projected * effective_weight) / nullif(sum(effective_weight), 0)
  , 2) as indicator_projected
from eff
group by project_id;

alter view public.v_project_goal_indicator set (security_invoker = on);
grant select on public.v_project_goal_indicator to authenticated;

-- -----------------------------------------------------------------------------
-- v_project_overview: acrescenta o indicador de metas (colunas novas ao final,
-- mesma regra da 0016 - `create or replace view` proibe reordenar colunas).
-- -----------------------------------------------------------------------------
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
  p.archived_at,
  p.financial_module_mode,
  case p.financial_module_mode
    when 'enabled' then true
    when 'disabled' then false
    else coalesce((select financial_module_enabled from public.system_settings limit 1), true)
  end as financial_effective_enabled,
  coalesce(pgs.enabled, false) as goal_indicator_enabled,
  gi.indicator_realized as goal_indicator_realized,
  gi.indicator_projected as goal_indicator_projected,
  gi.deliveries_pending as goal_deliveries_pending
from public.projects p
left join public.profiles own on own.id = p.owner_id
left join public.profiles spo on spo.id = p.sponsor_id
left join public.teams tm on tm.id = p.team_id
left join public.companies co on co.id = p.company_id
left join public.v_project_financials fin on fin.project_id = p.id
left join public.project_goal_settings pgs on pgs.project_id = p.id
left join public.v_project_goal_indicator gi on gi.project_id = p.id
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

-- -----------------------------------------------------------------------------
-- Fechamento de periodo (competencia): congela nota, peso e datas num snapshot
-- imutavel, para reprogramacoes futuras no cronograma nao alterarem
-- silenciosamente um resultado ja apurado (itens 47/48).
-- -----------------------------------------------------------------------------
create table public.goal_score_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competencia date not null,
  status text not null default 'fechado'
    constraint goal_score_periods_status_ck check (status in ('em_apuracao', 'fechado')),
  indicator_realized numeric(5,2),
  indicator_projected numeric(5,2),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint goal_score_periods_uk unique (project_id, competencia),
  constraint goal_score_periods_competencia_ck check (date_trunc('month', competencia) = competencia)
);
select app.attach_stamps('public.goal_score_periods');
select app.attach_audit('public.goal_score_periods');

create table public.goal_score_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.goal_score_periods(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  code text not null,
  title text not null,
  target_date date,
  actual_date date,
  weight numeric(6,2) not null,
  score numeric(5,2),
  created_at timestamptz not null default now()
);

alter table public.goal_score_periods enable row level security;
create policy gsp_read on public.goal_score_periods for select to authenticated
  using (app.can_read_project(project_id));
create policy gsp_write on public.goal_score_periods for all to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());

alter table public.goal_score_snapshot_items enable row level security;
create policy gssi_read on public.goal_score_snapshot_items for select to authenticated
  using (exists (
    select 1 from public.goal_score_periods gp
     where gp.id = period_id and app.can_read_project(gp.project_id)
  ));
create policy gssi_write on public.goal_score_snapshot_items for all to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());

-- Fecha a competencia: grava o resultado corrente como snapshot imutavel.
create or replace function public.close_goal_period(p_project_id uuid, p_competencia date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  v_period_id uuid;
  v_month date := date_trunc('month', p_competencia)::date;
  v_existing record;
  v_indicator record;
begin
  if not app.can_manage_goal_indicator() then
    raise exception 'Somente Admin, PMO ou Gerencia fecham a apuracao do indicador.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from public.goal_score_periods
   where project_id = p_project_id and competencia = v_month;
  if v_existing.id is not null and v_existing.status = 'fechado' then
    raise exception 'Esta competencia ja esta fechada. Reabra antes de fechar novamente.';
  end if;

  select * into v_indicator from public.v_project_goal_indicator where project_id = p_project_id;

  if v_existing.id is not null then
    update public.goal_score_periods
       set status = 'fechado', indicator_realized = v_indicator.indicator_realized,
           indicator_projected = v_indicator.indicator_projected,
           closed_at = now(), closed_by = auth.uid(),
           reopened_at = null, reopened_by = null, reopen_reason = null
     where id = v_existing.id
     returning id into v_period_id;
    delete from public.goal_score_snapshot_items where period_id = v_period_id;
  else
    insert into public.goal_score_periods (
      project_id, competencia, status, indicator_realized, indicator_projected, closed_at, closed_by
    ) values (
      p_project_id, v_month, 'fechado', v_indicator.indicator_realized, v_indicator.indicator_projected,
      now(), auth.uid()
    ) returning id into v_period_id;
  end if;

  insert into public.goal_score_snapshot_items (period_id, task_id, code, title, target_date, actual_date, weight, score)
  select v_period_id, v.task_id, v.code, v.title, v.target_date, v.actual_date, v.weight,
         coalesce(v.score_realized, v.score_projected)
    from public.v_task_goal_scores v
   where v.project_id = p_project_id;

  return v_period_id;
end $$;
grant execute on function public.close_goal_period(uuid, date) to authenticated;

-- Reabre uma competencia fechada - exige justificativa, fica auditado pelo
-- gatilho generico da tabela (update captura old/new status).
create or replace function public.reopen_goal_period(p_project_id uuid, p_competencia date, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_month date := date_trunc('month', p_competencia)::date;
begin
  if not app.can_manage_goal_indicator() then
    raise exception 'Somente Admin, PMO ou Gerencia reabrem a apuracao do indicador.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'Justificativa obrigatoria (minimo 10 caracteres) para reabrir a apuracao.';
  end if;

  update public.goal_score_periods
     set status = 'em_apuracao', reopened_at = now(), reopened_by = auth.uid(), reopen_reason = p_reason
   where project_id = p_project_id and competencia = v_month and status = 'fechado';

  if not found then
    raise exception 'Nenhuma competencia fechada encontrada para reabrir.';
  end if;
end $$;
grant execute on function public.reopen_goal_period(uuid, date, text) to authenticated;
