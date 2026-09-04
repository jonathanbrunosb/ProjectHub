-- =============================================================================
-- 0002 - Identidade, estrutura organizacional e equipes
-- =============================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  cnpj text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint companies_code_uk unique (code),
  constraint companies_code_ck check (char_length(code) between 2 and 20)
);

create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint business_units_uk unique (company_id, code)
);
create index business_units_company_idx on public.business_units(company_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  manager_id uuid,
  weekly_capacity_hours numeric(8,2) not null default 0,
  max_allocation_pct numeric(5,2) not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint teams_name_uk unique (name),
  constraint teams_alloc_ck check (max_allocation_pct > 0 and max_allocation_pct <= 200)
);

-- profiles espelha auth.users e carrega o papel global (RBAC)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  job_title text,
  role app.role_key not null default 'viewer',
  company_id uuid references public.companies(id) on delete set null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  primary_team_id uuid references public.teams(id) on delete set null,
  avatar_url text,
  weekly_capacity_hours numeric(6,2) not null default 40,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint profiles_capacity_ck check (weekly_capacity_hours >= 0 and weekly_capacity_hours <= 200)
);
create index profiles_role_idx on public.profiles(role) where active;
create index profiles_team_idx on public.profiles(primary_team_id);

alter table public.teams
  add constraint teams_manager_fk foreign key (manager_id) references public.profiles(id) on delete set null;

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_lead boolean not null default false,
  allocation_pct numeric(5,2) not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint team_memberships_uk unique (team_id, profile_id),
  constraint team_memberships_pct_ck check (allocation_pct > 0 and allocation_pct <= 100)
);
create index team_memberships_profile_idx on public.team_memberships(profile_id);

-- -----------------------------------------------------------------------------
-- Provisionamento automatico de profile a partir do auth.users
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, app, auth as $$
declare v_role app.role_key := 'viewer';
begin
  -- primeiro usuario do ambiente vira administrador
  if not exists (select 1 from public.profiles limit 1) then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

select app.attach_stamps('public.companies');
select app.attach_stamps('public.business_units');
select app.attach_stamps('public.teams');
select app.attach_stamps('public.profiles');
select app.attach_stamps('public.team_memberships');
