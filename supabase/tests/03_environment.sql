-- =============================================================================
-- Testes da segregacao de ambientes (QA / PRD)
-- Uso: psql -d pmo -f supabase/tests/03_environment.sql
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create or replace function pg_temp.assert_raises(p_sql text, p_msg text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - %', p_msg;
    return;
  end;
  raise exception 'FALHOU (deveria ter sido rejeitado): %', p_msg;
end $$;

create or replace function pg_temp.login(p_email text)
returns void language plpgsql security definer as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then raise exception 'usuario % inexistente', p_email; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, false);
end $$;

create or replace function pg_temp.assert_denied(p_sql text, p_msg text)
returns void language plpgsql as $$
declare v_rows bigint;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    raise notice 'ok (excecao) - %', p_msg;
    return;
  end;
  if v_rows > 0 then
    raise exception 'FALHOU (deveria ser negado, % linha(s)): %', v_rows, p_msg;
  end if;
  raise notice 'ok (0 linhas) - %', p_msg;
end $$;

-- =============================================================================
-- 1. DECLARACAO DE AMBIENTE
-- =============================================================================
select pg_temp.assert(
  (select count(*) from public.app_environment) = 1,
  'o banco declara exatamente um ambiente');

select pg_temp.assert(
  (select environment from public.app_environment) in ('QA', 'PRD'),
  'o ambiente declarado e QA ou PRD');

select pg_temp.assert_raises(
  $q$ insert into public.app_environment (id, environment) values (false, 'PRD') $q$,
  'uma segunda linha de ambiente e rejeitada (padrao de linha unica)');

select pg_temp.assert_raises(
  $q$ update public.app_environment set environment = 'HOMOLOG' $q$,
  'ambiente fora de (QA, PRD) e rejeitado');

-- =============================================================================
-- 2. PERMISSAO DE ALTERNAR AMBIENTE
-- =============================================================================
select pg_temp.assert(
  (select can_switch_environment from public.profiles where email = 'admin@pmocontabil.dev'),
  'o admin tecnico de QA pode alternar de ambiente');

select pg_temp.assert(
  (select count(*) from public.profiles
    where can_switch_environment and email <> 'admin@pmocontabil.dev') = 0,
  'nenhum outro usuario do seed recebe a permissao por padrao');

set role authenticated;

-- Escalacao de privilegio: ninguem se autoconcede acesso a Producao.
select pg_temp.login('colab@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.profiles set can_switch_environment = true where id = auth.uid() $q$,
  'colaborador nao concede a si mesmo o acesso a troca de ambiente');

select pg_temp.login('pmo@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.profiles set can_switch_environment = true where id = auth.uid() $q$,
  'PMO nao concede a si mesmo o acesso a troca de ambiente');

-- Admin concede normalmente.
select pg_temp.login('admin@pmocontabil.dev');
update public.profiles set can_switch_environment = true where email = 'pmo@pmocontabil.dev';
select pg_temp.assert(
  (select can_switch_environment from public.profiles where email = 'pmo@pmocontabil.dev'),
  'admin concede o acesso a troca de ambiente');

-- =============================================================================
-- 3. CONFIGURACAO DE AMBIENTE E' RESTRITA A ADMIN
-- =============================================================================
select pg_temp.login('pmo@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.app_environment set environment = 'PRD' $q$,
  'PMO nao altera a declaracao de ambiente do banco');

select pg_temp.login('auditor@pmocontabil.dev');
select pg_temp.assert(
  (select count(*) from public.app_environment) = 1,
  'auditor le a declaracao de ambiente');
select pg_temp.assert_denied(
  $q$ update public.app_environment set environment = 'PRD' $q$,
  'auditor nao altera a declaracao de ambiente');

-- =============================================================================
-- 4. AUDITORIA DA TROCA DE AMBIENTE
-- =============================================================================
select pg_temp.login('admin@pmocontabil.dev');

select public.log_app_event(
  'environment_switch', 'environment', null, null,
  jsonb_build_object('from_environment', 'QA', 'to_environment', 'PRD'), 'test-agent', gen_random_uuid(), 'web');

select pg_temp.assert(
  (select count(*) from public.application_audit_log
    where action = 'environment_switch' and entity = 'environment') = 1,
  'a troca de ambiente e registrada na trilha de auditoria');

select pg_temp.assert(
  (select new_data ->> 'to_environment' from public.application_audit_log
    where action = 'environment_switch' order by id desc limit 1) = 'PRD',
  'a trilha guarda origem e destino da troca');

select public.log_app_event(
  'environment_switch_denied', 'environment', null, null,
  jsonb_build_object('from_environment', 'QA', 'to_environment', 'PRD'), 'test-agent', gen_random_uuid(), 'web');

select pg_temp.assert(
  (select count(*) from public.application_audit_log
    where action = 'environment_switch_denied') = 1,
  'tentativa de troca sem permissao tambem e registrada');

-- A trilha continua recusando acoes que nao sao do cliente.
select pg_temp.assert_raises(
  $q$ select public.log_app_event('delete', 'projects') $q$,
  'o cliente nao pode registrar acoes de dados diretamente na trilha');

reset role;
\echo '>>> TODOS OS TESTES DE AMBIENTE PASSARAM'
