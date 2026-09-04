-- =============================================================================
-- 0001 - Fundacao: extensoes, schema utilitario, enums e gatilhos comuns
-- =============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums de dominio
-- -----------------------------------------------------------------------------
create type app.role_key as enum (
  'admin', 'pmo', 'sponsor', 'project_owner', 'collaborator', 'viewer', 'auditor'
);

create type app.project_status as enum (
  'planejamento', 'em_andamento', 'em_espera', 'concluido', 'cancelado'
);

create type app.health as enum ('verde', 'amarelo', 'vermelho', 'cinza');

create type app.priority as enum ('baixa', 'media', 'alta', 'critica');

create type app.task_status as enum (
  'nao_iniciada', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida', 'cancelada'
);

create type app.progress_method as enum ('manual', 'automatico');

create type app.dependency_type as enum ('FS', 'SS', 'FF', 'SF');

create type app.custom_field_type as enum (
  'texto', 'texto_longo', 'numero', 'moeda', 'percentual', 'data', 'data_hora',
  'boolean', 'lista_unica', 'multipla_escolha', 'usuario', 'equipe', 'status', 'url'
);

create type app.custom_field_scope as enum ('global', 'template', 'projeto');

create type app.financial_nature as enum (
  'orcado', 'realizado', 'comprometido', 'forecast'
);

create type app.risk_kind as enum ('risco', 'issue');
create type app.risk_strategy as enum ('evitar', 'mitigar', 'transferir', 'aceitar');
create type app.risk_status as enum ('aberto', 'em_tratamento', 'mitigado', 'materializado', 'encerrado');

create type app.action_status as enum ('nao_iniciada', 'em_andamento', 'concluida', 'cancelada');

create type app.decision_status as enum (
  'em_preparacao', 'aguardando_decisao', 'aprovado', 'rejeitado', 'reavaliar'
);

create type app.indicator_unit as enum ('numero', 'moeda', 'percentual', 'quantidade', 'prazo', 'score');
create type app.indicator_frequency as enum ('diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'anual');
create type app.trend as enum ('subindo', 'estavel', 'caindo');

create type app.status_report_state as enum ('rascunho', 'publicado', 'substituido');

create type app.saved_view_scope as enum ('privada', 'compartilhada', 'padrao_projeto', 'padrao_template');

create type app.audit_action as enum (
  'login', 'logout', 'login_failed', 'insert', 'update', 'delete',
  'status_change', 'health_change', 'financial_change', 'schedule_change',
  'ownership_change', 'export', 'permission_change', 'config_change'
);

create type app.calendar_window_kind as enum (
  'fechamento_mensal', 'fechamento_trimestral', 'itr', 'dfp', 'ecd', 'ecf',
  'entrega_regulatoria', 'inventario', 'auditoria', 'freeze', 'outro'
);

create type app.notification_channel as enum ('in_app', 'email', 'teams', 'webhook');

-- -----------------------------------------------------------------------------
-- Gatilhos comuns de auditoria de linha
-- -----------------------------------------------------------------------------
create or replace function app.set_created_fields()
returns trigger language plpgsql as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end $$;

create or replace function app.set_updated_fields()
returns trigger language plpgsql as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end $$;

-- Aplica os dois gatilhos padrao em uma tabela.
create or replace function app.attach_stamps(p_table regclass)
returns void language plpgsql as $$
declare t text := p_table::text;
begin
  execute format('drop trigger if exists trg_stamp_ins on %s', t);
  execute format('create trigger trg_stamp_ins before insert on %s for each row execute function app.set_created_fields()', t);
  execute format('drop trigger if exists trg_stamp_upd on %s', t);
  execute format('create trigger trg_stamp_upd before update on %s for each row execute function app.set_updated_fields()', t);
end $$;
