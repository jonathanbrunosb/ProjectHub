-- =============================================================================
-- SEED DEMONSTRATIVO - PMO Contabil
-- Uso: ambiente local/homologacao. NUNCA em producao.
--   supabase db reset            (aplica migrations + este seed)
--   psql "$DB_URL" -f supabase/seed.sql
-- Senha de todos os usuarios demo: Pmo@2026
-- =============================================================================
-- =============================================================================
-- GUARDA DE AMBIENTE
-- Este seed cria massa ficticia e pertence exclusivamente ao ambiente de QA.
-- Se o banco se declarar como PRD, a carga e' abortada antes de qualquer
-- escrita - dados de teste nunca podem contaminar Producao.
-- =============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'app_environment'
  ) and exists (
    select 1 from public.app_environment where environment = 'PRD'
  ) then
    raise exception 'Seeds de teste sao proibidos em Producao (app_environment = PRD).';
  end if;
end $$;

begin;

-- -----------------------------------------------------------------------------
-- Usuarios de demonstracao (auth.users -> trigger cria profiles)
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000001','authenticated','authenticated','admin@pmocontabil.dev',   crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Ana Ribeiro"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000002','authenticated','authenticated','pmo@pmocontabil.dev',     crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Carlos Menezes"}',now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000003','authenticated','authenticated','sponsor@pmocontabil.dev', crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Helena Duarte"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000004','authenticated','authenticated','owner1@pmocontabil.dev',  crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Rafael Souza"}',  now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000005','authenticated','authenticated','owner2@pmocontabil.dev',  crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Juliana Alves"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000006','authenticated','authenticated','colab@pmocontabil.dev',   crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Marcos Lima"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000007','authenticated','authenticated','auditor@pmocontabil.dev', crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Patricia Nunes"}',now(), now()),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-000000000008','authenticated','authenticated','consulta@pmocontabil.dev',crypt('Pmo@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Bruno Castro"}',  now(), now())
on conflict (id) do nothing;

-- Insercao direta em auth.users (fora do fluxo normal de cadastro do GoTrue)
-- deixa os campos de token com NULL. O GoTrue espera string vazia nesses
-- campos e falha no login com "Database error querying schema" caso contrario.
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email like '%@pmocontabil.dev';

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
  from auth.users u
 where u.email like '%@pmocontabil.dev'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Estrutura organizacional
-- -----------------------------------------------------------------------------
insert into public.companies (id, code, name) values
  ('22222222-2222-4222-8222-000000000001','HOLD','Holding Corporativa S.A.'),
  ('22222222-2222-4222-8222-000000000002','IND', 'Industria Sul Ltda.'),
  ('22222222-2222-4222-8222-000000000003','SERV','Servicos Compartilhados Ltda.')
on conflict (code) do nothing;

insert into public.business_units (id, company_id, code, name) values
  ('23232323-2323-4323-8323-000000000001','22222222-2222-4222-8222-000000000001','CTB','Contabilidade Corporativa'),
  ('23232323-2323-4323-8323-000000000002','22222222-2222-4222-8222-000000000001','FIS','Fiscal e Tributario'),
  ('23232323-2323-4323-8323-000000000003','22222222-2222-4222-8222-000000000002','CTBI','Contabilidade Industrial'),
  ('23232323-2323-4323-8323-000000000004','22222222-2222-4222-8222-000000000003','CSC','Centro de Servicos Compartilhados')
on conflict do nothing;

insert into public.areas (id, business_unit_id, code, name, manager_user_id, max_allocation_pct) values
  ('24242424-2424-4424-8424-000000000001','23232323-2323-4323-8323-000000000001','CTS','Contabilidade Societaria','11111111-1111-4111-8111-000000000001', 85),
  ('24242424-2424-4424-8424-000000000002','23232323-2323-4323-8323-000000000002','FIS','Fiscal e Tributario','11111111-1111-4111-8111-000000000005', 85),
  ('24242424-2424-4424-8424-000000000003','23232323-2323-4323-8323-000000000001','CTL','Controladoria','11111111-1111-4111-8111-000000000002', 90),
  ('24242424-2424-4424-8424-000000000004','23232323-2323-4323-8323-000000000001','AUT','Automacao e Dados', null, 90)
on conflict (id) do nothing;

insert into public.cost_centers (code, name) values
  ('CC-1001','Contabilidade Corporativa'),
  ('CC-1002','Projetos Regulatorios'),
  ('CC-1003','Transformacao Digital')
on conflict (code) do nothing;

-- Papeis e vinculos dos usuarios demo
update public.profiles set can_switch_environment = true, role = 'admin',         full_name = 'Ana Ribeiro',    job_title = 'Gerente de Contabilidade', company_id = '22222222-2222-4222-8222-000000000001', business_unit_id = '23232323-2323-4323-8323-000000000001', weekly_capacity_hours = 40 where email = 'admin@pmocontabil.dev';
update public.profiles set role = 'pmo',           full_name = 'Carlos Menezes', job_title = 'PMO Contabil',             company_id = '22222222-2222-4222-8222-000000000001', business_unit_id = '23232323-2323-4323-8323-000000000001', weekly_capacity_hours = 40 where email = 'pmo@pmocontabil.dev';
update public.profiles set role = 'sponsor',       full_name = 'Helena Duarte',  job_title = 'Diretora de Controladoria',company_id = '22222222-2222-4222-8222-000000000001', weekly_capacity_hours = 10 where email = 'sponsor@pmocontabil.dev';
update public.profiles set role = 'project_owner', full_name = 'Rafael Souza',   job_title = 'Coordenador Contabil',     company_id = '22222222-2222-4222-8222-000000000001', weekly_capacity_hours = 40 where email = 'owner1@pmocontabil.dev';
update public.profiles set role = 'project_owner', full_name = 'Juliana Alves',  job_title = 'Coordenadora Fiscal',      company_id = '22222222-2222-4222-8222-000000000002', weekly_capacity_hours = 40 where email = 'owner2@pmocontabil.dev';
update public.profiles set role = 'collaborator',  full_name = 'Marcos Lima',    job_title = 'Analista Contabil Senior', company_id = '22222222-2222-4222-8222-000000000001', weekly_capacity_hours = 40 where email = 'colab@pmocontabil.dev';
update public.profiles set role = 'auditor',       full_name = 'Patricia Nunes', job_title = 'Auditoria Interna',        company_id = '22222222-2222-4222-8222-000000000001', weekly_capacity_hours = 40 where email = 'auditor@pmocontabil.dev';
update public.profiles set role = 'viewer',        full_name = 'Bruno Castro',   job_title = 'Analista de Negocios',     company_id = '22222222-2222-4222-8222-000000000003', weekly_capacity_hours = 40 where email = 'consulta@pmocontabil.dev';

