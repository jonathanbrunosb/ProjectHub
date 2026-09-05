-- =============================================================================
-- 0014 - Segregacao de ambientes (QA / PRD)
--
-- QA e PRD sao projetos Supabase fisicamente separados. Este schema e' aplicado
-- identicamente nos dois; o que difere e' a linha de public.app_environment,
-- que declara qual ambiente aquele banco representa.
--
-- ATENCAO: os ALTER TYPE abaixo apenas ADICIONAM valores ao enum. Eles nao
-- podem ser usados na mesma transacao em que sao criados - por isso a funcao
-- que os consome fica na migration 0015.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Novos eventos de auditoria
-- -----------------------------------------------------------------------------
alter type app.audit_action add value if not exists 'environment_switch';
alter type app.audit_action add value if not exists 'environment_switch_denied';

-- -----------------------------------------------------------------------------
-- Permissao de alternar ambiente (perfil tecnico / DEV)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists can_switch_environment boolean not null default false;

comment on column public.profiles.can_switch_environment is
  'Permite usar o seletor QA/PRD na interface. A seguranca real vem de os '
  'ambientes serem projetos Supabase distintos: sem conta no projeto de destino '
  'nao ha acesso a dado algum, independentemente desta flag.';

-- -----------------------------------------------------------------------------
-- Declaracao do ambiente deste banco
--
-- Serve a dois propositos:
--   1. o seed de teste se recusa a rodar quando o banco e' PRD;
--   2. o frontend compara o ambiente selecionado com o declarado pelo banco e
--      alerta em caso de divergencia - protege contra apontar a variavel de PRD
--      para o projeto de QA por engano.
-- -----------------------------------------------------------------------------
create table if not exists public.app_environment (
  -- Padrao de linha unica: a PK booleana com check impede uma segunda linha.
  id boolean primary key default true,
  environment text not null,
  updated_at timestamptz not null default now(),
  constraint app_environment_singleton_ck check (id),
  constraint app_environment_value_ck check (environment in ('QA', 'PRD'))
);

alter table public.app_environment enable row level security;

-- Leitura por qualquer autenticado (o frontend precisa validar o ambiente);
-- escrita apenas por Admin, e' uma configuracao estrutural.
drop policy if exists app_environment_read on public.app_environment;
create policy app_environment_read on public.app_environment for select to authenticated
  using (auth.uid() is not null);

drop policy if exists app_environment_write on public.app_environment;
create policy app_environment_write on public.app_environment for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Este projeto e' o ambiente de QA (era o unico existente ate aqui).
-- No projeto de PRODUCAO, rode depois de aplicar as migrations:
--   update public.app_environment set environment = 'PRD', updated_at = now();
insert into public.app_environment (id, environment)
values (true, 'QA')
on conflict (id) do nothing;

select app.attach_audit('public.app_environment');
