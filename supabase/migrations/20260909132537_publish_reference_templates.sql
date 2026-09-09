-- =============================================================================
-- Catalogo de templates de referencia compartilhado por QA e PRD
--
-- Estes registros nao sao massa ficticia: sao opcoes funcionais usadas no
-- cadastro inicial de projetos e no vinculo de campos personalizados. A carga
-- e idempotente para poder alinhar ambientes ja provisionados sem duplicar
-- fases ou tarefas.
-- =============================================================================

insert into public.project_templates (
  id, code, name, category, description, evm_enabled,
  default_progress_method, default_health_auto, active, financial_module_default
) values
  ('26262626-2626-4626-8626-000000000001','TPL-REG','Projeto Regulatorio / Normas','Regulatorio','Adocao de normas contabeis e requisitos regulatorios',false,'automatico',true,true,'inherit'),
  ('26262626-2626-4626-8626-000000000002','TPL-TRIB','Reforma Tributaria','Regulatorio','Adequacao a reforma tributaria (IBS/CBS)',false,'automatico',true,true,'inherit'),
  ('26262626-2626-4626-8626-000000000003','TPL-SIS','Implementacao de Sistema','Sistemas','Implantacao ou migracao de sistemas corporativos',true,'automatico',true,true,'inherit'),
  ('26262626-2626-4626-8626-000000000004','TPL-INO','Inovacao / IA / PoC','Inovacao','Provas de conceito e iniciativas de inovacao',false,'automatico',true,true,'inherit'),
  ('26262626-2626-4626-8626-000000000005','TPL-MEL','Melhoria de Processos','Melhoria Continua','Otimizacao de processos contabeis e de fechamento',false,'automatico',true,true,'inherit'),
  ('26262626-2626-4626-8626-000000000006','TPL-COM','Controles / Compliance','Compliance','Estruturacao e teste de controles internos',false,'automatico',true,true,'inherit')
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  evm_enabled = excluded.evm_enabled,
  default_progress_method = excluded.default_progress_method,
  default_health_auto = excluded.default_health_auto,
  active = excluded.active,
  financial_module_default = excluded.financial_module_default;

with phase_data(code, name, position, weight) as (
  values
    ('TPL-REG','Diagnostico',1,1::numeric),
    ('TPL-REG','Analise de Impactos',2,2::numeric),
    ('TPL-REG','Adequacao',3,3::numeric),
    ('TPL-REG','Divulgacao e Encerramento',4,1::numeric),
    ('TPL-SIS','Planejamento',1,1::numeric),
    ('TPL-SIS','Blueprint',2,2::numeric),
    ('TPL-SIS','Realizacao',3,3::numeric),
    ('TPL-SIS','Testes e Go-live',4,2::numeric)
)
insert into public.template_phases (template_id, name, position, weight)
select t.id, p.name, p.position, p.weight
  from phase_data p
  join public.project_templates t on t.code = p.code
on conflict (template_id, position) do update set
  name = excluded.name,
  weight = excluded.weight;

-- template_tasks nao possui chave natural unica; primeiro sincronizamos as
-- posicoes existentes e depois inserimos somente as ausentes.
with task_data(phase_position, title, position, weight, offset_start_days, duration_days, is_milestone) as (
  values
    (1,'Mapear requisitos da norma',1,2::numeric,0,15,false),
    (1,'Levantar base de dados atual',2,1::numeric,5,15,false),
    (2,'Quantificar impactos contabeis',3,3::numeric,20,25,false),
    (2,'Validar impactos com Auditoria',4,2::numeric,40,10,true),
    (3,'Ajustar plano de contas e parametrizacoes',5,3::numeric,50,30,false),
    (3,'Adequar politicas contabeis',6,2::numeric,55,20,false),
    (4,'Elaborar notas explicativas',7,2::numeric,85,20,false),
    (4,'Aprovacao final do Comite',8,1::numeric,105,5,true)
)
update public.template_tasks tt
   set template_phase_id = ph.id,
       title = d.title,
       description = null,
       weight = d.weight,
       offset_start_days = d.offset_start_days,
       duration_days = d.duration_days,
       is_milestone = d.is_milestone
  from task_data d
  join public.project_templates t on t.code = 'TPL-REG'
  join public.template_phases ph on ph.template_id = t.id and ph.position = d.phase_position
 where tt.template_id = t.id
   and tt.position = d.position;

with task_data(phase_position, title, position, weight, offset_start_days, duration_days, is_milestone) as (
  values
    (1,'Mapear requisitos da norma',1,2::numeric,0,15,false),
    (1,'Levantar base de dados atual',2,1::numeric,5,15,false),
    (2,'Quantificar impactos contabeis',3,3::numeric,20,25,false),
    (2,'Validar impactos com Auditoria',4,2::numeric,40,10,true),
    (3,'Ajustar plano de contas e parametrizacoes',5,3::numeric,50,30,false),
    (3,'Adequar politicas contabeis',6,2::numeric,55,20,false),
    (4,'Elaborar notas explicativas',7,2::numeric,85,20,false),
    (4,'Aprovacao final do Comite',8,1::numeric,105,5,true)
)
insert into public.template_tasks (
  template_id, template_phase_id, title, description, position, weight,
  offset_start_days, duration_days, is_milestone
)
select t.id, ph.id, d.title, null, d.position, d.weight,
       d.offset_start_days, d.duration_days, d.is_milestone
  from task_data d
  join public.project_templates t on t.code = 'TPL-REG'
  join public.template_phases ph on ph.template_id = t.id and ph.position = d.phase_position
 where not exists (
   select 1
     from public.template_tasks tt
    where tt.template_id = t.id
      and tt.position = d.position
 );

-- Campo de referencia que demonstra e habilita o escopo por template.
update public.custom_field_definitions d
   set label = 'Ambiente SAP',
       field_type = 'texto',
       required = false,
       position = 1,
       active = true
  from public.project_templates t
 where t.code = 'TPL-SIS'
   and d.scope = 'template'
   and d.template_id = t.id
   and d.entity = 'project'
   and d.key = 'ambiente_sap';

insert into public.custom_field_definitions (
  id, scope, template_id, entity, key, label, field_type, required, position, active
)
select '27272727-2727-4727-8727-000000000004', 'template', t.id,
       'project', 'ambiente_sap', 'Ambiente SAP', 'texto', false, 1, true
  from public.project_templates t
 where t.code = 'TPL-SIS'
   and not exists (
     select 1
       from public.custom_field_definitions d
      where d.scope = 'template'
        and d.template_id = t.id
        and d.entity = 'project'
        and d.key = 'ambiente_sap'
   );