-- Vinculo de Area (gatilhos da migration 0020 sincronizam profiles.area_id).
insert into public.user_area_assignments (user_id, area_id, is_primary, valid_from)
select p.id, v.area_id, true, current_date
  from public.profiles p
  join (values
    ('admin@pmocontabil.dev',    '24242424-2424-4424-8424-000000000001'::uuid),
    ('pmo@pmocontabil.dev',      '24242424-2424-4424-8424-000000000003'::uuid),
    ('sponsor@pmocontabil.dev',  '24242424-2424-4424-8424-000000000003'::uuid),
    ('owner1@pmocontabil.dev',   '24242424-2424-4424-8424-000000000001'::uuid),
    ('owner2@pmocontabil.dev',   '24242424-2424-4424-8424-000000000002'::uuid),
    ('colab@pmocontabil.dev',    '24242424-2424-4424-8424-000000000004'::uuid)
  ) as v(email, area_id) on v.email = p.email
 where not exists (
   select 1 from public.user_area_assignments u where u.user_id = p.id and u.is_primary and u.valid_to is null
 );

insert into public.portfolios (id, code, name, description, owner_id) values
  ('25252525-2525-4525-8525-000000000001','PTF-CTB','Portfolio Contabilidade Corporativa','Carteira consolidada de iniciativas da Contabilidade','11111111-1111-4111-8111-000000000002')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Campos personalizados (escopo global e por template)
-- -----------------------------------------------------------------------------
insert into public.custom_field_definitions (id, scope, entity, key, label, description, field_type, required, position) values
  ('27272727-2727-4727-8727-000000000001','global','project','norma_referencia','Norma de referencia','Norma/CPC/IFRS aplicavel','texto', false, 1),
  ('27272727-2727-4727-8727-000000000002','global','project','impacto_fechamento','Impacto no fechamento','Grau de impacto na rotina de fechamento','lista_unica', false, 2),
  ('27272727-2727-4727-8727-000000000003','global','project','horas_estimadas','Horas estimadas','Esforco total estimado do projeto','numero', false, 3)
on conflict do nothing;

insert into public.custom_field_options (definition_id, value, label, color, position) values
  ('27272727-2727-4727-8727-000000000002','alto','Alto','danger',1),
  ('27272727-2727-4727-8727-000000000002','medio','Medio','warn',2),
  ('27272727-2727-4727-8727-000000000002','baixo','Baixo','ok',3)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Calendario critico contabil
-- -----------------------------------------------------------------------------
insert into public.critical_calendar_events (company_id, kind, name, start_date, end_date, is_freeze, severity)
select null, k.kind::app.calendar_window_kind, k.name, k.d1, k.d2, k.freeze_flag, k.sev::app.priority
from (values
  ('fechamento_mensal','Fechamento mensal', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '4 day')::date, true, 'alta'),
  ('fechamento_mensal','Fechamento mensal (M+1)', (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) + interval '1 month 4 day')::date, true, 'alta'),
  ('fechamento_trimestral','Fechamento trimestral', (date_trunc('quarter', current_date) + interval '3 month')::date, (date_trunc('quarter', current_date) + interval '3 month 8 day')::date, true, 'critica'),
  ('itr','Entrega ITR', (date_trunc('quarter', current_date) + interval '3 month 15 day')::date, (date_trunc('quarter', current_date) + interval '3 month 20 day')::date, false, 'critica'),
  ('ecd','Entrega ECD', (date_trunc('year', current_date) + interval '5 month')::date, (date_trunc('year', current_date) + interval '5 month 30 day')::date, false, 'critica'),
  ('ecf','Entrega ECF', (date_trunc('year', current_date) + interval '6 month')::date, (date_trunc('year', current_date) + interval '6 month 30 day')::date, false, 'critica'),
  ('auditoria','Trabalhos de campo Auditoria Externa', (current_date + 20)::date, (current_date + 45)::date, false, 'alta'),
  ('inventario','Inventario fisico anual', (date_trunc('year', current_date) + interval '11 month')::date, (date_trunc('year', current_date) + interval '11 month 10 day')::date, true, 'alta')
) as k(kind, name, d1, d2, freeze_flag, sev)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Regras de automacao
-- -----------------------------------------------------------------------------
insert into public.automation_rules (key, name, event_type, threshold_days, threshold_pct, severity) values
  ('task_due_soon','Tarefa vence em X dias','task_due_soon', 3, null, 'media'),
  ('task_overdue','Tarefa vencida','task_overdue', 0, null, 'alta'),
  ('milestone_due_soon','Marco proximo','milestone_due_soon', 7, null, 'alta'),
  ('risk_critical_no_plan','Risco critico sem plano','risk_critical_no_plan', null, null, 'critica'),
  ('action_overdue','Plano de acao vencido','action_overdue', 0, null, 'alta'),
  ('project_stale','Projeto sem atualizacao','project_stale', 14, null, 'media'),
  ('budget_over','Orcamento acima do limite','budget_over', null, 90, 'alta'),
  ('forecast_over_budget','Forecast acima do budget','forecast_over_budget', null, 100, 'alta'),
  ('area_overloaded','Area sobrecarregada','area_overloaded', null, 100, 'alta'),
  ('decision_deadline','Decisao proxima do prazo','decision_deadline', 5, null, 'alta')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- PROJETOS DEMONSTRATIVOS
