-- =============================================================================
-- Entrega externa de notificacoes: e-mail (Resend)
--
-- O enum app.notification_channel ja contemplava 'email' desde a 0001. O
-- webhook generico (20260919130000) resolveu integracao tecnica; e-mail e' o
-- canal que o usuario final espera por padrao (prazo vencido, risco critico,
-- plano de acao vencido) sem precisar abrir o sistema nem configurar Zapier.
--
-- Mesma arquitetura do webhook: config global de linha unica, disparo via
-- pg_net (net.http_post) direto do Postgres, encaixado no mesmo ciclo diario
-- de app.run_alert_engine() - sem Edge Function nova, sem cron adicional.
-- Resend foi escolhido por ter API HTTP simples (POST unico, sem SDK), igual
-- em espirito ao webhook cru ja existente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuracao global (mesmo formato de public.webhook_config)
-- -----------------------------------------------------------------------------
create table public.email_notification_config (
  id boolean primary key default true,
  api_key text,
  from_email text,
  app_base_url text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint email_notification_config_singleton_ck check (id),
  constraint email_notification_config_ck check (
    not enabled or (api_key is not null and api_key <> '' and from_email is not null and from_email <> '')
  )
);
select app.attach_stamps('public.email_notification_config');

alter table public.email_notification_config enable row level security;

-- Contem um segredo de API (Resend) - mesma restricao de webhook_config,
-- leitura tambem fica limitada a Admin.
create policy email_notification_config_rw on public.email_notification_config for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

insert into public.email_notification_config (id) values (true) on conflict (id) do nothing;

select app.attach_audit('public.email_notification_config');

-- -----------------------------------------------------------------------------
-- Rastreio de despacho por notificacao (mesmo padrao de webhook_delivered_at)
-- -----------------------------------------------------------------------------
alter table public.notifications add column email_delivered_at timestamptz;

create index notifications_email_pending_idx on public.notifications(created_at)
  where email_delivered_at is null;

-- -----------------------------------------------------------------------------
-- pg_net so' existe no Supabase hospedado - mesmo guard do webhook.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  else
    raise notice 'pg_net indisponivel neste ambiente - despacho de e-mail fica inerte ate a extensao existir (esperado fora do Supabase hospedado).';
  end if;
end $$;

-- Helper comum ao despacho em lote e ao teste manual - um POST para a API do
-- Resend (https://resend.com/docs/api-reference/emails/send-email).
create or replace function app.send_email(p_api_key text, p_from text, p_to text, p_subject text, p_html text)
returns void language plpgsql security definer set search_path = app, net as $$
begin
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', p_from, 'to', p_to, 'subject', p_subject, 'html', p_html),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_api_key
    )
  );
end $$;
revoke all on function app.send_email(text, text, text, text, text) from public, anon, authenticated;

-- Varre notificacoes ainda nao despachadas por e-mail (ultimo dia, lote de 50
-- por chamada, mesmo volume do webhook) e enfileira um envio por notificacao,
-- para o e-mail cadastrado no perfil do destinatario.
create or replace function app.dispatch_email_notifications()
returns int language plpgsql security definer set search_path = public, app, net as $$
declare
  v_cfg record;
  v_row record;
  v_link text;
  v_html text;
  v_count int := 0;
begin
  select * into v_cfg from public.email_notification_config where id = true;
  if v_cfg is null or not v_cfg.enabled or v_cfg.api_key is null or v_cfg.api_key = ''
     or v_cfg.from_email is null or v_cfg.from_email = '' then
    return 0;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 0;
  end if;

  for v_row in
    select n.*, p.email as recipient_email
      from public.notifications n
      join public.profiles p on p.id = n.profile_id
     where n.email_delivered_at is null
       and n.created_at > now() - interval '1 day'
       and p.active
     order by n.created_at
     limit 50
  loop
    v_link := case when v_row.link is null then ''
                   else coalesce(v_cfg.app_base_url, '') || v_row.link end;
    v_html := '<p>' || v_row.body || '</p>'
      || case when v_link <> '' then '<p><a href="' || v_link || '">Abrir no ProjectHub</a></p>' else '' end;

    perform app.send_email(v_cfg.api_key, v_cfg.from_email, v_row.recipient_email, v_row.title, v_html);

    update public.notifications set email_delivered_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
