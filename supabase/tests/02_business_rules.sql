-- =============================================================================
-- Testes das regras de negocio criticas implementadas no PostgreSQL.
-- Uso: psql -d pmo -f supabase/tests/02_business_rules.sql
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

-- -----------------------------------------------------------------------------
-- Projeto isolado para os testes
-- -----------------------------------------------------------------------------
insert into public.projects (id, code, name, category, status, start_date, target_date, progress_method)
values ('99999999-9999-4999-8999-000000000001','TEST-001','Projeto de teste','Teste','em_andamento',
        current_date - 30, current_date + 30, 'automatico')
on conflict (code) do nothing;

-- =============================================================================
-- 1. PROGRESSO FISICO PONDERADO
-- =============================================================================
insert into public.tasks (project_id, code, title, weight, progress, status, start_date, due_date) values
  ('99999999-9999-4999-8999-000000000001','T001','Tarefa peso 3', 3, 100, 'concluida', current_date - 30, current_date - 20),
  ('99999999-9999-4999-8999-000000000001','T002','Tarefa peso 1', 1,   0, 'nao_iniciada', current_date - 10, current_date + 10)
on conflict do nothing;

-- (100*3 + 0*1) / 4 = 75
select pg_temp.assert(
  app.calc_project_progress('99999999-9999-4999-8999-000000000001') = 75,
  'progresso e a media ponderada pelo peso das tarefas (75%)');

select pg_temp.assert(
  (select progress_actual from public.projects where code = 'TEST-001') = 75,
  'o gatilho propaga o progresso calculado para o projeto');

-- Tarefa cancelada nao entra no calculo
insert into public.tasks (project_id, code, title, weight, progress, status)
values ('99999999-9999-4999-8999-000000000001','T003','Cancelada', 10, 0, 'cancelada')
on conflict do nothing;

select pg_temp.assert(
  app.calc_project_progress('99999999-9999-4999-8999-000000000001') = 75,
  'tarefa cancelada e ignorada no calculo do progresso');

-- Subtarefa substitui a tarefa-pai (evita contagem dupla)
insert into public.tasks (id, project_id, code, title, weight, progress, status)
values ('99999999-9999-4999-8999-000000000010','99999999-9999-4999-8999-000000000001','T004','Pai', 4, 0, 'em_andamento')
on conflict do nothing;
insert into public.tasks (project_id, parent_task_id, code, title, weight, progress, status)
values ('99999999-9999-4999-8999-000000000001','99999999-9999-4999-8999-000000000010','T004.1','Filha', 4, 100, 'concluida')
on conflict do nothing;

-- Folhas: T001 (3, 100%), T002 (1, 0%), T004.1 (4, 100%) => 700/8 = 87.5
select pg_temp.assert(
  app.calc_project_progress('99999999-9999-4999-8999-000000000001') = 87.50,
  'apenas tarefas folha entram no calculo (subtarefa substitui a tarefa-pai)');

-- Status concluida forca progresso 100 e data de conclusao
update public.tasks set status = 'concluida' where code = 'T002' and project_id = '99999999-9999-4999-8999-000000000001';
select pg_temp.assert(
  (select progress = 100 and completed_at is not null from public.tasks
    where code = 'T002' and project_id = '99999999-9999-4999-8999-000000000001'),
  'status concluida fixa progresso em 100% e grava a data de conclusao');

-- Progresso manual nao e sobrescrito pelo calculo automatico
update public.projects set progress_method = 'manual', progress_actual = 42 where code = 'TEST-001';
update public.tasks set progress = 10 where code = 'T001' and project_id = '99999999-9999-4999-8999-000000000001';
select pg_temp.assert(
  (select progress_actual from public.projects where code = 'TEST-001') = 42,
  'projeto com metodologia manual preserva o progresso informado pelo Owner');
update public.projects set progress_method = 'automatico' where code = 'TEST-001';

