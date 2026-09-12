-- =============================================================================
-- Endurecimento: nenhuma RPC SECURITY DEFINER executavel sem autenticacao
--
-- Funcoes criadas no schema `public` sao expostas pelo PostgREST em
-- /rest/v1/rpc/<nome>, e o Supabase concede EXECUTE a anon/authenticated/
-- service_role por default privileges. Um `revoke ... from public` na migration
-- que cria a funcao nao basta: a concessao a `anon` e' nominal, nao vem de
-- PUBLIC. O resultado e' que toda RPC do app podia ser invocada sem sessao.
--
-- Na pratica nenhuma delas executava de fato: todas checam papel via
-- app.my_role(), que depende de auth.uid() e retorna nulo sem sessao. Mas a
-- invocacao chegava ao corpo da funcao antes de ser recusada - superficie
-- exposta sem necessidade, ja que nenhuma RPC do app e' usada antes do login
-- (conferido: o seletor de ambiente da tela de login troca de projeto Supabase
-- localmente, sem RPC, e log_app_event so' e' chamado com sessao valida,
-- inclusive no logout, que audita antes do signOut).
--
-- QA e PRD estavam divergentes (QA ja tinha 5 revogadas, PRD nenhuma), entao a
-- migracao e' declarativa: converge qualquer estado para o alvo, de forma
-- idempotente.
--
-- Ao criar uma RPC nova, mantenha o padrao:
--   revoke all on function public.<nome>(<args>) from public, anon;
--   grant execute on function public.<nome>(<args>) to authenticated;
-- A invariante e' verificada em supabase/tests/02_business_rules.sql - uma RPC
-- que escape do padrao quebra o CI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- search_path fixo nas funcoes de guarda da baseline
--
-- Criadas na migration anterior sem `set search_path`, o que as deixava sujeitas
-- ao search_path de quem dispara o gatilho. Sao SECURITY INVOKER, entao o risco
-- e' menor que numa DEFINER, mas uma guarda de integridade nao deve depender do
-- ambiente do chamador para resolver os nomes que usa.
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Revogacao do acesso anonimo
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
  v_auth boolean;
  v_service boolean;
begin
  -- Ambiente sem os roles do Supabase (Postgres cru) nao tem o que endurecer.
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;

  for r in
    select p.oid, p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  loop
    -- Captura o acesso vigente ANTES de revogar: parte das funcoes so' era
    -- alcancavel via PUBLIC, entao revogar PUBLIC sem reconceder explicitamente
    -- tiraria o acesso de quem precisa e quebraria a aplicacao.
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', r.oid, 'EXECUTE');

    if v_auth then
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;
    if v_service then
      execute format('grant execute on function %s to service_role', r.fn);
    end if;

    execute format('revoke execute on function %s from public', r.fn);
    execute format('revoke execute on function %s from anon', r.fn);
  end loop;
end $$;