revoke all on function app.dispatch_email_notifications() from public, anon, authenticated;

-- Disparo manual de um e-mail de teste, para o Admin validar a API key/from
-- em Configuracoes -> Sistema sem esperar o proximo ciclo do motor de alertas.
-- Vai para o proprio e-mail de quem testa (auth.uid()).
create or replace function public.test_email_delivery()
returns void language plpgsql security definer set search_path = public, app, net as $$
declare
  v_cfg record;
  v_email text;
begin
  if not app.is_admin() then
    raise exception 'Somente administradores testam a integracao de e-mail'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_cfg from public.email_notification_config where id = true;
  if v_cfg is null or v_cfg.api_key is null or v_cfg.api_key = ''
     or v_cfg.from_email is null or v_cfg.from_email = '' then
    raise exception 'Configure e salve a API key e o remetente antes de testar.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Recurso de envio HTTP (pg_net) indisponivel neste ambiente.'
      using errcode = 'feature_not_supported';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  perform app.send_email(
    v_cfg.api_key, v_cfg.from_email, v_email,
    'Teste de integracao - ProjectHub',
    '<p>Notificacao de teste disparada manualmente em Configuracoes -> Sistema.</p>'
  );
end $$;
revoke all on function public.test_email_delivery() from public, anon;
grant execute on function public.test_email_delivery() to authenticated;

-- -----------------------------------------------------------------------------
-- Encaixa o despacho de e-mail no mesmo ciclo do motor de alertas - repete o
-- corpo de app.run_alert_engine() (20260919140000) com uma chamada nova ao
-- final, mesmo padrao incremental ja usado nas migrations anteriores.
-- -----------------------------------------------------------------------------
create or replace function app.run_alert_engine()
returns int language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  -- Tarefas vencidas (uma notificacao por tarefa)
  insert into public.notifications (profile_id, project_id, entity_id, rule_key, severity, title, body, link)
  select t.assignee_id, t.project_id, t.id, 'task_overdue', 'alta',
         'Tarefa vencida: ' || t.title,
         'Prazo em ' || to_char(t.due_date, 'DD/MM/YYYY') || ' ainda nao concluida.',
         '/projetos/' || t.project_id || '/tarefas'
    from public.tasks t
   where t.assignee_id is not null
     and t.due_date < current_date
     and t.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'task_overdue' and n.entity_id = t.id
          and n.created_at > now() - interval '1 day'
     );
  get diagnostics v_count = row_count;

  -- Riscos criticos sem plano de mitigacao (uma notificacao por risco)
  insert into public.notifications (profile_id, project_id, entity_id, rule_key, severity, title, body, link)
  select coalesce(r.owner_id, p.owner_id), r.project_id, r.id, 'risk_critical_no_plan', 'critica',
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
        where n.rule_key = 'risk_critical_no_plan' and n.entity_id = r.id
          and n.created_at > now() - interval '3 days'
     );

  -- Planos de acao vencidos (uma notificacao por plano)
  insert into public.notifications (profile_id, project_id, entity_id, rule_key, severity, title, body, link)
  select a.owner_id, a.project_id, a.id, 'action_overdue', 'alta',
         'Plano de acao vencido: ' || a.title,
         'Prazo ' || to_char(a.due_date, 'DD/MM/YYYY') || ' expirado.',
         '/projetos/' || a.project_id || '/acoes'
    from public.action_plans a
   where a.owner_id is not null and a.due_date < current_date
     and a.status not in ('concluida','cancelada')
     and not exists (
       select 1 from public.notifications n
        where n.rule_key = 'action_overdue' and n.entity_id = a.id
          and n.created_at > now() - interval '1 day'
     );

  perform app.dispatch_webhook_notifications();
  perform app.dispatch_email_notifications();

  return v_count;
end $$;
revoke all on function app.run_alert_engine() from public, anon, authenticated;