-- Diferentes status, saude, progresso, custo, riscos e prazos.
-- =============================================================================
begin;

insert into public.projects (
  id, code, name, portfolio_id, template_id, category, objective, scope, expected_results,
  executive_summary, executive_summary_updated_at,
  sponsor_id, owner_id, area_id, company_id, priority, status, phase,
  health, progress_method, start_date, target_date, baseline_start_date, baseline_target_date, evm_enabled
) values
  ('31313131-3131-4131-8131-000000000001','CTB-2026-001','IFRS 18 / CPC 51 - Apresentacao e Divulgacao',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000001','Regulatorio',
   'Adotar o IFRS 18 / CPC 51 nas demonstracoes financeiras consolidadas.',
   'Analise de impacto, redesenho da DRE por categorias, notas explicativas, MPMs e sistemas de reporte.',
   'Demonstracoes aderentes a norma a partir do exercicio corrente, com auditoria sem ressalvas.',
   'Analise de impactos concluida em 3 das 4 entidades. Redesenho da DRE em validacao com a Auditoria Externa. Risco de prazo na parametrizacao do consolidador.',
   now() - interval '3 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000004',
   '24242424-2424-4424-8424-000000000001','22222222-2222-4222-8222-000000000001',
   'critica','em_andamento','Adequacao','amarelo','automatico',
   current_date - 120, current_date + 90, current_date - 120, current_date + 60, false),

  ('31313131-3131-4131-8131-000000000002','CTB-2026-002','Reforma Tributaria - IBS/CBS Fase 1',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000002','Regulatorio',
   'Preparar processos, sistemas e controles para o novo modelo IBS/CBS.',
   'Mapeamento de operacoes, parametrizacao fiscal, apuracao paralela e treinamento.',
   'Apuracao paralela operante e equipe treinada antes do periodo de transicao.',
   'Mapeamento de operacoes finalizado. Parametrizacao fiscal iniciada. Dependencia critica de definicao regulamentar pendente.',
   now() - interval '10 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000005',
   '24242424-2424-4424-8424-000000000002','22222222-2222-4222-8222-000000000001',
   'critica','em_andamento','Analise de Impactos','vermelho','automatico',
   current_date - 90, current_date + 150, current_date - 90, current_date + 150, false),

  ('31313131-3131-4131-8131-000000000003','CTB-2026-003','Migracao SAP S/4HANA - Modulo FI/CO',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000003','Sistemas',
   'Migrar a contabilidade do ECC para o SAP S/4HANA.',
   'Blueprint, conversao de dados, testes integrados, cutover e suporte pos go-live.',
   'Go-live sem impacto no fechamento e com reducao do tempo de apuracao.',
   'Blueprint aprovado. Conversao de dados em ciclo 2. Go-live planejado fora da janela de fechamento trimestral.',
   now() - interval '5 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000004',
   '24242424-2424-4424-8424-000000000004','22222222-2222-4222-8222-000000000002',
   'alta','em_andamento','Realizacao','amarelo','automatico',
   current_date - 200, current_date + 120, current_date - 200, current_date + 90, true),

  ('31313131-3131-4131-8131-000000000004','CTB-2026-004','IA aplicada a Contabilidade - Classificacao e Analise',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000004','Inovacao',
   'Aplicar IA na classificacao contabil e na analise de variacoes do fechamento.',
   'PoC de classificacao de lancamentos, analise de variacoes e assistente de consulta a politicas.',
   'Reducao de 30% do tempo de analise de variacoes e maior consistencia de classificacao.',
   'PoC de classificacao com acuracidade de 91% na base de teste. Definindo criterios de governanca do modelo antes de escalar.',
   now() - interval '2 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000004',
   '24242424-2424-4424-8424-000000000004','22222222-2222-4222-8222-000000000001',
   'media','em_andamento','Prova de Conceito','verde','automatico',
   current_date - 60, current_date + 60, current_date - 60, current_date + 60, false),

  ('31313131-3131-4131-8131-000000000005','CTB-2026-005','Fechamento Contabil D+4',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000005','Melhoria Continua',
   'Reduzir o ciclo de fechamento contabil de D+8 para D+4.',
   'Redesenho do cronograma de fechamento, antecipacao de conciliacoes, automacao de provisoes e checklists.',
   'Fechamento concluido em D+4 de forma sustentavel, com reducao de horas extras.',
   'Piloto concluido em duas entidades com fechamento em D+5. Ajustes de provisao automatica em andamento.',
   now() - interval '7 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000004',
   '24242424-2424-4424-8424-000000000001','22222222-2222-4222-8222-000000000003',
   'alta','em_andamento','Implantacao','verde','automatico',
   current_date - 150, current_date + 30, current_date - 150, current_date + 30, false),

  ('31313131-3131-4131-8131-000000000006','CTB-2025-011','Automacao de Conciliacoes Contabeis',
   '25252525-2525-4525-8525-000000000001','26262626-2626-4626-8626-000000000004','Inovacao',
   'Automatizar as conciliacoes de maior volume e risco.',
   'Conciliacao bancaria, contas a pagar/receber e intercompany.',
   'Reducao de 60% do esforco manual e trilha de conciliacao rastreavel.',
   'Projeto concluido. Conciliacoes bancaria, AP/AR e intercompany automatizadas com trilha completa.',
   now() - interval '40 day',
   '11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000005',
   '24242424-2424-4424-8424-000000000004','22222222-2222-4222-8222-000000000003',
   'media','concluido','Encerramento','verde','manual',
   current_date - 300, current_date - 30, current_date - 300, current_date - 45, false)
on conflict (code) do nothing;

update public.projects set progress_actual = 100, actual_end_date = current_date - 30 where code = 'CTB-2025-011';