-- Restricoes de dominio
-- Em tarefa concluida o gatilho normaliza o progresso para 100 antes do CHECK;
-- a restricao de dominio e verificada em uma tarefa nao concluida.
select pg_temp.assert_raises(
  $q$ insert into public.tasks (project_id, code, title, progress)
      values ('99999999-9999-4999-8999-000000000001','T901','Progresso invalido', 150) $q$,
  'progresso acima de 100% e rejeitado');
select pg_temp.assert(
  (select progress from public.tasks
    where code = 'T001' and project_id = '99999999-9999-4999-8999-000000000001') = 100,
  'tarefa concluida permanece com progresso normalizado em 100%');
select pg_temp.assert_raises(
  $q$ insert into public.tasks (project_id, code, title, weight)
      values ('99999999-9999-4999-8999-000000000001','T902','Peso invalido', 0) $q$,
  'peso zero ou negativo e rejeitado');
select pg_temp.assert_raises(
  $q$ insert into public.tasks (project_id, code, title, start_date, due_date)
      values ('99999999-9999-4999-8999-000000000001','T900','Datas invertidas', current_date, current_date - 5) $q$,
  'data de termino anterior ao inicio e rejeitada');

-- Reprogramacao de prazo gera historico
update public.tasks set due_date = current_date + 45
 where code = 'T002' and project_id = '99999999-9999-4999-8999-000000000001';
select pg_temp.assert(
  (select count(*) from public.task_reschedules r
     join public.tasks t on t.id = r.task_id
    where t.code = 'T002' and t.project_id = '99999999-9999-4999-8999-000000000001') > 0,
  'alteracao de prazo gera registro de reprogramacao');

-- =============================================================================
-- 2. ORCAMENTO E REVISOES
-- =============================================================================
insert into public.project_budgets (project_id, revision, amount, is_current)
values ('99999999-9999-4999-8999-000000000001', 0, 100000, true)
on conflict do nothing;
insert into public.project_budgets (project_id, revision, amount, is_current, justification)
values ('99999999-9999-4999-8999-000000000001', 1, 150000, true, 'Ampliacao de escopo')
on conflict do nothing;

select pg_temp.assert(
  (select count(*) from public.project_budgets
    where project_id = '99999999-9999-4999-8999-000000000001' and is_current) = 1,
  'apenas uma revisao de orcamento fica vigente por projeto');

select pg_temp.assert(
  (select amount from public.project_budgets
    where project_id = '99999999-9999-4999-8999-000000000001' and is_current) = 150000,
  'a revisao mais recente e a vigente');

select pg_temp.assert(
  (select count(*) from public.project_budgets
    where project_id = '99999999-9999-4999-8999-000000000001') = 2,
  'a revisao anterior e preservada no historico');

insert into public.financial_entries (project_id, nature, reference_month, amount) values
  ('99999999-9999-4999-8999-000000000001','realizado', date_trunc('month', current_date)::date, 40000),
  ('99999999-9999-4999-8999-000000000001','comprometido', date_trunc('month', current_date)::date, 20000),
  ('99999999-9999-4999-8999-000000000001','forecast', date_trunc('month', current_date)::date, 165000);

select pg_temp.assert(
  (select budget = 150000 and actual = 40000 and committed = 20000
     and remaining = 90000 and forecast_variance = 15000 and forecast_variance_pct = 10
   from public.v_project_financials where project_id = '99999999-9999-4999-8999-000000000001'),
  'resumo financeiro calcula saldo e variacao de forecast corretamente');

select pg_temp.assert_raises(
  $q$ insert into public.financial_entries (project_id, nature, reference_month, amount)
      values ('99999999-9999-4999-8999-000000000001','realizado', current_date, -100) $q$,
  'lancamento com valor negativo e rejeitado');

select pg_temp.assert_raises(
  $q$ insert into public.financial_entries (project_id, nature, reference_month, amount)
      values ('99999999-9999-4999-8999-000000000001','realizado', current_date + 3, 100) $q$,
  'competencia que nao seja o primeiro dia do mes e rejeitada');

