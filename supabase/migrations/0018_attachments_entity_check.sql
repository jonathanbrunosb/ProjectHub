-- =============================================================================
-- 0018 - Restringe os valores validos de attachments.entity
--
-- A tabela (migration 0009) sempre teve `entity`/`entity_id` polimorficos, mas
-- sem CHECK - diferente de `comments`, que ja restringe os mesmos valores.
-- Fecha essa lacuna antes de a interface de upload existir, evitando um valor
-- de entidade incorreto silencioso.
-- =============================================================================
alter table public.attachments
  add constraint attachments_entity_ck
  check (entity in ('project', 'task', 'risk', 'action_plan', 'decision', 'status_report'));
