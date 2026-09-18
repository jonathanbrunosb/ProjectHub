-- =============================================================================
-- Corrige a deduplicacao do motor de alertas: por entidade, nao por projeto
--
-- app.run_alert_engine() (20260918190000) deduplicava "task_overdue" por
-- (assignee_id, project_id) via `link like '%' || project_id || '%'` - o link
-- e' generico ('/projetos/<id>/tarefas', sem o id da tarefa), entao um
-- responsavel com 3 tarefas vencidas no mesmo projeto so recebia alerta da
-- primeira encontrada; as outras duas ficavam mudas ate a janela de 24h
-- expirar. Mesmo padrao em "risk_critical_no_plan" e "action_overdue"
-- (dedup por projeto, nao pelo risco/plano especifico).
--
-- Corrigido com uma coluna `entity_id` explicita (mesmo padrao polimorfico
-- de public.comments/public.attachments, 0009) apontando para a tarefa,
-- risco ou plano de acao de origem - a deduplicacao passa a ser por
-- entidade, entao cada atraso individual gera seu proprio alerta.
-- =============================================================================

alter table public.notifications add column entity_id uuid;

create index notifications_entity_idx on public.notifications(rule_key, entity_id, created_at)
  where entity_id is not null;

create or replace function app.run_alert_engine()
returns int language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  -- Tarefas vencidas (uma notificacao por tarefa, nao mais por projeto)
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

  return v_count;
end $$;
revoke all on function app.run_alert_engine() from public, anon, authenticated;

-- Repassa o entity_id no payload do webhook - correlaciona o alerta com a
-- tarefa/risco/plano de origem do lado de quem recebe.
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
      'entity_id', v_row.entity_id,
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
