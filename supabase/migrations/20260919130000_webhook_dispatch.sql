-- =============================================================================
-- Entrega externa de notificacoes: webhook generico
--
-- O enum app.notification_channel ja contemplava 'webhook' desde a 0001, e o
-- motor de alertas (app.run_alert_engine, agendado via pg_cron desde
-- 20260918190000) ja gera as notificacoes in-app - faltava so' o disparo
-- externo. Esta migration fecha essa lacuna com o canal mais generico
-- possivel: uma URL HTTP configuravel pelo Admin, que recebe um POST JSON
-- para cada notificacao pendente. Um webhook cru destrava qualquer
-- integracao downstream sem esperar client nativo (Zapier, Make, n8n,
-- Incoming Webhook do Teams, ou um endpoint proprio).
--
-- Entrega via pg_net (net.http_post) direto do Postgres, reaproveitando o
-- mesmo ciclo do pg_cron que ja roda app.run_alert_engine() diariamente -
-- sem Edge Function nova, sem cron adicional. pg_net e' assincrono
-- (enfileira o request e busca a resposta depois em net._http_response):
-- para o escopo generico desta entrega, marcar como despachado no momento do
-- enfileiramento e' suficiente - nao ha loop de confirmacao/retry aqui.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuracao global (padrao de linha unica, mesmo formato de
-- public.system_settings e public.app_environment)
-- -----------------------------------------------------------------------------
create table public.webhook_config (
  id boolean primary key default true,
  url text,
  secret text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint webhook_config_singleton_ck check (id),
  constraint webhook_config_url_ck check (not enabled or (url is not null and url <> ''))
);
select app.attach_stamps('public.webhook_config');

alter table public.webhook_config enable row level security;

-- Contem um segredo de assinatura - diferente de system_settings (sem dado
-- sensivel), leitura tambem fica restrita a Admin.
create policy webhook_config_rw on public.webhook_config for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

insert into public.webhook_config (id) values (true) on conflict (id) do nothing;

select app.attach_audit('public.webhook_config');

-- -----------------------------------------------------------------------------
-- Rastreio de despacho por notificacao (sem coluna de erro: pg_net e'
-- fire-and-forget aqui, nao ha resposta HTTP a conferir de volta)
-- -----------------------------------------------------------------------------
alter table public.notifications add column webhook_delivered_at timestamptz;

create index notifications_webhook_pending_idx on public.notifications(created_at)
  where webhook_delivered_at is null;

-- -----------------------------------------------------------------------------
-- pg_net so' existe no Supabase hospedado (igual ao guard de pg_cron da
-- 20260918190000) - o Postgres puro usado pelo CI/testes locais nao tem a
-- extensao. As funcoes abaixo sao criadas de qualquer forma (plpgsql nao
-- valida os identificadores do corpo contra o catalogo na criacao, so' na
-- execucao) e conferem a extensao em tempo de execucao antes de chamar
-- net.http_post - em CI elas sempre retornam sem fazer nada.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  else
    raise notice 'pg_net indisponivel neste ambiente - despacho de webhook fica inerte ate a extensao existir (esperado fora do Supabase hospedado).';
  end if;
end $$;

-- Helper comum ao despacho em lote e ao teste manual - assina o payload com
-- HMAC-SHA256 quando ha segredo configurado (pgcrypto.hmac, ja habilitado
-- desde a 0001) e enfileira o POST via pg_net.
create or replace function app.webhook_post(p_url text, p_secret text, p_payload jsonb)
returns void language plpgsql security definer set search_path = app, net as $$
declare
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  if p_secret is not null and p_secret <> '' then
    v_headers := v_headers || jsonb_build_object(
      'X-ProjectHub-Signature',
      'sha256=' || encode(hmac(p_payload::text::bytea, p_secret::bytea, 'sha256'), 'hex')
    );
  end if;
  perform net.http_post(url := p_url, body := p_payload, headers := v_headers);
end $$;
revoke all on function app.webhook_post(text, text, jsonb) from public, anon, authenticated;

-- Varre notificacoes ainda nao despachadas (ultimo dia, lote de 50 por
-- chamada - suficiente para o volume diario do motor de alertas) e enfileira
-- um POST por notificacao.
create or replace function app.dispatch_webhook_notifications()
returns int language plpgsql security definer set search_path = public, app, net as $$
declare
  v_cfg record;
  v_row record;
  v_payload jsonb;
  v_count int := 0;
begin
  select * into v_cfg from public.webhook_config where id = true;
  if v_cfg is null or not v_cfg.enabled or v_cfg.url is null or v_cfg.url = '' then
    return 0;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 0;
  end if;

  for v_row in
    select n.*
      from public.notifications n
     where n.webhook_delivered_at is null
       and n.created_at > now() - interval '1 day'
     order by n.created_at
     limit 50
  loop
    v_payload := jsonb_build_object(
      'id', v_row.id,
      'title', v_row.title,
      'body', v_row.body,
      'severity', v_row.severity,
      'rule_key', v_row.rule_key,
      'project_id', v_row.project_id,
      'profile_id', v_row.profile_id,
      'link', v_row.link,
      'created_at', v_row.created_at
    );

    perform app.webhook_post(v_cfg.url, v_cfg.secret, v_payload);

    update public.notifications set webhook_delivered_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
revoke all on function app.dispatch_webhook_notifications() from public, anon, authenticated;

-- Disparo manual de um payload de teste, para o Admin validar a URL/segredo
-- em Configuracoes -> Sistema sem esperar o proximo ciclo do motor de
-- alertas (nem precisar de uma notificacao real pendente).
create or replace function public.test_webhook_delivery()
returns void language plpgsql security definer set search_path = public, app, net as $$
declare
  v_cfg record;
  v_payload jsonb;
begin
  if not app.is_admin() then
    raise exception 'Somente administradores testam a integracao de webhook'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_cfg from public.webhook_config where id = true;
  if v_cfg is null or v_cfg.url is null or v_cfg.url = '' then
    raise exception 'Configure e salve a URL do webhook antes de testar.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Recurso de envio HTTP (pg_net) indisponivel neste ambiente.'
      using errcode = 'feature_not_supported';
  end if;

  v_payload := jsonb_build_object(
    'id', gen_random_uuid(),
    'title', 'Teste de integracao - ProjectHub',
    'body', 'Notificacao de teste disparada manualmente em Configuracoes -> Sistema.',
    'severity', 'media',
    'rule_key', 'webhook_test',
    'project_id', null,
    'profile_id', auth.uid(),
    'link', null,
    'created_at', now()
  );

  perform app.webhook_post(v_cfg.url, v_cfg.secret, v_payload);
end $$;
revoke all on function public.test_webhook_delivery() from public, anon;
grant execute on function public.test_webhook_delivery() to authenticated;

-- -----------------------------------------------------------------------------
-- Encaixa o despacho no mesmo ciclo do motor de alertas: `create or replace`
-- repete o corpo de app.run_alert_engine() (20260918190000) com uma chamada
-- nova ao final - mesmo padrao ja usado naquela migration para
-- public.generate_alerts().
-- -----------------------------------------------------------------------------
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

  perform app.dispatch_webhook_notifications();

  return v_count;
end $$;
revoke all on function app.run_alert_engine() from public, anon, authenticated;
