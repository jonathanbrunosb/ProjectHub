-- =============================================================================
-- 0006 - Modulo financeiro: orcamento, revisoes e lancamentos
-- =============================================================================

create table public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision int not null default 0,
  amount numeric(16,2) not null,
  currency char(3) not null default 'BRL',
  effective_from date not null default current_date,
  is_current boolean not null default true,
  justification text,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint project_budgets_uk unique (project_id, revision),
  constraint project_budgets_amount_ck check (amount >= 0)
);
create unique index project_budgets_current_uk on public.project_budgets(project_id) where is_current;
create index project_budgets_project_idx on public.project_budgets(project_id, revision desc);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint cost_centers_code_uk unique (code)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nature app.financial_nature not null,
  reference_month date not null,
  amount numeric(16,2) not null,
  currency char(3) not null default 'BRL',
  category text,
  supplier text,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  account text,
  description text,
  document_ref text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint financial_entries_amount_ck check (amount >= 0),
  constraint financial_entries_month_ck check (date_trunc('month', reference_month) = reference_month)
);
create index financial_entries_project_idx on public.financial_entries(project_id, reference_month);
create index financial_entries_nature_idx on public.financial_entries(project_id, nature);

-- Resumo financeiro por projeto (base de dashboards e roll-up de portfolio)
create or replace view public.v_project_financials as
select
  p.id as project_id,
  p.code,
  p.name,
  coalesce(b.amount, 0)::numeric(16,2) as budget,
  coalesce(f.actual, 0)::numeric(16,2) as actual,
  coalesce(f.committed, 0)::numeric(16,2) as committed,
  coalesce(f.forecast, 0)::numeric(16,2) as forecast,
  (coalesce(b.amount, 0) - coalesce(f.actual, 0) - coalesce(f.committed, 0))::numeric(16,2) as remaining,
  (coalesce(f.forecast, 0) - coalesce(b.amount, 0))::numeric(16,2) as forecast_variance,
  case when coalesce(b.amount, 0) = 0 then 0
       else round((coalesce(f.forecast, 0) - b.amount) * 100 / b.amount, 2) end as forecast_variance_pct
from public.projects p
left join public.project_budgets b on b.project_id = p.id and b.is_current
left join lateral (
  select
    sum(amount) filter (where nature = 'realizado')    as actual,
    sum(amount) filter (where nature = 'comprometido') as committed,
    sum(amount) filter (where nature = 'forecast')     as forecast
  from public.financial_entries e where e.project_id = p.id
) f on true;

-- Curva mensal Planejado x Realizado x Forecast
create or replace view public.v_project_financial_curve as
select
  project_id,
  reference_month,
  sum(amount) filter (where nature = 'orcado')       as planned,
  sum(amount) filter (where nature = 'realizado')    as actual,
  sum(amount) filter (where nature = 'comprometido') as committed,
  sum(amount) filter (where nature = 'forecast')     as forecast
from public.financial_entries
group by project_id, reference_month;

-- Mantem apenas uma revisao vigente por projeto
create or replace function app.budgets_single_current()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.is_current then
    update public.project_budgets
       set is_current = false
     where project_id = new.project_id and id <> new.id and is_current;
  end if;
  return new;
end $$;

create trigger trg_budget_single_current after insert or update of is_current on public.project_budgets
  for each row when (new.is_current) execute function app.budgets_single_current();

select app.attach_stamps('public.project_budgets');
select app.attach_stamps('public.cost_centers');
select app.attach_stamps('public.financial_entries');
