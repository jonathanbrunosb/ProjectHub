-- =============================================================================
-- 0010 - Trilha de auditoria da aplicacao
-- =============================================================================

create table public.application_audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default (now() at time zone 'utc'),
  user_id uuid,
  user_name text,
  user_email text,
  action app.audit_action not null,
  entity text not null,
  entity_id uuid,
  project_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  ip_address inet,
  user_agent text,
  correlation_id uuid,
  origin text not null default 'db'
);
create index audit_occurred_idx on public.application_audit_log(occurred_at desc);
create index audit_user_idx on public.application_audit_log(user_id, occurred_at desc);
create index audit_entity_idx on public.application_audit_log(entity, entity_id);
create index audit_project_idx on public.application_audit_log(project_id, occurred_at desc);
create index audit_action_idx on public.application_audit_log(action);

-- A trilha e' somente-insercao: ninguem altera ou apaga registros.
create or replace function app.audit_log_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'A trilha de auditoria e imutavel (append-only).' using errcode = 'insufficient_privilege';
end $$;

create trigger trg_audit_no_update before update or delete on public.application_audit_log
  for each row execute function app.audit_log_is_append_only();

-- -----------------------------------------------------------------------------
-- Gatilho generico de auditoria
-- -----------------------------------------------------------------------------
create or replace function app.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_action app.audit_action;
  v_project uuid;
  v_entity_id uuid;
  v_profile record;
  v_ignored text[] := array['updated_at', 'updated_by'];
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  if tg_op = 'INSERT' then v_action := 'insert';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  else
    select array_agg(key) into v_changed
      from jsonb_each(v_new) n
     where not (n.key = any(v_ignored))
       and v_old -> n.key is distinct from n.value;
    if v_changed is null or array_length(v_changed, 1) is null then
      return null; -- nada material mudou
    end if;
    v_action := 'update';
    -- classificacao semantica para leitura executiva da trilha
    if 'status' = any(v_changed) then v_action := 'status_change';
    elsif 'health' = any(v_changed) then v_action := 'health_change';
    elsif v_changed && array['amount','budget','forecast','currency'] then v_action := 'financial_change';
    elsif v_changed && array['start_date','target_date','due_date','deadline'] then v_action := 'schedule_change';
    elsif v_changed && array['owner_id','sponsor_id','assignee_id','role'] then v_action := 'ownership_change';
    end if;
  end if;

  v_entity_id := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
  v_project := case
    when tg_table_name = 'projects' then v_entity_id
    else nullif(coalesce(v_new ->> 'project_id', v_old ->> 'project_id'), '')::uuid
  end;

  select full_name, email into v_profile from public.profiles where id = auth.uid();

  insert into public.application_audit_log (
    user_id, user_name, user_email, action, entity, entity_id, project_id,
    old_data, new_data, changed_fields, origin
  ) values (
    auth.uid(), v_profile.full_name, v_profile.email, v_action, tg_table_name, v_entity_id, v_project,
    v_old, v_new, v_changed, 'db'
  );
  return null;
end $$;

create or replace function app.attach_audit(p_table regclass)
returns void language plpgsql as $$
declare t text := p_table::text;
begin
  execute format('drop trigger if exists trg_audit on %s', t);
  execute format(
    'create trigger trg_audit after insert or update or delete on %s for each row execute function app.audit_row_change()', t
  );
end $$;

select app.attach_audit('public.projects');
select app.attach_audit('public.project_members');
select app.attach_audit('public.tasks');
select app.attach_audit('public.milestones');
select app.attach_audit('public.risks');
select app.attach_audit('public.action_plans');
select app.attach_audit('public.decisions');
select app.attach_audit('public.approvals');
select app.attach_audit('public.project_budgets');
select app.attach_audit('public.financial_entries');
select app.attach_audit('public.indicators');
select app.attach_audit('public.status_reports');
select app.attach_audit('public.custom_field_definitions');
select app.attach_audit('public.custom_field_values');
select app.attach_audit('public.resource_allocations');
select app.attach_audit('public.attachments');
select app.attach_audit('public.profiles');
select app.attach_audit('public.teams');
select app.attach_audit('public.critical_calendar_events');
select app.attach_audit('public.automation_rules');

-- Eventos com contexto HTTP (login, logout, exportacao) sao registrados pela
-- aplicacao/Edge Function atraves desta funcao.
create or replace function public.log_app_event(
  p_action app.audit_action,
  p_entity text,
  p_entity_id uuid default null,
  p_project_id uuid default null,
  p_new_data jsonb default null,
  p_user_agent text default null,
  p_correlation_id uuid default null,
  p_origin text default 'web'
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_profile record;
begin
  if auth.uid() is null then
    raise exception 'Sessao nao autenticada';
  end if;
  if p_action not in ('login','logout','export','config_change') then
    raise exception 'Acao % nao pode ser registrada pelo cliente', p_action;
  end if;
  select full_name, email into v_profile from public.profiles where id = auth.uid();
  insert into public.application_audit_log (
    user_id, user_name, user_email, action, entity, entity_id, project_id,
    new_data, user_agent, correlation_id, origin
  ) values (
    auth.uid(), v_profile.full_name, v_profile.email, p_action, p_entity, p_entity_id, p_project_id,
    p_new_data, p_user_agent, p_correlation_id, p_origin
  );
end $$;

revoke all on function public.log_app_event(app.audit_action, text, uuid, uuid, jsonb, text, uuid, text) from public;
grant execute on function public.log_app_event(app.audit_action, text, uuid, uuid, jsonb, text, uuid, text) to authenticated;
