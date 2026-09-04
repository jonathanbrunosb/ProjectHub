-- =============================================================================
-- 0008 - Recursos, capacidade e calendario critico contabil
-- =============================================================================

create table public.resource_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  role_label text,
  period_start date not null,
  period_end date not null,
  allocated_hours numeric(8,2) not null default 0,
  allocation_pct numeric(5,2),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint resource_allocations_period_ck check (period_end >= period_start),
  constraint resource_allocations_hours_ck check (allocated_hours >= 0),
  constraint resource_allocations_pct_ck check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 200))
);
create index resource_allocations_profile_idx on public.resource_allocations(profile_id, period_start);
create index resource_allocations_project_idx on public.resource_allocations(project_id);
create index resource_allocations_team_idx on public.resource_allocations(team_id);

-- Capacidade x alocacao por colaborador e mes de referencia.
-- As horas de uma alocacao sao rateadas pelos dias de sobreposicao com o mes,
-- para que um aceite de 3 meses nao apareca integral em cada mes.
create or replace view public.v_resource_capacity as
select
  pr.id as profile_id,
  pr.full_name,
  pr.primary_team_id as team_id,
  t.name as team_name,
  m.month as reference_month,
  round(pr.weekly_capacity_hours * 4.33, 2) as capacity_hours,
  round(coalesce(a.allocated_hours, 0), 2) as allocated_hours,
  case when pr.weekly_capacity_hours = 0 then 0
       else round(coalesce(a.allocated_hours, 0) * 100 / (pr.weekly_capacity_hours * 4.33), 2)
  end as allocation_pct,
  coalesce(a.project_count, 0) as project_count
from public.profiles pr
cross join lateral (
  select generate_series(
    date_trunc('month', current_date - interval '2 month'),
    date_trunc('month', current_date + interval '4 month'),
    interval '1 month'
  )::date as month
) m
left join public.teams t on t.id = pr.primary_team_id
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

-- -----------------------------------------------------------------------------
-- Calendario critico contabil
-- -----------------------------------------------------------------------------
create table public.critical_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  kind app.calendar_window_kind not null,
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  is_freeze boolean not null default false,
  severity app.priority not null default 'alta',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint critical_calendar_period_ck check (end_date >= start_date)
);
create index critical_calendar_period_idx on public.critical_calendar_events using gist (daterange(start_date, end_date, '[]'));
create index critical_calendar_company_idx on public.critical_calendar_events(company_id);

-- Conflitos entre marcos/entregas criticas e janelas sensiveis da Contabilidade
create or replace view public.v_calendar_conflicts as
select
  m.id as milestone_id,
  m.project_id,
  p.code as project_code,
  p.name as project_name,
  m.name as milestone_name,
  m.due_date,
  c.id as event_id,
  c.name as event_name,
  c.kind as event_kind,
  c.is_freeze,
  c.severity,
  c.start_date as window_start,
  c.end_date as window_end
from public.milestones m
join public.projects p on p.id = m.project_id
join public.critical_calendar_events c
  on c.active
 and m.due_date between c.start_date and c.end_date
 and (c.company_id is null or c.company_id = p.company_id)
where m.completed_at is null;

select app.attach_stamps('public.resource_allocations');
select app.attach_stamps('public.critical_calendar_events');
