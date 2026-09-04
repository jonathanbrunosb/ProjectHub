-- =============================================================================
-- 0009 - Colaboracao, status reports, preferencias de visualizacao e notificacoes
-- =============================================================================

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  body text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint comments_entity_ck check (entity in ('project','task','risk','action_plan','decision','status_report')),
  constraint comments_body_ck check (char_length(body) between 1 and 8000)
);
create index comments_entity_idx on public.comments(entity, entity_id, created_at desc);
create index comments_project_idx on public.comments(project_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity text not null default 'project',
  entity_id uuid,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint attachments_path_uk unique (storage_path),
  constraint attachments_size_ck check (size_bytes is null or size_bytes <= 52428800)
);
create index attachments_project_idx on public.attachments(project_id);
create index attachments_entity_idx on public.attachments(entity, entity_id);

-- Status report versionado: publicado nao sofre alteracao silenciosa
create table public.status_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null default 1,
  period_start date not null,
  period_end date not null,
  state app.status_report_state not null default 'rascunho',
  health app.health not null,
  progress_actual numeric(5,2) not null default 0,
  progress_planned numeric(5,2) not null default 0,
  progress_in_period numeric(5,2) not null default 0,
  executive_summary text,
  main_deliveries text,
  next_steps text,
  risks_summary text,
  issues_summary text,
  financial_summary text,
  required_decisions text,
  snapshot jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  supersedes_id uuid references public.status_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint status_reports_uk unique (project_id, version),
  constraint status_reports_period_ck check (period_end >= period_start),
  constraint status_reports_pub_ck check (state <> 'publicado' or published_at is not null)
);
create index status_reports_project_idx on public.status_reports(project_id, period_end desc);

-- Bloqueia edicao de report publicado (correcoes exigem nova versao)
create or replace function app.status_reports_immutable()
returns trigger language plpgsql as $$
begin
  if old.state = 'publicado' and new.state = 'publicado' then
    if row(new.*) is distinct from row(old.*) then
      raise exception 'Status Report publicado e imutavel. Crie uma nova versao.'
        using errcode = 'check_violation';
    end if;
  end if;
  if old.state = 'publicado' and new.state = 'rascunho' then
    raise exception 'Status Report publicado nao pode voltar para rascunho.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_status_reports_immutable before update on public.status_reports
  for each row execute function app.status_reports_immutable();

-- -----------------------------------------------------------------------------
-- Visualizacoes salvas e personalizacao de colunas
-- -----------------------------------------------------------------------------
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  module text not null,
  name text not null,
  scope app.saved_view_scope not null default 'privada',
  project_id uuid references public.projects(id) on delete cascade,
  template_id uuid references public.project_templates(id) on delete cascade,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint saved_views_module_ck check (char_length(module) between 2 and 60),
  constraint saved_views_scope_ck check (
    (scope = 'privada'         and owner_id is not null) or
    (scope = 'compartilhada') or
    (scope = 'padrao_projeto'  and project_id is not null) or
    (scope = 'padrao_template' and template_id is not null)
  )
);
create index saved_views_lookup_idx on public.saved_views(module, scope);
create index saved_views_owner_idx on public.saved_views(owner_id, module);

-- Preferencia de colunas persistida por usuario + modulo + view
create table public.column_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module text not null,
  view_key text not null default 'default',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint column_preferences_uk unique (profile_id, module, view_key)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  channel app.notification_channel not null default 'in_app',
  rule_key text,
  severity app.priority not null default 'media',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index notifications_inbox_idx on public.notifications(profile_id, created_at desc) where read_at is null;

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  event_type text not null,
  threshold_days int,
  threshold_pct numeric(6,2),
  severity app.priority not null default 'media',
  channels app.notification_channel[] not null default '{in_app}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint automation_rules_key_uk unique (key)
);

select app.attach_stamps('public.comments');
select app.attach_stamps('public.attachments');
select app.attach_stamps('public.status_reports');
select app.attach_stamps('public.saved_views');
select app.attach_stamps('public.column_preferences');
select app.attach_stamps('public.notifications');
select app.attach_stamps('public.automation_rules');
