-- =============================================================================
-- Testes de RLS - executam contra o banco com migrations + seed aplicados.
-- Cada bloco assume a identidade de um usuario via request.jwt.claims e
-- valida o que ele PODE e o que ele NAO PODE fazer.
-- Uso: psql -d pmo -f supabase/tests/01_rls_tests.sql
-- Qualquer falha aborta com ERROR.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
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

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); end $$;

-- Negacao de escrita tem duas formas validas sob RLS:
--  a) excecao (violacao de politica WITH CHECK, gatilho de guarda); ou
--  b) comando executa sem erro mas NAO afeta nenhuma linha (USING filtra tudo).
-- Falha se a escrita efetivamente alterou dados.
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
    raise exception 'FALHOU (deveria ser negado, % linha(s) afetada(s)): %', v_rows, p_msg;
  end if;
  raise notice 'ok (0 linhas) - %', p_msg;
end $$;

-- =============================================================================
grant usage on schema app to authenticated;
set role authenticated;

-- -----------------------------------------------------------------------------
-- ANONIMO: nao enxerga nada
-- -----------------------------------------------------------------------------
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.projects) = 0, 'anonimo nao le projetos');
select pg_temp.assert((select count(*) from public.tasks) = 0, 'anonimo nao le tarefas');
select pg_temp.assert((select count(*) from public.application_audit_log) = 0, 'anonimo nao le auditoria');

-- -----------------------------------------------------------------------------
-- ADMIN: leitura e escrita totais
-- -----------------------------------------------------------------------------
select pg_temp.login('admin@pmocontabil.dev');
select pg_temp.assert((select count(*) from public.projects) = 6, 'admin le todos os 6 projetos');
select pg_temp.assert((select count(*) from public.application_audit_log) > 0, 'admin le a trilha de auditoria');
select pg_temp.assert(app.is_admin(), 'admin reconhecido como admin');

-- -----------------------------------------------------------------------------
-- PMO: leitura corporativa e escrita no portfolio
-- -----------------------------------------------------------------------------
select pg_temp.login('pmo@pmocontabil.dev');
select pg_temp.assert((select count(*) from public.projects) = 6, 'PMO le todo o portfolio');
select pg_temp.assert(app.is_portfolio_manager(), 'PMO e gestor de portfolio');
select pg_temp.assert(app.can_write_project('31313131-3131-4131-8131-000000000002'), 'PMO escreve em qualquer projeto');

-- -----------------------------------------------------------------------------
-- AUDITOR: le tudo (inclusive trilha), mas nao escreve
-- -----------------------------------------------------------------------------
select pg_temp.login('auditor@pmocontabil.dev');
select pg_temp.assert((select count(*) from public.projects) = 6, 'auditor le todo o portfolio');
select pg_temp.assert((select count(*) from public.application_audit_log) > 0, 'auditor le a trilha de auditoria');
select pg_temp.assert(not app.can_write_project('31313131-3131-4131-8131-000000000001'), 'auditor nao tem escrita');
select pg_temp.assert_denied(
  $q$ update public.projects set name = 'hack' where code = 'CTB-2026-001' $q$,
  'auditor nao altera projeto');
select pg_temp.assert_denied(
  $q$ insert into public.tasks (project_id, code, title) values ('31313131-3131-4131-8131-000000000001','X999','hack') $q$,
  'auditor nao cria tarefa');
select pg_temp.assert_denied(
  $q$ delete from public.application_audit_log $q$,
  'auditor nao apaga a trilha de auditoria');

-- -----------------------------------------------------------------------------
-- PROJECT OWNER: escreve nos seus projetos, nao nos alheios
-- -----------------------------------------------------------------------------
select pg_temp.login('owner1@pmocontabil.dev');
select pg_temp.assert(app.can_write_project('31313131-3131-4131-8131-000000000001'), 'owner1 escreve no proprio projeto');
select pg_temp.assert(app.can_manage_project('31313131-3131-4131-8131-000000000001'), 'owner1 gerencia o proprio projeto');
select pg_temp.assert(not app.can_read_project('31313131-3131-4131-8131-000000000002'), 'owner1 NAO le projeto alheio (IDOR)');
select pg_temp.assert(
  (select count(*) from public.projects where code = 'CTB-2026-002') = 0,
  'owner1 nao enxerga a linha do projeto alheio');
select pg_temp.assert(
  (select count(*) from public.tasks where project_id = '31313131-3131-4131-8131-000000000002') = 0,
  'owner1 nao enxerga tarefas do projeto alheio');
select pg_temp.assert(
  (select count(*) from public.financial_entries where project_id = '31313131-3131-4131-8131-000000000002') = 0,
  'owner1 nao enxerga financeiro do projeto alheio');
select pg_temp.assert_denied(
  $q$ insert into public.tasks (project_id, code, title) values ('31313131-3131-4131-8131-000000000002','X999','hack') $q$,
  'owner1 nao cria tarefa em projeto alheio');
select pg_temp.assert((select count(*) from public.application_audit_log) = 0, 'owner1 nao le a trilha de auditoria');
-- escrita legitima funciona
update public.tasks set progress = 40 where project_id = '31313131-3131-4131-8131-000000000001' and code = 'T005';
select pg_temp.assert(
  (select progress from public.tasks where project_id = '31313131-3131-4131-8131-000000000001' and code = 'T005') = 40,
  'owner1 atualiza tarefa do proprio projeto');

