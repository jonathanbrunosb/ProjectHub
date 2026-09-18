-- =============================================================================
-- Agendamento do motor de alertas via Supabase Cron
--
-- `public.generate_alerts()` (0012) so' rodava manualmente, pela Central de
-- Notificacoes, restrita a Admin/PMO. Esta migration extrai a logica para
-- `app.run_alert_engine()` - sem a checagem de permissao - e agenda essa
-- versao interna via pg_cron, uma vez por dia.
--
-- A checagem de app.is_portfolio_manager() depende de auth.uid(), que e'
-- sempre nulo quando o job roda via pg_cron: nao ha sessao HTTP nem JWT, a
-- funcao e' chamada direto pelo scheduler dentro do proprio Postgres. Migrar
-- a checagem para dentro do agendamento exigiria contornar a autorizacao -
-- o caminho certo e' o cron chamar a logica interna diretamente, e a RPC
-- publica (`public.generate_alerts()`) continuar exigindo Admin/PMO para
-- quem aciona manualmente pela tela.
-- =============================================================================

create or replace function app.run_alert_engine()
returns int language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  -- Tarefas vencidas
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select t.assignee_id, t.project_id, 'task_overdue', 'alta',
         'Tarefa vencida: ' || t.title,
         'Prazo em ' || to_char(t.due_date, 'DD/MM/YYYY') || ' ainda nao concluida.',
         '/projetos/' || t.project_id || '/tarefas'
    from public.tasks t
   where t.assignee_id is not null
     and t.due_date < current_date
     and t.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = t.assignee_id and n.rule_key = 'task_overdue'
          and n.link like '%' || t.project_id || '%'
          and n.created_at > now() - interval '1 day'
     );
  get diagnostics v_count = row_count;

  -- Riscos criticos sem plano de mitigacao
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select coalesce(r.owner_id, p.owner_id), r.project_id, 'risk_critical_no_plan', 'critica',
         'Risco critico sem plano: ' || r.title,
         'Score ' || r.score || ' sem estrategia ou plano de mitigacao definido.',
         '/projetos/' || r.project_id || '/riscos'
    from public.risks r
    join public.projects p on p.id = r.project_id
   where r.score >= 15 and r.status in ('aberto','em_tratamento')
     and (r.mitigation_plan is null or r.strategy is null)
     and coalesce(r.owner_id, p.owner_id) is not null
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'risk_critical_no_plan' and n.project_id = r.project_id
          and n.created_at > now() - interval '3 days'
     );

  -- Planos de acao vencidos
  insert into public.notifications (profile_id, project_id, rule_key, severity, title, body, link)
  select a.owner_id, a.project_id, 'action_overdue', 'alta',
         'Plano de acao vencido: ' || a.title,
         'Prazo ' || to_char(a.due_date, 'DD/MM/YYYY') || ' expirado.',
         '/projetos/' || a.project_id || '/acoes'
    from public.action_plans a
   where a.owner_id is not null and a.due_date < current_date
     and a.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'action_overdue' and n.project_id = a.project_id
          and n.profile_id = a.owner_id and n.created_at > now() - interval '1 day'
     );

  return v_count;
end $$;

-- app.run_alert_engine nao vive no schema exposto pelo PostgREST (so' `public`
-- e' exposto), entao nao e' alcancavel via /rest/v1/rpc/ de forma alguma -
-- ainda assim, fecha explicitamente o acesso, seguindo o padrao de
-- 20260911160000 (nenhuma funcao de automacao interna deve ficar aberta por
-- omissao).
revoke all on function app.run_alert_engine() from public, anon, authenticated;

-- public.generate_alerts() vira um wrapper fino: mantem a exigencia de
-- Admin/PMO para quem aciona manualmente (Central de Notificacoes), e chama a
-- mesma logica que o cron executa - sem duplicar codigo, sem risco de as duas
-- vias divergirem no futuro.
create or replace function public.generate_alerts()
returns int language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_portfolio_manager() then
    raise exception 'Somente Admin/PMO executam o motor de alertas'
      using errcode = 'insufficient_privilege';
  end if;
  return app.run_alert_engine();
end $$;
revoke all on function public.generate_alerts() from public, anon;
grant execute on function public.generate_alerts() to authenticated;

-- -----------------------------------------------------------------------------
-- Agendamento (somente onde pg_cron esta disponivel - Supabase hospedado).
--
-- pg_cron exige shared_preload_libraries no postgresql.conf; nao e' algo que
-- CREATE EXTENSION habilita num Postgres generico. O Postgres usado pelo CI e
-- por supabase/tests/run.sh (imagem postgres:16 padrao) nao tem a extensao
-- compilada - o guard evita que a suite quebre ali. Em QA/PRD (Supabase
-- hospedado), pg_cron ja vem disponivel para instalar.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';

    if exists (select 1 from cron.job where jobname = 'generate-alerts-daily') then
      perform cron.unschedule('generate-alerts-daily');
    end if;

    -- 10:00 UTC = 07:00 America/Sao_Paulo (sem horario de verao atualmente) -
    -- antes do inicio do expediente, para as notificacoes estarem prontas
    -- quando o time comeca a trabalhar. Roda todo dia, inclusive fim de
    -- semana, para nao represar atraso ate segunda-feira.
    perform cron.schedule('generate-alerts-daily', '0 10 * * *',
      $sql$select app.run_alert_engine();$sql$);
  else
    raise notice 'pg_cron indisponivel neste ambiente - agendamento nao aplicado (esperado fora do Supabase hospedado).';
  end if;
end $$;