-- =============================================================================
-- 3. RISCOS: SCORE E MATRIZ 5x5
-- =============================================================================
insert into public.risks (project_id, code, title, probability, impact, status)
values ('99999999-9999-4999-8999-000000000001','R001','Risco critico de teste', 5, 4, 'aberto')
on conflict do nothing;

select pg_temp.assert(
  (select score from public.risks where code = 'R001' and project_id = '99999999-9999-4999-8999-000000000001') = 20,
  'score do risco e probabilidade x impacto (coluna gerada)');

select pg_temp.assert(
  public.risk_criticality(20) = 'critico' and public.risk_criticality(9) = 'alto'
  and public.risk_criticality(4) = 'moderado' and public.risk_criticality(2) = 'baixo',
  'criticidade segue as faixas da matriz 5x5');

select pg_temp.assert_raises(
  $q$ insert into public.risks (project_id, code, title, probability, impact)
      values ('99999999-9999-4999-8999-000000000001','R900','Fora da escala', 6, 3) $q$,
  'probabilidade fora da escala 1-5 e rejeitada');

-- =============================================================================
-- 4. HEALTH SCORE AUTOMATICO
-- =============================================================================
-- Isola a variavel: o forecast dos testes anteriores estava 10% acima do
-- orcamento, o que por si so ja levaria a saude a vermelho.
update public.financial_entries set amount = 120000
 where project_id = '99999999-9999-4999-8999-000000000001' and nature = 'forecast';
update public.projects set progress_planned = 50, progress_actual = 50 where code = 'TEST-001';

-- Risco critico (score 20) sem estrategia nem plano deve levar a vermelho.
select pg_temp.assert(
  app.calc_project_health('99999999-9999-4999-8999-000000000001') = 'vermelho',
  'risco critico sem plano de mitigacao torna a saude vermelha');

update public.risks set strategy = 'mitigar', mitigation_plan = 'Plano definido e aprovado'
 where code = 'R001' and project_id = '99999999-9999-4999-8999-000000000001';

select pg_temp.assert(
  app.calc_project_health('99999999-9999-4999-8999-000000000001') <> 'vermelho',
  'definir estrategia e plano remove o gatilho de saude vermelha');

-- Marco critico vencido volta a saude para vermelha
insert into public.milestones (project_id, name, due_date, is_critical)
values ('99999999-9999-4999-8999-000000000001','Marco vencido', current_date - 5, true);

select pg_temp.assert(
  app.calc_project_health('99999999-9999-4999-8999-000000000001') = 'vermelho',
  'marco critico vencido torna a saude vermelha');

-- Projeto em espera e sempre cinza
update public.projects set status = 'em_espera' where code = 'TEST-001';
select pg_temp.assert(
  app.calc_project_health('99999999-9999-4999-8999-000000000001') = 'cinza',
  'projeto em espera fica com saude cinza');
update public.projects set status = 'em_andamento' where code = 'TEST-001';

-- =============================================================================
-- 5. CAMPOS PERSONALIZADOS: VALIDACAO DE TIPO E ESCOPO
-- =============================================================================
insert into public.custom_field_definitions (id, scope, entity, key, label, field_type)
values ('99999999-9999-4999-8999-000000000020','global','project','teste_lista','Lista de teste','lista_unica')
on conflict do nothing;
insert into public.custom_field_options (definition_id, value, label)
values ('99999999-9999-4999-8999-000000000020','a','Opcao A')
on conflict do nothing;

select pg_temp.assert_raises(
  $q$ insert into public.custom_field_values (definition_id, project_id, entity, record_id, value_text)
      values ('99999999-9999-4999-8999-000000000020','99999999-9999-4999-8999-000000000001','project',
              '99999999-9999-4999-8999-000000000001','valor_inexistente') $q$,
  'valor fora da lista de opcoes do campo personalizado e rejeitado');