-- -----------------------------------------------------------------------------
-- COLABORADOR: escreve nos projetos em que participa, nao gerencia
-- -----------------------------------------------------------------------------
select pg_temp.login('colab@pmocontabil.dev');
select pg_temp.assert(app.can_read_project('31313131-3131-4131-8131-000000000001'), 'colaborador le projeto em que participa');
select pg_temp.assert(app.can_write_project('31313131-3131-4131-8131-000000000001'), 'colaborador escreve no projeto em que participa');
select pg_temp.assert(not app.can_manage_project('31313131-3131-4131-8131-000000000001'), 'colaborador NAO gerencia o projeto');
select pg_temp.assert_denied(
  $q$ insert into public.project_budgets (project_id, revision, amount) values ('31313131-3131-4131-8131-000000000001', 99, 1) $q$,
  'colaborador nao altera orcamento');
select pg_temp.assert_denied(
  $q$ insert into public.project_members (project_id, profile_id, project_role)
      values ('31313131-3131-4131-8131-000000000001','11111111-1111-4111-8111-000000000008','project_owner') $q$,
  'colaborador nao adiciona membros');

-- -----------------------------------------------------------------------------
-- CONSULTA (viewer): somente leitura no escopo autorizado
-- -----------------------------------------------------------------------------
select pg_temp.login('consulta@pmocontabil.dev');
select pg_temp.assert(app.can_read_project('31313131-3131-4131-8131-000000000001'), 'consulta le projeto autorizado');
select pg_temp.assert(not app.can_write_project('31313131-3131-4131-8131-000000000001'), 'consulta nao escreve');
select pg_temp.assert(not app.can_read_project('31313131-3131-4131-8131-000000000002'), 'consulta nao le projeto fora do escopo');
select pg_temp.assert_denied(
  $q$ update public.projects set health = 'verde' where code = 'CTB-2026-001' $q$,
  'consulta nao altera saude do projeto');

-- -----------------------------------------------------------------------------
-- SPONSOR: visao executiva dos projetos patrocinados + decisao
-- -----------------------------------------------------------------------------
select pg_temp.login('sponsor@pmocontabil.dev');
select pg_temp.assert((select count(*) from public.projects) = 6, 'sponsor le os projetos que patrocina');
select pg_temp.assert(app.is_project_sponsor('31313131-3131-4131-8131-000000000001'), 'sponsor reconhecido no projeto');
update public.decisions set status = 'aprovado', decision = 'Aprovado', rationale = 'Teste', decided_at = now()
 where code = 'D001';
select pg_temp.assert(
  (select status from public.decisions where code = 'D001') = 'aprovado',
  'sponsor registra a decisao do projeto que patrocina');

-- -----------------------------------------------------------------------------
-- ESCALACAO DE PRIVILEGIO: usuario nao muda o proprio papel
-- -----------------------------------------------------------------------------
select pg_temp.login('colab@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.profiles set role = 'admin' where id = auth.uid() $q$,
  'colaborador nao promove a si mesmo a admin');
select pg_temp.assert_denied(
  $q$ update public.profiles set active = false where email = 'admin@pmocontabil.dev' $q$,
  'colaborador nao desativa outro usuario');

-- -----------------------------------------------------------------------------
-- TRILHA DE AUDITORIA: append-only mesmo para Admin
-- -----------------------------------------------------------------------------
select pg_temp.login('admin@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.application_audit_log set action = 'login' where id = (select min(id) from public.application_audit_log) $q$,
  'admin nao altera a trilha de auditoria');
select pg_temp.assert_denied(
  $q$ delete from public.application_audit_log where id = (select min(id) from public.application_audit_log) $q$,
  'admin nao apaga a trilha de auditoria');

-- -----------------------------------------------------------------------------
-- CAMPOS PERSONALIZADOS e PREFERENCIAS
-- -----------------------------------------------------------------------------
select pg_temp.login('owner1@pmocontabil.dev');
select pg_temp.assert(
  (select count(*) from public.custom_field_definitions where scope = 'global') = 3,
  'owner le definicoes globais de campos personalizados');
insert into public.column_preferences (profile_id, module, view_key, config)
values (auth.uid(), 'portfolio', 'default', '{"hidden":["company_name"]}'::jsonb)
on conflict (profile_id, module, view_key) do update set config = excluded.config;
select pg_temp.assert(
  (select count(*) from public.column_preferences) = 1,
  'owner enxerga apenas as proprias preferencias de coluna');

select pg_temp.login('colab@pmocontabil.dev');
select pg_temp.assert(
  (select count(*) from public.column_preferences) = 0,
  'colaborador nao enxerga preferencias de outro usuario');

-- -----------------------------------------------------------------------------
-- STATUS REPORT publicado e imutavel
-- -----------------------------------------------------------------------------
select pg_temp.login('owner1@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ update public.status_reports set executive_summary = 'alterado' where state = 'publicado' $q$,
  'status report publicado nao pode ser alterado silenciosamente');

-- -----------------------------------------------------------------------------
-- OVERRIDE DE SAUDE exige justificativa
-- -----------------------------------------------------------------------------
select pg_temp.assert_denied(
  $q$ select public.override_project_health('31313131-3131-4131-8131-000000000001','verde','curto') $q$,
  'override de saude sem justificativa suficiente e rejeitado');
select public.override_project_health('31313131-3131-4131-8131-000000000001','verde',
  'Marco replanejado formalmente com o Sponsor em Steering Committee.');
select pg_temp.assert(
  (select health = 'verde' and health_is_manual and health_override_reason is not null
     from public.projects where id = '31313131-3131-4131-8131-000000000001'),
  'override de saude registra justificativa e autor');

select pg_temp.login('consulta@pmocontabil.dev');
select pg_temp.assert_denied(
  $q$ select public.override_project_health('31313131-3131-4131-8131-000000000001','verde','Justificativa qualquer valida') $q$,
  'consulta nao sobrepoe a saude do projeto');

reset role;
select pg_temp.logout();
\echo '>>> TODOS OS TESTES DE RLS PASSARAM'
