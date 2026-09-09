-- =============================================================================
-- Catalogo funcional compartilhado por QA e PRD
-- Pode ser executado antes e depois do seed: os totais devem permanecer iguais.
-- =============================================================================

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

select pg_temp.assert(
  (select count(*) from public.project_templates where active) = 6,
  'catalogo possui os seis templates ativos usados no cadastro de projetos');

select pg_temp.assert(
  (select count(*)
     from public.template_phases ph
     join public.project_templates t on t.id = ph.template_id
    where t.code in ('TPL-REG', 'TPL-SIS')) = 8,
  'templates regulatorio e de sistemas possuem as oito fases de referencia');

select pg_temp.assert(
  (select count(*)
     from public.template_tasks tt
     join public.project_templates t on t.id = tt.template_id
    where t.code = 'TPL-REG') = 8,
  'template regulatorio possui exatamente oito tarefas sem duplicacao');

select pg_temp.assert(
  exists (
    select 1
      from public.custom_field_definitions d
      join public.project_templates t on t.id = d.template_id
     where d.scope = 'template'
       and d.entity = 'project'
       and d.key = 'ambiente_sap'
       and t.code = 'TPL-SIS'
       and d.active
  ),
  'campo personalizado de referencia esta vinculado ao template de sistemas');

select pg_temp.assert(
  not exists (
    select template_id, position
      from public.template_tasks
     group by template_id, position
    having count(*) > 1
  ),
  'catalogo nao possui tarefas duplicadas por template e posicao');

\echo '>>> CATALOGO DE TEMPLATES DE REFERENCIA VALIDADO'