insert into public.custom_field_values (definition_id, project_id, entity, record_id, value_text)
values ('99999999-9999-4999-8999-000000000020','99999999-9999-4999-8999-000000000001','project',
        '99999999-9999-4999-8999-000000000001','a');
select pg_temp.assert(
  (select value_text from public.custom_field_values
    where definition_id = '99999999-9999-4999-8999-000000000020') = 'a',
  'valor pertencente a lista de opcoes e aceito');

select pg_temp.assert_raises(
  $q$ insert into public.custom_field_definitions (scope, entity, key, label, field_type, template_id)
      values ('global','project','chave_invalida','X','texto','26262626-2626-4626-8626-000000000001') $q$,
  'campo global nao pode estar vinculado a um template');

select pg_temp.assert_raises(
  $q$ insert into public.custom_field_definitions (scope, entity, key, label, field_type)
      values ('global','project','Chave Invalida','X','texto') $q$,
  'chave tecnica com maiuscula ou espaco e rejeitada');

-- =============================================================================
-- 6. STATUS REPORT: IMUTABILIDADE APOS PUBLICACAO
-- =============================================================================
insert into public.status_reports (id, project_id, version, period_start, period_end, state, health,
                                   executive_summary, published_at)
values ('99999999-9999-4999-8999-000000000030','99999999-9999-4999-8999-000000000001', 1,
        current_date - 7, current_date, 'publicado', 'amarelo', 'Resumo original', now())
on conflict do nothing;

select pg_temp.assert_raises(
  $q$ update public.status_reports set executive_summary = 'Alterado silenciosamente'
      where id = '99999999-9999-4999-8999-000000000030' $q$,
  'status report publicado nao pode ser alterado');

select pg_temp.assert_raises(
  $q$ update public.status_reports set state = 'rascunho'
      where id = '99999999-9999-4999-8999-000000000030' $q$,
  'status report publicado nao pode voltar para rascunho');

-- Marcar como substituido continua permitido (fluxo de nova versao)
update public.status_reports set state = 'substituido' where id = '99999999-9999-4999-8999-000000000030';
select pg_temp.assert(
  (select state from public.status_reports where id = '99999999-9999-4999-8999-000000000030') = 'substituido',
  'publicar uma nova versao marca a anterior como substituida');

-- =============================================================================
-- 7. DECISOES E CALENDARIO CRITICO
-- =============================================================================
select pg_temp.assert_raises(
  $q$ insert into public.decisions (project_id, code, subject, status)
      values ('99999999-9999-4999-8999-000000000001','D900','Sem decisao registrada','aprovado') $q$,
  'decisao aprovada sem texto da decisao e data e rejeitada');

insert into public.critical_calendar_events (kind, name, start_date, end_date, is_freeze)
values ('fechamento_mensal','Janela de teste', current_date + 9, current_date + 12, true);

insert into public.milestones (project_id, name, due_date, is_critical)
values ('99999999-9999-4999-8999-000000000001','Go-live em janela critica', current_date + 10, true);

select pg_temp.assert(
  (select count(*) from public.v_calendar_conflicts
    where project_id = '99999999-9999-4999-8999-000000000001'
      and milestone_name = 'Go-live em janela critica') = 1,
  'marco dentro de janela critica aparece como conflito de calendario');

select pg_temp.assert_raises(
  $q$ insert into public.critical_calendar_events (kind, name, start_date, end_date)
      values ('itr','Periodo invertido', current_date + 10, current_date + 5) $q$,
  'janela com data final anterior a inicial e rejeitada');

-- =============================================================================
-- 8. AUDITORIA CAPTURA AS OPERACOES CRITICAS
-- =============================================================================
select pg_temp.assert(
  (select count(*) from public.application_audit_log
    where project_id = '99999999-9999-4999-8999-000000000001' and entity = 'projects') > 0,
  'alteracoes no projeto sao registradas na trilha de auditoria');

select pg_temp.assert(
  (select count(*) from public.application_audit_log
    where entity = 'project_budgets' and action = 'insert') > 0,
  'alteracoes de orcamento sao registradas na trilha de auditoria');