insert into public.project_business_units (project_id, business_unit_id, is_primary) values
  ('31313131-3131-4131-8131-000000000001','23232323-2323-4323-8323-000000000001', true),
  ('31313131-3131-4131-8131-000000000001','23232323-2323-4323-8323-000000000003', false),
  ('31313131-3131-4131-8131-000000000002','23232323-2323-4323-8323-000000000002', true),
  ('31313131-3131-4131-8131-000000000003','23232323-2323-4323-8323-000000000003', true),
  ('31313131-3131-4131-8131-000000000004','23232323-2323-4323-8323-000000000001', true),
  ('31313131-3131-4131-8131-000000000005','23232323-2323-4323-8323-000000000004', true),
  ('31313131-3131-4131-8131-000000000006','23232323-2323-4323-8323-000000000004', true)
on conflict do nothing;

insert into public.project_members (project_id, profile_id, project_role, role_label, can_edit)
select p.id, m.profile_id, m.prole::app.role_key, m.label, m.edit
from public.projects p
cross join (values
  ('11111111-1111-4111-8111-000000000004'::uuid,'project_owner','Gerente do Projeto', true),
  ('11111111-1111-4111-8111-000000000006'::uuid,'collaborator','Analista', true),
  ('11111111-1111-4111-8111-000000000003'::uuid,'sponsor','Sponsor', false),
  ('11111111-1111-4111-8111-000000000008'::uuid,'viewer','Consulta', false)
) as m(profile_id, prole, label, edit)
where p.code in ('CTB-2026-001','CTB-2026-003','CTB-2026-004','CTB-2026-005')
on conflict do nothing;

insert into public.project_members (project_id, profile_id, project_role, role_label, can_edit)
select p.id, m.profile_id, m.prole::app.role_key, m.label, m.edit
from public.projects p
cross join (values
  ('11111111-1111-4111-8111-000000000005'::uuid,'project_owner','Gerente do Projeto', true),
  ('11111111-1111-4111-8111-000000000006'::uuid,'collaborator','Analista', true),
  ('11111111-1111-4111-8111-000000000003'::uuid,'sponsor','Sponsor', false)
) as m(profile_id, prole, label, edit)
where p.code in ('CTB-2026-002','CTB-2025-011')
on conflict do nothing;

-- Fases dos projetos
insert into public.project_phases (project_id, name, position, weight, start_date, end_date)
select p.id, f.name, f.pos, f.w, p.start_date + f.d1, p.start_date + f.d2
from public.projects p
cross join (values
  ('Diagnostico',1,1,0,30),
  ('Analise de Impactos',2,2,25,80),
  ('Adequacao',3,3,75,160),
  ('Divulgacao e Encerramento',4,1,155,200)
) as f(name,pos,w,d1,d2)
where p.code in ('CTB-2026-001','CTB-2026-002')
on conflict do nothing;

commit;

-- =============================================================================
-- Tarefas, marcos, riscos, financeiro, recursos, decisoes e indicadores
-- =============================================================================
begin;

