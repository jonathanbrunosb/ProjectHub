-- =============================================================================
-- 0007 - Riscos, issues, planos de acao, indicadores e decisoes
-- =============================================================================

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  kind app.risk_kind not null default 'risco',
  category text,
  title text not null,
  description text,
  cause text,
  consequence text,
  probability smallint not null default 3,
  impact smallint not null default 3,
  score smallint generated always as (probability * impact) stored,
  owner_id uuid references public.profiles(id) on delete set null,
  strategy app.risk_strategy,
  mitigation_plan text,
  due_date date,
  status app.risk_status not null default 'aberto',
  residual_probability smallint,
  residual_impact smallint,
  identified_at date not null default current_date,
  last_review_at date,
  evidence_url text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint risks_code_uk unique (project_id, code),
  constraint risks_prob_ck check (probability between 1 and 5),
  constraint risks_impact_ck check (impact between 1 and 5),
  constraint risks_res_prob_ck check (residual_probability is null or residual_probability between 1 and 5),
  constraint risks_res_impact_ck check (residual_impact is null or residual_impact between 1 and 5)
);
create index risks_project_idx on public.risks(project_id);
create index risks_score_idx on public.risks(score desc) where status <> 'encerrado';
create index risks_owner_idx on public.risks(owner_id);

-- Criticidade derivada do score da matriz 5x5
create or replace function public.risk_criticality(p_score int)
returns text language sql immutable as $$
  select case
    when p_score >= 15 then 'critico'
    when p_score >= 9  then 'alto'
    when p_score >= 4  then 'moderado'
    else 'baixo'
  end;
$$;

create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  risk_id uuid references public.risks(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  origin text not null default 'projeto',
  owner_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status app.action_status not null default 'nao_iniciada',
  priority app.priority not null default 'media',
  evidence_url text,
  completed_at date,
  comment text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint action_plans_code_uk unique (project_id, code),
  constraint action_plans_origin_ck check (origin in ('risco', 'issue', 'projeto', 'auditoria'))
);
create index action_plans_project_idx on public.action_plans(project_id);
create index action_plans_risk_idx on public.action_plans(risk_id);
create index action_plans_due_idx on public.action_plans(due_date) where status not in ('concluida', 'cancelada');
create index action_plans_owner_idx on public.action_plans(owner_id);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  description text,
  category text,
  formula text,
  unit app.indicator_unit not null default 'numero',
  target_value numeric(18,4),
  current_value numeric(18,4),
  direction text not null default 'maior_melhor',
  frequency app.indicator_frequency not null default 'mensal',
  source text,
  owner_id uuid references public.profiles(id) on delete set null,
  trend app.trend,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint indicators_direction_ck check (direction in ('maior_melhor', 'menor_melhor'))
);
create index indicators_project_idx on public.indicators(project_id);

create table public.indicator_measurements (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators(id) on delete cascade,
  reference_date date not null,
  value numeric(18,4) not null,
  target_value numeric(18,4),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint indicator_measurements_uk unique (indicator_id, reference_date)
);
create index indicator_measurements_idx on public.indicator_measurements(indicator_id, reference_date desc);

-- EVM opcional por projeto/periodo
create table public.evm_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference_date date not null,
  pv numeric(16,2) not null default 0,
  ev numeric(16,2) not null default 0,
  ac numeric(16,2) not null default 0,
  spi numeric(8,4) generated always as (case when pv = 0 then null else round(ev / pv, 4) end) stored,
  cpi numeric(8,4) generated always as (case when ac = 0 then null else round(ev / ac, 4) end) stored,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint evm_snapshots_uk unique (project_id, reference_date)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  subject text not null,
  context text,
  alternatives text,
  recommendation text,
  decider_id uuid references public.profiles(id) on delete set null,
  deadline date,
  status app.decision_status not null default 'em_preparacao',
  decision text,
  rationale text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint decisions_code_uk unique (project_id, code),
  constraint decisions_closed_ck check (
    status not in ('aprovado', 'rejeitado') or (decision is not null and decided_at is not null)
  )
);
create index decisions_project_idx on public.decisions(project_id);
create index decisions_pending_idx on public.decisions(deadline) where status = 'aguardando_decisao';

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references public.decisions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  entity text not null default 'decision',
  entity_id uuid,
  approver_id uuid not null references public.profiles(id) on delete cascade,
  approved boolean,
  comment text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index approvals_decision_idx on public.approvals(decision_id);
create index approvals_approver_idx on public.approvals(approver_id) where approved is null;

select app.attach_stamps('public.risks');
select app.attach_stamps('public.action_plans');
select app.attach_stamps('public.indicators');
select app.attach_stamps('public.indicator_measurements');
select app.attach_stamps('public.evm_snapshots');
select app.attach_stamps('public.decisions');
select app.attach_stamps('public.approvals');
