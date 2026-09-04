-- =============================================================================
-- 0003 - Portfolios, templates e projetos
-- =============================================================================

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint portfolios_code_uk unique (code)
);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text not null,
  description text,
  default_progress_method app.progress_method not null default 'automatico',
  default_health_auto boolean not null default true,
  evm_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint project_templates_code_uk unique (code)
);

create table public.template_phases (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete cascade,
  name text not null,
  position int not null,
  weight numeric(6,2) not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint template_phases_uk unique (template_id, position),
  constraint template_phases_weight_ck check (weight > 0)
);

create table public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete cascade,
  template_phase_id uuid references public.template_phases(id) on delete cascade,
  title text not null,
  description text,
  position int not null,
  weight numeric(6,2) not null default 1,
  offset_start_days int not null default 0,
  duration_days int not null default 5,
  is_milestone boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint template_tasks_weight_ck check (weight > 0),
  constraint template_tasks_duration_ck check (duration_days >= 0)
);
create index template_tasks_template_idx on public.template_tasks(template_id, position);

-- -----------------------------------------------------------------------------
-- Projetos
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  template_id uuid references public.project_templates(id) on delete set null,
  category text not null default 'Outros',
  objective text,
  scope text,
  expected_results text,
  executive_summary text,
  executive_summary_updated_at timestamptz,

  sponsor_id uuid references public.profiles(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,

  priority app.priority not null default 'media',
  status app.project_status not null default 'planejamento',
  phase text,

  health app.health not null default 'cinza',
  health_is_manual boolean not null default false,
  health_override_reason text,
  health_overridden_by uuid references public.profiles(id) on delete set null,
  health_overridden_at timestamptz,

  progress_method app.progress_method not null default 'automatico',
  progress_planned numeric(5,2) not null default 0,
  progress_actual numeric(5,2) not null default 0,

  start_date date,
  target_date date,
  baseline_start_date date,
  baseline_target_date date,
  actual_end_date date,

  evm_enabled boolean not null default false,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,

  constraint projects_code_uk unique (code),
  constraint projects_code_ck check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,29}$'),
  constraint projects_progress_ck check (
    progress_planned between 0 and 100 and progress_actual between 0 and 100
  ),
  constraint projects_dates_ck check (target_date is null or start_date is null or target_date >= start_date),
  constraint projects_health_override_ck check (
    not health_is_manual or (health_override_reason is not null and health_overridden_by is not null)
  )
);
create index projects_status_idx on public.projects(status) where archived_at is null;
create index projects_owner_idx on public.projects(owner_id);
create index projects_sponsor_idx on public.projects(sponsor_id);
create index projects_team_idx on public.projects(team_id);
create index projects_company_idx on public.projects(company_id);
create index projects_health_idx on public.projects(health);
create index projects_target_idx on public.projects(target_date);
create index projects_portfolio_idx on public.projects(portfolio_id);

create table public.project_business_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint project_business_units_uk unique (project_id, business_unit_id)
);
create index project_business_units_bu_idx on public.project_business_units(business_unit_id);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  project_role app.role_key not null default 'collaborator',
  role_label text,
  can_edit boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint project_members_uk unique (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members(profile_id);
create index project_members_project_idx on public.project_members(project_id);

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  position int not null,
  weight numeric(6,2) not null default 1,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint project_phases_uk unique (project_id, position),
  constraint project_phases_weight_ck check (weight > 0),
  constraint project_phases_dates_ck check (end_date is null or start_date is null or end_date >= start_date)
);

select app.attach_stamps('public.portfolios');
select app.attach_stamps('public.project_templates');
select app.attach_stamps('public.template_phases');
select app.attach_stamps('public.template_tasks');
select app.attach_stamps('public.projects');
select app.attach_stamps('public.project_business_units');
select app.attach_stamps('public.project_members');
select app.attach_stamps('public.project_phases');
