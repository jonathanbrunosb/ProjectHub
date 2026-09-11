-- =============================================================================
-- Baseline de cronograma congelada por projeto
--
-- Ate aqui `tasks.baseline_due_date` so' era gravado pela criacao de projeto a
-- partir de template. Tarefa criada manualmente ou importada por Excel nascia
-- sem baseline, entao a comparacao planejado x replanejado do Gantt ficava
-- inerte no caminho mais comum de cadastro.
--
-- A captura NAO e' automatica na criacao de proposito: baseline e' um marco de
-- governanca ("este e' o plano aprovado"), nao o rascunho do cadastro. Um
-- baseline carimbado silenciosamente daria falsa aparencia de rastreabilidade -
-- em auditoria, pior que baseline ausente. O congelamento e' uma acao
-- deliberada de Admin/PMO, com autor, data e versao registrados.
--
-- Espelha a semantica ja usada em close_goal_period/reopen_goal_period (0017):
-- congelar exige permissao, replanejar exige justificativa, tudo auditado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------

-- Faltava o baseline de INICIO. Sem ele nao ha como medir desvio de inicio, e a
-- linha de baseline do Gantt precisava usar o start_date ATUAL como substituto -
-- numa tarefa replanejada isso desenhava inicio novo com termino antigo.
alter table public.tasks
  add column if not exists baseline_start_date date;

alter table public.tasks
  drop constraint if exists tasks_baseline_dates_ck;
alter table public.tasks
  add constraint tasks_baseline_dates_ck check (
    baseline_due_date is null or baseline_start_date is null
    or baseline_due_date >= baseline_start_date
  );

alter table public.projects
  add column if not exists schedule_baseline_frozen_at timestamptz,
  add column if not exists schedule_baseline_frozen_by uuid,
  add column if not exists schedule_baseline_version integer not null default 0;

comment on column public.projects.schedule_baseline_version is
  '0 = cronograma sem baseline congelada. Incrementa a cada replanejamento.';

-- -----------------------------------------------------------------------------
-- 2. Backfill do legado
--
-- Projetos criados por template ja tinham baseline_due_date carimbado na
-- criacao, junto com o start_date - naquele instante as duas datas eram o
-- plano original. Materializa o baseline de inicio so' para esse conjunto.
--
-- Nao e' exato para tarefas replanejadas desde entao (o start_date de hoje nao
-- e' o original), mas e' exatamente a aproximacao que o Gantt ja exibia; o
-- backfill materializa o comportamento atual em vez de introduzir dado novo.
-- Tarefas sem baseline_due_date continuam sem baseline: nao ha plano original a
-- recuperar, e inventar um contamina a medicao de desvio.
-- -----------------------------------------------------------------------------

update public.tasks
   set baseline_start_date = start_date
 where baseline_due_date is not null
   and baseline_start_date is null
   and start_date is not null;

-- -----------------------------------------------------------------------------
-- 3. Captura na criacao por template
--
-- Reaproveita o trigger que ja carimba baseline_estimated_hours no INSERT
-- (20260909194954) em vez de criar um segundo. So' carimba o baseline de inicio
-- quando a tarefa ja nasce com baseline de termino - ou seja, vinda de template.
-- Criacao manual e importacao continuam nascendo sem baseline, por decisao de
-- produto: quem define o plano aprovado e' o congelamento.
-- -----------------------------------------------------------------------------

create or replace function app.tasks_progress_sync()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_project uuid := coalesce(new.project_id, old.project_id);
begin
  if tg_op = 'INSERT' then
    new.baseline_estimated_hours := coalesce(new.baseline_estimated_hours, new.estimated_hours);
    if new.baseline_due_date is not null then
      new.baseline_start_date := coalesce(new.baseline_start_date, new.start_date);
    end if;
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

-- -----------------------------------------------------------------------------
-- 4. Guardas
--
-- A baseline so' muda pelo congelamento. Sem isso, qualquer perfil com escrita
-- na tarefa poderia sobrescrever a referencia de desvio por update direto.
-- O flag de sessao e' local a transacao (set_config com is_local = true).
-- -----------------------------------------------------------------------------

create or replace function app.is_freezing_baseline()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.freezing_baseline', true), '') = 'on';
$$;

create or replace function app.guard_task_baseline()
returns trigger language plpgsql as $$
begin
  if (new.baseline_start_date is distinct from old.baseline_start_date
      or new.baseline_due_date is distinct from old.baseline_due_date)
     and not app.is_freezing_baseline() then
    raise exception 'A baseline do cronograma so muda pelo congelamento (Admin ou PMO).'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_guard_baseline on public.tasks;
