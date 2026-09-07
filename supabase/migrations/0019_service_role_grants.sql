-- =============================================================================
-- 0019 - Restaura os GRANTs de service_role no schema public
-- =============================================================================
--
-- Sintoma que levou aqui: a ponte de troca de ambiente falhava com
-- "permission denied for table profiles" ao entrar em QA, e as Edge Functions
-- administrativas (criar usuario, redefinir senha, excluir) tinham o mesmo
-- defeito latente ao gravar em `profiles`.
--
-- Diagnostico: divergencia de schema entre os ambientes. Conferindo os dois
-- bancos, PRD tinha GRANT de service_role nas 50 tabelas de `public`; QA nao
-- tinha em NENHUMA. Sem GRANT, o PostgREST recusa a requisicao no nivel da
-- tabela antes mesmo de a RLS ser avaliada - e como as Edge Functions sao o
-- unico lugar que usa service_role, o efeito so aparecia nelas.
--
-- Por que a 0011 nao cobre isso: ela revoga de `anon` e `authenticated` e
-- reconcede a `authenticated`, sem mencionar `service_role`. O acesso desse
-- papel vinha dos privilegios padrao do proprio Supabase, que em QA nao
-- alcancaram as tabelas criadas pelas migrations.
--
-- Seguranca: `service_role` e' o papel administrativo do backend, que por
-- design ignora RLS e existe apenas dentro das Edge Functions - a chave nunca
-- vai para o navegador (ver o scan de segredos no build). Conceder aqui apenas
-- restabelece o padrao do Supabase, alinhando QA ao que PRD ja' tem; nao abre
-- nada para `anon` nem para `authenticated`.
--
-- Idempotente: em PRD, onde os GRANTs ja' existem, e' no-op.

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- O schema `app` guarda as funcoes de autorizacao usadas pelas politicas.
grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;

-- Tabelas criadas depois desta migration ja' nascem acessiveis ao papel, para
-- que a divergencia nao volte a acontecer silenciosamente na proxima migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
