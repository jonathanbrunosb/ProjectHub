-- =============================================================================
-- 0004 - Tarefas, dependencias, marcos e progresso fisico
-- =============================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_id uuid references public.project_phases(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  priority app.priority not null default 'media',
  status app.task_status not null default 'nao_iniciada',
  start_date date,
  due_date date,
  baseline_due_date date,
  completed_at date,
  weight numeric(6,2) not null default 1,
  progress numeric(5,2) not null default 0,
  is_milestone boolean not null default false,
  is_critical boolean not null default false,
  estimated_hours numeric(8,2),
  tags text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint tasks_code_uk unique (project_id, code),
  constraint tasks_progress_ck check (progress between 0 and 100),
  constraint tasks_weight_ck check (weight > 0),
  constraint tasks_dates_ck check (due_date is null or start_date is null or due_date >= start_date),
  constraint tasks_no_self_parent_ck check (parent_task_id is null or parent_task_id <> id)
);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_assignee_idx on public.tasks(assignee_id);
create index tasks_status_idx on public.tasks(project_id, status);
create index tasks_due_idx on public.tasks(due_date) where status not in ('concluida', 'cancelada');
create index tasks_parent_idx on public.tasks(parent_task_id);
create index tasks_milestone_idx on public.tasks(project_id) where is_milestone;

create table public.task_corresponsibles (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint task_corresponsibles_uk unique (task_id, profile_id)
);

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references public.tasks(id) on delete cascade,
  successor_id uuid not null references public.tasks(id) on delete cascade,
  dependency_type app.dependency_type not null default 'FS',
  lag_days int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint task_dependencies_uk unique (predecessor_id, successor_id),
  constraint task_dependencies_ck check (predecessor_id <> successor_id)
);
create index task_dependencies_succ_idx on public.task_dependencies(successor_id);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index task_checklist_task_idx on public.task_checklist_items(task_id);

create table public.task_reschedules (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  old_due_date date,
  new_due_date date,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index task_reschedules_task_idx on public.task_reschedules(task_id, created_at desc);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  name text not null,
  description text,
  due_date date not null,
  baseline_date date,
  completed_at date,
  is_critical boolean not null default false,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index milestones_project_idx on public.milestones(project_id);
create index milestones_due_idx on public.milestones(due_date) where completed_at is null;

-- -----------------------------------------------------------------------------
-- Progresso fisico ponderado
-- -----------------------------------------------------------------------------
-- Progresso = SUM(progresso_tarefa * peso) / SUM(peso), considerando apenas
-- tarefas folha (subtarefas substituem a tarefa-pai) e ignorando canceladas.
create or replace function app.calc_project_progress(p_project_id uuid)
returns numeric language sql stable as $$
  select coalesce(
    round(sum(t.progress * t.weight) / nullif(sum(t.weight), 0), 2),
    0
  )
  from public.tasks t
  where t.project_id = p_project_id
    and t.status <> 'cancelada'
    and not exists (
      select 1 from public.tasks c
      where c.parent_task_id = t.id and c.status <> 'cancelada'
    );
$$;

-- Avanco planejado: fracao do prazo decorrido ponderada pelas tarefas.
create or replace function app.calc_project_planned_progress(p_project_id uuid, p_ref date default current_date)
returns numeric language sql stable as $$
  select coalesce(round(sum(
    t.weight * least(100, greatest(0,
      case
        when t.start_date is null or t.due_date is null then case when p_ref >= coalesce(t.due_date, p_ref) then 100 else 0 end
        when p_ref <= t.start_date then 0
        when p_ref >= t.due_date then 100
        else 100.0 * (p_ref - t.start_date)::numeric / nullif((t.due_date - t.start_date), 0)
      end
    ))
  ) / nullif(sum(t.weight), 0), 2), 0)
  from public.tasks t
  where t.project_id = p_project_id
    and t.status <> 'cancelada'
    and not exists (
      select 1 from public.tasks c
      where c.parent_task_id = t.id and c.status <> 'cancelada'
    );
$$;

create or replace function app.refresh_project_progress(p_project_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  update public.projects p
     set progress_actual = case when p.progress_method = 'automatico'
                                then app.calc_project_progress(p_project_id)
                                else p.progress_actual end,
         progress_planned = app.calc_project_planned_progress(p_project_id),
         updated_at = now()
   where p.id = p_project_id;
end $$;

create or replace function app.tasks_progress_sync()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_project uuid := coalesce(new.project_id, old.project_id);
begin
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

create or replace function app.tasks_progress_sync_after()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  perform app.refresh_project_progress(coalesce(new.project_id, old.project_id));
  return null;
end $$;

create trigger trg_tasks_normalize before insert or update on public.tasks
  for each row execute function app.tasks_progress_sync();
create trigger trg_tasks_rollup after insert or update or delete on public.tasks
  for each row execute function app.tasks_progress_sync_after();

-- Registro automatico de reprogramacao de prazo
create or replace function app.tasks_track_reschedule()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.due_date is distinct from old.due_date then
    insert into public.task_reschedules (task_id, old_due_date, new_due_date, created_by, updated_by)
    values (new.id, old.due_date, new.due_date, auth.uid(), auth.uid());
  end if;
  return new;
end $$;

create trigger trg_tasks_reschedule after update of due_date on public.tasks
  for each row execute function app.tasks_track_reschedule();

select app.attach_stamps('public.tasks');
select app.attach_stamps('public.task_corresponsibles');
select app.attach_stamps('public.task_dependencies');
select app.attach_stamps('public.task_checklist_items');
select app.attach_stamps('public.task_reschedules');
select app.attach_stamps('public.milestones');
