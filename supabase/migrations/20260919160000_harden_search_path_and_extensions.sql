-- =============================================================================
-- Hardening: search_path explicito + extensao relocavel fora do public
--
-- Levantamento de seguranca (get_advisors) em QA/PRD apontou 15 funcoes sem
-- search_path fixo e duas extensoes instaladas em public. Nenhuma das 15
-- funcoes chama objeto de extensao (confirmado lendo cada definicao) - todas
-- so referenciam tabelas app.*/public.* ja totalmente qualificadas no corpo,
-- entao fixar o search_path aqui e' pura defesa em profundidade, sem risco
-- funcional: fecha a classe de bug que ja pegou app.webhook_post
-- (20260919150000) antes que apareca de novo em alguma funcao nova.
--
-- Extensoes: btree_gist e' relocavel (extrelocatable = true) e nao e' usada
-- por nenhum indice/constraint do schema hoje (nenhum EXCLUDE USING gist; o
-- unico indice GiST existente, critical_calendar_period_idx, usa suporte
-- nativo de daterange, nao operadores do btree_gist) - mover e' seguro.
-- pg_net **nao e' relocavel** (extrelocatable = false, confirmado direto no
-- catalogo em QA) - `alter extension pg_net set schema` falharia. E'
-- gerenciada pelo proprio Supabase com schema proprio fixo (`net`), entao o
-- achado "extension_in_public" para pg_net fica aceito como esta, sem acao -
-- forcar via drop/recreate arriscaria quebrar o webhook (PR #66/#68) por um
-- ganho de hardening que a propria extensao nao suporta.
-- =============================================================================

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension
     where extname = 'btree_gist' and extnamespace = 'public'::regnamespace
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

alter function app.attach_audit(regclass) set search_path = public, app;
alter function app.attach_stamps(regclass) set search_path = public, app;
alter function app.audit_log_is_append_only() set search_path = public, app;
alter function app.business_days_between(date, date) set search_path = public, app;
alter function app.calc_delivery_score(date, date, integer, integer, text, numeric, numeric, numeric) set search_path = public, app;
alter function app.calc_project_planned_progress(uuid, date) set search_path = public, app;
alter function app.calc_project_progress(uuid) set search_path = public, app;
alter function app.calendar_days_between(date, date) set search_path = public, app;
alter function app.count_business_days_inclusive(date, date) set search_path = public, app;
alter function app.guard_task_dependency_integrity() set search_path = public, app;
alter function app.is_business_day(date) set search_path = public, app;
alter function app.set_created_fields() set search_path = public, app;
alter function app.set_updated_fields() set search_path = public, app;
alter function app.status_reports_immutable() set search_path = public, app;
alter function public.risk_criticality(integer) set search_path = public, app;