insert into public.tasks (project_id, code, title, description, assignee_id, priority, status,
                          start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.descr, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Mapear requisitos da norma','Leitura tecnica e checklist de requisitos aplicaveis','11111111-1111-4111-8111-000000000004','alta','concluida',0,20,2,100,false,false,60),
  ('T002','Levantar base de dados atual','Extracao e qualidade das bases contabeis','11111111-1111-4111-8111-000000000006','media','concluida',10,35,1,100,false,false,40),
  ('T003','Quantificar impactos contabeis','Simulacao dos efeitos nas demonstracoes','11111111-1111-4111-8111-000000000004','critica','concluida',30,70,3,100,false,true,120),
  ('T004','Validar impactos com Auditoria Externa','Workshop tecnico e alinhamento de entendimento','11111111-1111-4111-8111-000000000004','critica','em_andamento',70,95,2,60,true,true,40),
  ('T005','Ajustar plano de contas e parametrizacoes','Reestruturacao de contas e centros','11111111-1111-4111-8111-000000000006','alta','em_andamento',90,150,3,35,false,true,160),
  ('T006','Adequar politicas contabeis','Revisao e aprovacao das politicas','11111111-1111-4111-8111-000000000004','media','nao_iniciada',120,170,2,0,false,false,60),
  ('T007','Elaborar notas explicativas','Redacao e revisao das divulgacoes','11111111-1111-4111-8111-000000000006','alta','nao_iniciada',160,195,2,0,false,false,80),
  ('T008','Aprovacao final do Comite','Submissao ao Comite de Divulgacao','11111111-1111-4111-8111-000000000004','critica','nao_iniciada',195,205,1,0,true,true,8)
) as t(code,title,descr,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2026-001'
on conflict do nothing;

insert into public.tasks (project_id, code, title, assignee_id, priority, status, start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Mapear operacoes e enquadramento IBS/CBS','11111111-1111-4111-8111-000000000005','critica','concluida',0,40,3,100,false,true,140),
  ('T002','Avaliar impacto em precos e margens','11111111-1111-4111-8111-000000000005','alta','em_andamento',35,90,3,45,false,true,120),
  ('T003','Parametrizar motor fiscal','11111111-1111-4111-8111-000000000006','critica','bloqueada',60,120,3,10,false,true,200),
  ('T004','Apuracao paralela - ciclo 1','11111111-1111-4111-8111-000000000006','critica','nao_iniciada',120,170,2,0,true,true,80),
  ('T005','Treinamento das equipes','11111111-1111-4111-8111-000000000005','media','nao_iniciada',150,200,1,0,false,false,60)
) as t(code,title,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2026-002'
on conflict do nothing;

insert into public.tasks (project_id, code, title, assignee_id, priority, status, start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Blueprint FI/CO','11111111-1111-4111-8111-000000000004','alta','concluida',0,60,3,100,true,true,240),
  ('T002','Conversao de dados - ciclo 1','11111111-1111-4111-8111-000000000006','alta','concluida',60,120,2,100,false,false,160),
  ('T003','Conversao de dados - ciclo 2','11111111-1111-4111-8111-000000000006','alta','em_andamento',120,190,2,55,false,true,160),
  ('T004','Testes integrados','11111111-1111-4111-8111-000000000004','critica','nao_iniciada',190,260,3,0,false,true,200),
  ('T005','Cutover e go-live','11111111-1111-4111-8111-000000000004','critica','nao_iniciada',260,290,2,0,true,true,80)
) as t(code,title,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2026-003'
on conflict do nothing;

insert into public.tasks (project_id, code, title, assignee_id, priority, status, start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Definir casos de uso e criterios de sucesso','11111111-1111-4111-8111-000000000004','alta','concluida',0,15,1,100,false,false,30),
  ('T002','Preparar base historica de lancamentos','11111111-1111-4111-8111-000000000006','media','concluida',10,35,2,100,false,false,60),
  ('T003','PoC de classificacao automatica','11111111-1111-4111-8111-000000000006','alta','em_andamento',30,70,3,70,false,true,120),
  ('T004','Definir governanca do modelo','11111111-1111-4111-8111-000000000004','alta','em_andamento',50,85,2,30,false,false,40),
  ('T005','Apresentacao de resultados ao Comite','11111111-1111-4111-8111-000000000004','media','nao_iniciada',85,95,1,0,true,false,16)
) as t(code,title,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2026-004'
on conflict do nothing;

insert into public.tasks (project_id, code, title, assignee_id, priority, status, start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Mapear cronograma atual de fechamento','11111111-1111-4111-8111-000000000004','alta','concluida',0,25,2,100,false,false,60),
  ('T002','Antecipar conciliacoes criticas','11111111-1111-4111-8111-000000000006','alta','concluida',20,70,3,100,false,true,120),
  ('T003','Automatizar provisoes recorrentes','11111111-1111-4111-8111-000000000006','alta','em_andamento',70,130,3,65,false,true,140),
  ('T004','Piloto em duas entidades','11111111-1111-4111-8111-000000000004','critica','em_andamento',110,160,2,80,true,true,80),
  ('T005','Rollout completo','11111111-1111-4111-8111-000000000004','alta','nao_iniciada',160,180,2,0,true,true,60)
) as t(code,title,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2026-005'
on conflict do nothing;

insert into public.tasks (project_id, code, title, assignee_id, priority, status, start_date, due_date, baseline_due_date, weight, progress, is_milestone, is_critical, estimated_hours)
select p.id, t.code, t.title, t.assignee::uuid, t.prio::app.priority, t.st::app.task_status,
       p.start_date + t.d1, p.start_date + t.d2, p.start_date + t.d2, t.w, t.prog, t.ms, t.crit, t.hrs
from public.projects p
cross join (values
  ('T001','Automatizar conciliacao bancaria','11111111-1111-4111-8111-000000000006','alta','concluida',0,80,3,100,false,false,160),
  ('T002','Automatizar AP/AR','11111111-1111-4111-8111-000000000006','alta','concluida',70,180,3,100,false,false,180),
  ('T003','Automatizar intercompany','11111111-1111-4111-8111-000000000005','alta','concluida',170,255,3,100,true,true,160),
  ('T004','Encerramento e transferencia para operacao','11111111-1111-4111-8111-000000000005','media','concluida',255,270,1,100,false,false,40)
) as t(code,title,assignee,prio,st,d1,d2,w,prog,ms,crit,hrs)
where p.code = 'CTB-2025-011'
on conflict do nothing;

-- Marcos derivados das tarefas marcadas como marco
insert into public.milestones (project_id, task_id, name, due_date, baseline_date, is_critical, owner_id, completed_at)
select t.project_id, t.id, t.title, t.due_date, t.baseline_due_date, t.is_critical, t.assignee_id,
       case when t.status = 'concluida' then t.completed_at end
  from public.tasks t
 where t.is_milestone
on conflict do nothing;

-- Checklists de exemplo
insert into public.task_checklist_items (task_id, label, done, position)
select t.id, c.label, c.done, c.pos
from public.tasks t
cross join (values ('Evidencia arquivada', false, 1), ('Revisao do coordenador', false, 2), ('Aprovacao do Owner', false, 3)) as c(label, done, pos)
where t.code = 'T004' and t.project_id = '31313131-3131-4131-8131-000000000001'
on conflict do nothing;

-- Dependencias
insert into public.task_dependencies (predecessor_id, successor_id, dependency_type, lag_days)
select p.id, s.id, 'FS', 0
from public.tasks p
join public.tasks s on s.project_id = p.project_id
where p.project_id = '31313131-3131-4131-8131-000000000002'
  and ((p.code, s.code) in (('T001','T002'), ('T002','T003'), ('T003','T004'), ('T004','T005')))
on conflict do nothing;

commit;

-- =============================================================================
-- Financeiro, riscos, acoes, recursos, decisoes, indicadores e status reports
-- =============================================================================
begin;

insert into public.project_budgets (project_id, revision, amount, effective_from, is_current, justification, approved_by)
values
  ('31313131-3131-4131-8131-000000000001', 0, 1200000.00, current_date - 120, false, 'Orcamento original aprovado', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000001', 1, 1450000.00, current_date - 30,  true,  'Revisao por ampliacao de escopo (2 entidades adicionais)', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000002', 0, 2300000.00, current_date - 90,  true,  'Orcamento original aprovado', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000003', 0, 5800000.00, current_date - 200, true,  'Orcamento original aprovado', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000004', 0,  380000.00, current_date - 60,  true,  'Verba de inovacao', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000005', 0,  620000.00, current_date - 150, true,  'Orcamento original aprovado', '11111111-1111-4111-8111-000000000003'),
  ('31313131-3131-4131-8131-000000000006', 0,  450000.00, current_date - 300, true,  'Orcamento original aprovado', '11111111-1111-4111-8111-000000000003')
on conflict do nothing;

-- Curva mensal: orcado / realizado / comprometido / forecast
insert into public.financial_entries (project_id, nature, reference_month, amount, category, supplier, cost_center_id, description)
select
  p.id,
  n.nature::app.financial_nature,
  (date_trunc('month', current_date) - make_interval(months => m.i))::date,
  round((b.amount / 12) * n.factor * (0.8 + (m.i % 4) * 0.12), 2),
  n.category,
  n.supplier,
  (select id from public.cost_centers where code = 'CC-1002'),
  n.category || ' - competencia M-' || m.i
from public.projects p
join public.project_budgets b on b.project_id = p.id and b.is_current
cross join generate_series(0, 5) as m(i)
cross join (values
  ('orcado',       1.00, 'Orcamento',   null),
  ('realizado',    0.85, 'Consultoria', 'Consultoria Tecnica Ltda'),
  ('comprometido', 0.12, 'Licencas',    'Fornecedor de Software S.A.')
) as n(nature, factor, category, supplier)
where p.status <> 'cancelado'
on conflict do nothing;

-- Forecast para os proximos 6 meses
insert into public.financial_entries (project_id, nature, reference_month, amount, category, description)
select
  p.id, 'forecast',
  (date_trunc('month', current_date) + make_interval(months => m.i))::date,
  round((b.amount / 12) * (case when p.code = 'CTB-2026-002' then 1.18 else 0.95 end), 2),
  'Forecast', 'Projecao de gasto M+' || m.i
from public.projects p
join public.project_budgets b on b.project_id = p.id and b.is_current
cross join generate_series(0, 5) as m(i)
where p.status = 'em_andamento'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Riscos e issues
-- -----------------------------------------------------------------------------
insert into public.risks (project_id, code, kind, category, title, description, cause, consequence,
                          probability, impact, owner_id, strategy, mitigation_plan, due_date, status,
                          identified_at, last_review_at)
values
  ('31313131-3131-4131-8131-000000000001','R001','risco','Prazo','Atraso na parametrizacao do consolidador',
   'A parametrizacao do sistema consolidador pode nao concluir antes do fechamento trimestral.',
   'Fila de demandas concorrentes no time de sistemas.','Divulgacao fora do padrao exigido pela norma.',
   4, 4, '11111111-1111-4111-8111-000000000004','mitigar',
   'Antecipar parametrizacao das entidades criticas e alocar recurso dedicado por 6 semanas.',
   current_date + 25, 'em_tratamento', current_date - 60, current_date - 7),

  ('31313131-3131-4131-8131-000000000001','R002','risco','Auditoria','Divergencia de interpretacao com a Auditoria Externa',
   'Entendimento distinto sobre a segregacao de categorias na DRE.',
   'Norma recente com pouca pratica de mercado.','Retrabalho na divulgacao e possivel ressalva.',
   3, 4, '11111111-1111-4111-8111-000000000004','mitigar',
   'Workshop tecnico mensal com a Auditoria e formalizacao dos entendimentos em memorando.',
   current_date + 15, 'em_tratamento', current_date - 45, current_date - 5),

  ('31313131-3131-4131-8131-000000000002','R003','risco','Regulatorio','Regulamentacao complementar ainda pendente',
   'Definicoes operacionais do IBS/CBS ainda nao publicadas.',
   'Cronograma regulatorio externo.','Parametrizacao fiscal sem base normativa definitiva; retrabalho relevante.',
   5, 5, '11111111-1111-4111-8111-000000000005', null, null,
   current_date + 10, 'aberto', current_date - 50, current_date - 20),

  ('31313131-3131-4131-8131-000000000002','R004','issue','Capacidade','Equipe fiscal sobrecarregada',
   'Time fiscal acumula projeto e rotina de apuracao.',
   'Ausencia de reforco de equipe aprovado.','Atraso na parametrizacao e risco de erro na apuracao corrente.',
   4, 4, '11111111-1111-4111-8111-000000000005','mitigar',
   'Contratar 2 analistas temporarios e redistribuir rotinas nao criticas.',
   current_date - 5, 'em_tratamento', current_date - 30, current_date - 10),

  ('31313131-3131-4131-8131-000000000003','R005','risco','Sistemas','Qualidade dos dados convertidos',
   'Divergencias entre saldos ECC e S/4HANA no ciclo 2.',
   'Historico de lancamentos com cadastros inconsistentes.','Reconciliacao manual extensa no cutover.',
   3, 5, '11111111-1111-4111-8111-000000000004','mitigar',
   'Reconciliacao automatizada por conta e por entidade a cada ciclo de conversao.',
   current_date + 40, 'em_tratamento', current_date - 80, current_date - 12),

  ('31313131-3131-4131-8131-000000000003','R006','risco','Prazo','Go-live proximo a janela de fechamento',
   'Cutover planejado com folga reduzida em relacao ao fechamento trimestral.',
   'Dependencia de testes integrados.','Impacto direto no prazo de fechamento contabil.',
   3, 5, '11111111-1111-4111-8111-000000000004','evitar',
   'Reposicionar o cutover para apos o fechamento e congelar mudancas na janela critica.',
   current_date + 60, 'aberto', current_date - 40, current_date - 3),

  ('31313131-3131-4131-8131-000000000004','R007','risco','Governanca','Ausencia de criterio de aceitacao do modelo de IA',
   'Falta de politica formal para uso de modelo em classificacao contabil.',
   'Tema novo, sem precedente interno.','Uso do modelo sem rastreabilidade adequada para auditoria.',
   3, 3, '11111111-1111-4111-8111-000000000004','mitigar',
   'Definir politica de uso, limiar de confianca e revisao humana obrigatoria abaixo do limiar.',
   current_date + 20, 'em_tratamento', current_date - 25, current_date - 4),

  ('31313131-3131-4131-8131-000000000005','R008','risco','Processo','Dependencia de fechamento manual em provisoes',
   'Provisoes recorrentes ainda dependem de planilha.',
   'Automacao em desenvolvimento.','Nao atingimento do D+4 de forma sustentavel.',
   2, 4, '11111111-1111-4111-8111-000000000006','mitigar',
   'Concluir automacao das 8 provisoes de maior volume antes do proximo fechamento.',
   current_date + 12, 'em_tratamento', current_date - 35, current_date - 6)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Planos de acao
-- -----------------------------------------------------------------------------
insert into public.action_plans (project_id, risk_id, code, title, description, origin, owner_id, due_date, status, priority)
select r.project_id, r.id, a.code, a.title, a.descr, a.origin, a.owner::uuid, current_date + a.dd, a.st::app.action_status, a.prio::app.priority
from public.risks r
join (values
  ('R001','AP001','Alocar recurso dedicado de sistemas','Formalizar alocacao de 1 FTE por 6 semanas','risco','11111111-1111-4111-8111-000000000004', 10,'em_andamento','alta'),
  ('R002','AP002','Formalizar memorando de entendimento','Documentar posicao tecnica acordada com a Auditoria','risco','11111111-1111-4111-8111-000000000004', 20,'nao_iniciada','media'),
  ('R004','AP003','Contratar reforco temporario para o Fiscal','Abrir requisicao de 2 analistas temporarios','issue','11111111-1111-4111-8111-000000000005', -8,'em_andamento','critica'),
  ('R005','AP004','Implantar reconciliacao automatica por conta','Script de reconciliacao ECC x S/4HANA por entidade','risco','11111111-1111-4111-8111-000000000006', 25,'em_andamento','alta'),
  ('R006','AP005','Reposicionar cutover fora da janela de fechamento','Revisar cronograma de cutover com a area de sistemas','risco','11111111-1111-4111-8111-000000000004', 15,'nao_iniciada','critica'),
  ('R007','AP006','Publicar politica de uso de IA na Contabilidade','Definir limiar de confianca e revisao humana','risco','11111111-1111-4111-8111-000000000004', 18,'em_andamento','alta'),
  ('R008','AP007','Automatizar 8 provisoes de maior volume','Desenvolver e homologar automacao das provisoes','risco','11111111-1111-4111-8111-000000000006', -3,'em_andamento','alta')
) as a(rcode, code, title, descr, origin, owner, dd, st, prio) on a.rcode = r.code
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Alocacao de recursos (gera sobrecarga proposital em parte do time)
-- -----------------------------------------------------------------------------
insert into public.resource_allocations (
  project_id, profile_id, role_label, period_start, period_end,
  allocated_hours, allocation_pct, overload_justification
)
select p.id, m.profile_id, m.role_label,
       date_trunc('month', current_date)::date,
       (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
       a.hours, a.pct,
       'Carga demonstrativa aprovada para validar o alerta de sobrecarga.'
from public.projects p
join public.project_members m on m.project_id = p.id
join (values
  ('CTB-2026-001','11111111-1111-4111-8111-000000000004'::uuid, 260, 40),
  ('CTB-2026-001','11111111-1111-4111-8111-000000000006'::uuid, 210, 32),
  ('CTB-2026-002','11111111-1111-4111-8111-000000000005'::uuid, 420, 65),
  ('CTB-2026-002','11111111-1111-4111-8111-000000000006'::uuid, 190, 29),
  ('CTB-2026-003','11111111-1111-4111-8111-000000000004'::uuid, 300, 45),
  ('CTB-2026-003','11111111-1111-4111-8111-000000000006'::uuid, 170, 26),
  ('CTB-2026-004','11111111-1111-4111-8111-000000000006'::uuid, 160, 25),
  ('CTB-2026-005','11111111-1111-4111-8111-000000000004'::uuid, 180, 28)
) as a(pcode, prof, hours, pct) on a.pcode = p.code and a.prof = m.profile_id
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Decisoes e aprovacoes
-- -----------------------------------------------------------------------------
insert into public.decisions (project_id, code, subject, context, alternatives, recommendation, decider_id, deadline, status, decision, rationale, decided_at)
values
  ('31313131-3131-4131-8131-000000000001','D001','Adocao antecipada do IFRS 18',
   'Possibilidade de adotar a norma um exercicio antes da obrigatoriedade.',
   '1) Adocao antecipada integral; 2) Adocao antecipada apenas na controladora; 3) Aguardar obrigatoriedade.',
   'Adocao antecipada integral, aproveitando o projeto ja em curso e reduzindo custo incremental.',
   '11111111-1111-4111-8111-000000000003', current_date + 12, 'aguardando_decisao', null, null, null),

  ('31313131-3131-4131-8131-000000000002','D002','Contratacao de reforco para o time fiscal',
   'Time fiscal com alocacao acima de 100% da capacidade no trimestre.',
   '1) Contratar 2 temporarios; 2) Postergar frentes nao criticas; 3) Contratar consultoria.',
   'Contratar 2 analistas temporarios por 6 meses - menor custo e retencao de conhecimento interno.',
   '11111111-1111-4111-8111-000000000003', current_date + 5, 'aguardando_decisao', null, null, null),

  ('31313131-3131-4131-8131-000000000003','D003','Janela de cutover do S/4HANA',
   'Cutover atualmente planejado proximo ao fechamento trimestral.',
   '1) Manter data; 2) Postergar 30 dias; 3) Antecipar 15 dias.',
   'Postergar 30 dias, evitando sobreposicao com o fechamento e reduzindo risco operacional.',
   '11111111-1111-4111-8111-000000000003', current_date - 10, 'aprovado',
   'Cutover postergado em 30 dias.', 'Risco operacional sobre o fechamento trimestral considerado inaceitavel.',
   now() - interval '9 day'),

  ('31313131-3131-4131-8131-000000000004','D004','Escalar a PoC de IA para producao',
   'PoC atingiu 91% de acuracidade na base de teste.',
   '1) Escalar integralmente; 2) Escalar com revisao humana obrigatoria; 3) Encerrar PoC.',
   'Escalar com revisao humana obrigatoria abaixo do limiar de confianca de 95%.',
   '11111111-1111-4111-8111-000000000003', current_date + 25, 'em_preparacao', null, null, null)
on conflict do nothing;

insert into public.approvals (decision_id, project_id, entity, approver_id, approved, comment, responded_at)
select d.id, d.project_id, 'decision', d.decider_id,
       case when d.status = 'aprovado' then true end,
       case when d.status = 'aprovado' then 'Aprovado em Steering Committee.' end,
       case when d.status = 'aprovado' then d.decided_at end
  from public.decisions d
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Indicadores
-- -----------------------------------------------------------------------------
insert into public.indicators (project_id, name, description, category, unit, target_value, current_value, direction, frequency, source, owner_id, trend)
values
  ('31313131-3131-4131-8131-000000000005','Prazo de fechamento (D+)','Dias uteis ate o fechamento contabil','Eficiencia','prazo', 4, 5, 'menor_melhor','mensal','Cronograma de fechamento','11111111-1111-4111-8111-000000000004','caindo'),
  ('31313131-3131-4131-8131-000000000005','Horas extras no fechamento','Total de horas extras da equipe no ciclo','Eficiencia','quantidade', 40, 68, 'menor_melhor','mensal','Folha de ponto','11111111-1111-4111-8111-000000000004','caindo'),
  ('31313131-3131-4131-8131-000000000004','Acuracidade da classificacao','Percentual de acerto do modelo na base de teste','Qualidade','percentual', 95, 91, 'maior_melhor','mensal','Relatorio do modelo','11111111-1111-4111-8111-000000000006','subindo'),
  ('31313131-3131-4131-8131-000000000006','Conciliacoes automatizadas','Percentual de conciliacoes sem intervencao manual','Automacao','percentual', 80, 86, 'maior_melhor','mensal','Log de conciliacao','11111111-1111-4111-8111-000000000005','estavel'),
  ('31313131-3131-4131-8131-000000000001','Entidades adequadas a norma','Entidades com DRE reestruturada','Conformidade','quantidade', 4, 3, 'maior_melhor','mensal','Controle do projeto','11111111-1111-4111-8111-000000000004','subindo')
on conflict do nothing;

insert into public.indicator_measurements (indicator_id, reference_date, value, target_value)
select i.id,
       (date_trunc('month', current_date) - make_interval(months => m.i))::date,
       case when i.direction = 'menor_melhor'
            then round(i.current_value + m.i * 0.6, 2)
            else round(greatest(0, i.current_value - m.i * 2.5), 2) end,
       i.target_value
  from public.indicators i
  cross join generate_series(0, 5) as m(i)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Status Reports (um publicado com snapshot, um em rascunho)
-- -----------------------------------------------------------------------------
insert into public.status_reports (project_id, version, period_start, period_end, state, health,
  progress_actual, progress_planned, progress_in_period, executive_summary, main_deliveries, next_steps,
  risks_summary, financial_summary, required_decisions, published_at, published_by, snapshot)
values
  ('31313131-3131-4131-8131-000000000001', 1, current_date - 14, current_date - 7, 'publicado', 'amarelo',
   52, 58, 6,
   'Analise de impactos concluida em 3 das 4 entidades. Parametrizacao do consolidador em risco de prazo.',
   'Quantificacao de impactos concluida; workshop com Auditoria Externa realizado.',
   'Concluir parametrizacao da 4a entidade e formalizar memorando com a Auditoria.',
   'R001 (prazo do consolidador) em tratamento com recurso dedicado; R002 em mitigacao.',
   'Orcamento revisado para R$ 1,45 mi. Realizado dentro do previsto para o periodo.',
   'Decisao D001 - adocao antecipada do IFRS 18 - pendente de Sponsor.',
   now() - interval '7 day', '11111111-1111-4111-8111-000000000004',
   jsonb_build_object('generated_at', now() - interval '7 day', 'note', 'snapshot de seed'))
on conflict do nothing;

insert into public.status_reports (project_id, version, period_start, period_end, state, health,
  progress_actual, progress_planned, executive_summary, next_steps)
values
  ('31313131-3131-4131-8131-000000000002', 1, current_date - 7, current_date, 'rascunho', 'vermelho',
   28, 45,
   'Parametrizacao fiscal bloqueada por ausencia de regulamentacao complementar. Equipe fiscal sobrecarregada.',
   'Escalar decisao de reforco de equipe e revisar cronograma com base no calendario regulatorio.')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Valores de campos personalizados
-- -----------------------------------------------------------------------------
insert into public.custom_field_values (definition_id, project_id, entity, record_id, value_text)
values
  ('27272727-2727-4727-8727-000000000001','31313131-3131-4131-8131-000000000001','project','31313131-3131-4131-8131-000000000001','IFRS 18 / CPC 51'),
  ('27272727-2727-4727-8727-000000000001','31313131-3131-4131-8131-000000000002','project','31313131-3131-4131-8131-000000000002','EC 132/2023 - LC 214/2025'),
  ('27272727-2727-4727-8727-000000000002','31313131-3131-4131-8131-000000000001','project','31313131-3131-4131-8131-000000000001','alto'),
  ('27272727-2727-4727-8727-000000000002','31313131-3131-4131-8131-000000000005','project','31313131-3131-4131-8131-000000000005','alto')
on conflict do nothing;

insert into public.custom_field_values (definition_id, project_id, entity, record_id, value_number)
values
  ('27272727-2727-4727-8727-000000000003','31313131-3131-4131-8131-000000000001','project','31313131-3131-4131-8131-000000000001', 1240),
  ('27272727-2727-4727-8727-000000000003','31313131-3131-4131-8131-000000000003','project','31313131-3131-4131-8131-000000000003', 3800)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Visualizacoes salvas compartilhadas
-- -----------------------------------------------------------------------------
insert into public.saved_views (owner_id, module, name, scope, is_default, config)
values
  ('11111111-1111-4111-8111-000000000002','portfolio','Projetos criticos','compartilhada', false,
   jsonb_build_object('filters', jsonb_build_object('health', jsonb_build_array('vermelho'), 'status', jsonb_build_array('em_andamento')),
                      'sort', jsonb_build_array(jsonb_build_object('id','progress_deviation','desc', false)))),
  ('11111111-1111-4111-8111-000000000002','portfolio','Regulatorios','compartilhada', false,
   jsonb_build_object('filters', jsonb_build_object('category', jsonb_build_array('Regulatorio'))))
on conflict do nothing;

-- Recalcula progresso e saude apos a carga
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform app.refresh_project_progress(r.id);
  end loop;
  update public.projects p
     set health = app.calc_project_health(p.id)
   where not p.health_is_manual;
end $$;

commit;