create trigger trg_tasks_guard_baseline before update on public.tasks
  for each row execute function app.guard_task_baseline();

create or replace function app.guard_project_baseline_control()
returns trigger language plpgsql as $$
begin
  if (new.schedule_baseline_frozen_at is distinct from old.schedule_baseline_frozen_at
      or new.schedule_baseline_frozen_by is distinct from old.schedule_baseline_frozen_by
      or new.schedule_baseline_version is distinct from old.schedule_baseline_version)
     and not app.is_freezing_baseline() then
    raise exception 'O controle de baseline do cronograma so muda pelo congelamento.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_guard_baseline_control on public.projects;
create trigger trg_projects_guard_baseline_control before update on public.projects
  for each row execute function app.guard_project_baseline_control();

-- -----------------------------------------------------------------------------
-- 5. Aplicacao do congelamento
--
-- Congela TODAS as tarefas do projeto, inclusive concluidas e canceladas: a
-- baseline e' a fotografia do plano inteiro no momento da aprovacao, nao um
-- recorte do que ainda esta em aberto.
-- -----------------------------------------------------------------------------

create or replace function app.apply_schedule_baseline(p_project_id uuid, p_reason text default null)
returns integer language plpgsql security definer set search_path = public, app as $$
declare
  v_count integer;
  v_version integer;
  v_profile record;
begin
  perform set_config('app.freezing_baseline', 'on', true);

  update public.tasks
     set baseline_start_date = start_date,
         baseline_due_date = due_date
   where project_id = p_project_id;
  get diagnostics v_count = row_count;

  update public.projects
     set schedule_baseline_version = schedule_baseline_version + 1,
         schedule_baseline_frozen_at = now(),
         schedule_baseline_frozen_by = auth.uid()
   where id = p_project_id
   returning schedule_baseline_version into v_version;

  select full_name, email into v_profile from public.profiles where id = auth.uid();

  insert into public.application_audit_log (
    user_id, user_name, user_email, action, entity, entity_id, project_id, new_data, origin
  ) values (
    auth.uid(), v_profile.full_name, v_profile.email, 'schedule_change', 'projects',
    p_project_id, p_project_id,
    jsonb_build_object(
      'event', case when v_version = 1 then 'baseline_congelada' else 'baseline_replanejada' end,
      'schedule_baseline_version', v_version,
      'tasks_afetadas', v_count,
      'motivo', p_reason
    ),
    'db'
  );

  perform set_config('app.freezing_baseline', '', true);
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- 6. RPCs
-- -----------------------------------------------------------------------------

create or replace function public.freeze_project_schedule_baseline(p_project_id uuid)
returns integer language plpgsql security definer set search_path = public, app as $$
declare v_project record;
begin
  if not app.is_portfolio_manager() then
    raise exception 'Somente Admin ou PMO congela a baseline do cronograma.'
      using errcode = 'insufficient_privilege';
  end if;

  select id, schedule_baseline_version into v_project
    from public.projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'Projeto nao encontrado.';
  end if;
  if v_project.schedule_baseline_version > 0 then
    raise exception 'Este projeto ja tem baseline congelada (v%). Use o replanejamento.',
      v_project.schedule_baseline_version;
  end if;

  return app.apply_schedule_baseline(p_project_id, null);
end $$;

-- Replanejamento: exige justificativa, para que um novo baseline nao vire
-- rotina silenciosa que mascara atraso.
create or replace function public.rebaseline_project_schedule(p_project_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public, app as $$
declare v_project record;
begin
  if not app.is_portfolio_manager() then
    raise exception 'Somente Admin ou PMO replaneja a baseline do cronograma.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Informe a justificativa do replanejamento (minimo de 10 caracteres).';
  end if;

  select id, schedule_baseline_version into v_project
    from public.projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'Projeto nao encontrado.';
  end if;
  if v_project.schedule_baseline_version = 0 then
    raise exception 'Este projeto ainda nao tem baseline congelada. Congele antes de replanejar.';
  end if;

  return app.apply_schedule_baseline(p_project_id, trim(p_reason));
end $$;

revoke all on function public.freeze_project_schedule_baseline(uuid) from public;
revoke all on function public.rebaseline_project_schedule(uuid, text) from public;
grant execute on function public.freeze_project_schedule_baseline(uuid) to authenticated;
grant execute on function public.rebaseline_project_schedule(uuid, text) to authenticated;
