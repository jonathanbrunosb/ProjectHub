-- =============================================================================
-- Fixa search_path nas funcoes de guarda de baseline, aplicada em QA/PRD fora
-- do controle de versao (via MCP apply_migration) e nunca commitada como
-- arquivo. Conteudo capturado direto de supabase_migrations.schema_migrations
-- (identico nos dois ambientes) para fechar a divergencia entre o schema real
-- e o historico versionado no repositorio.
-- =============================================================================

create or replace function app.is_freezing_baseline()
returns boolean language sql stable set search_path = public, app as $$
  select coalesce(current_setting('app.freezing_baseline', true), '') = 'on';
$$;

create or replace function app.guard_task_baseline()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if (new.baseline_start_date is distinct from old.baseline_start_date
      or new.baseline_due_date is distinct from old.baseline_due_date)
     and not app.is_freezing_baseline() then
    raise exception 'A baseline do cronograma so muda pelo congelamento (Admin ou PMO).'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace function app.guard_project_baseline_control()
returns trigger language plpgsql set search_path = public, app as $$
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