select pg_temp.assert(
  (select count(*) from public.application_audit_log
    where entity = 'projects' and action = 'status_change') > 0,
  'mudanca de status e classificada semanticamente na trilha');

select pg_temp.assert(
  (select changed_fields is not null and array_length(changed_fields, 1) > 0
   from public.application_audit_log
   where entity = 'projects' and action = 'status_change'
   order by id desc limit 1),
  'a trilha registra quais campos mudaram');

-- =============================================================================
-- 9. CADASTRO INICIAL VINCULADO AO TEMPLATE
-- =============================================================================
set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  false
);

select public.create_project_from_template(
  p_template_id => (select id from public.project_templates where code = 'TPL-REG'),
  p_code => 'TEST-TEMPLATE-LINK',
  p_name => 'Projeto temporario criado por template',
  p_start_date => current_date,
  p_target_date => current_date + 120
) as linked_project_id \gset

reset role;

select pg_temp.assert(
  (select count(*) from public.project_phases where project_id = :'linked_project_id') = 4,
  'cadastro inicial instancia as quatro fases do template vinculado');

select pg_temp.assert(
  (select count(*) from public.tasks where project_id = :'linked_project_id') = 8,
  'cadastro inicial instancia as oito tarefas do template vinculado');

-- =============================================================================
-- 10. MEMBROS, CAPACIDADE E HISTORICO DE ALOCACAO
-- =============================================================================
insert into public.project_members (
  project_id, profile_id, project_role, role_label, start_date, status
) values (
  '99999999-9999-4999-8999-000000000001',
  '11111111-1111-4111-8111-000000000008',
  'collaborator', 'Membro', current_date, 'ativo'
);

select pg_temp.assert_raises(
  $q$ insert into public.project_members
      (project_id, profile_id, project_role, role_label, start_date, status)
      values ('99999999-9999-4999-8999-000000000001',
              '11111111-1111-4111-8111-000000000008',
              'collaborator', 'Especialista', current_date, 'ativo') $q$,
  'o mesmo colaborador nao possui dois vinculos ativos no projeto');

select pg_temp.assert_raises(
  $q$ insert into public.resource_allocations
      (project_id, profile_id, period_start, period_end, allocated_hours)
      values ('99999999-9999-4999-8999-000000000001',
              '11111111-1111-4111-8111-000000000008',
              current_date, current_date + 6, 400) $q$,
  'sobrecarga sem justificativa e rejeitada');

insert into public.resource_allocations (
  project_id, profile_id, period_start, period_end, allocated_hours,
  allocation_pct, overload_justification
) values (
  '99999999-9999-4999-8999-000000000001',
  '11111111-1111-4111-8111-000000000008',
  current_date, current_date + 6, 400, 200,
  'Sobrecarga aprovada pelo gestor responsavel.'
);

select pg_temp.assert(
  (select overloaded from app.calculate_resource_allocation_capacity(
    '11111111-1111-4111-8111-000000000008', current_date, current_date + 6, 1, null
  )),
  'capacidade considera alocacoes em todos os projetos');

update public.resource_allocations
set status = 'cancelada'
where project_id = '99999999-9999-4999-8999-000000000001'
  and profile_id = '11111111-1111-4111-8111-000000000008';

select pg_temp.assert(
  (select current_hours = 0 from app.calculate_resource_allocation_capacity(
    '11111111-1111-4111-8111-000000000008', current_date, current_date + 6, 1, null
  )),
  'alocacao cancelada preserva historico sem consumir capacidade');

-- Limpeza do projeto de teste
delete from public.projects where code = 'TEST-001';
delete from public.projects where id = :'linked_project_id';
delete from public.custom_field_definitions where id = '99999999-9999-4999-8999-000000000020';
delete from public.critical_calendar_events where name = 'Janela de teste';

\echo '>>> TODOS OS TESTES DE REGRAS DE NEGOCIO PASSARAM'
