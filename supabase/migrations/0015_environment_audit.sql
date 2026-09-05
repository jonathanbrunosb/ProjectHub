-- =============================================================================
-- 0015 - Auditoria de troca de ambiente
--
-- Separada da 0014 porque um valor recem-adicionado a um enum nao pode ser
-- usado na mesma transacao em que foi criado.
-- =============================================================================

-- Estende as acoes que o cliente pode registrar: alem de login/logout/export/
-- config, agora tambem as trocas de ambiente e as tentativas negadas.
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
  if p_action not in (
    'login', 'logout', 'export', 'config_change',
    'environment_switch', 'environment_switch_denied'
  ) then
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

-- -----------------------------------------------------------------------------
-- Guarda: a permissao de alternar ambiente e' privilegio, nao preferencia.
-- Apenas Admin concede ou revoga - um usuario nunca a atribui a si mesmo.
-- -----------------------------------------------------------------------------
create or replace function app.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  -- auth.uid() nulo = contexto de backend (service_role / migracao / seed),
  -- que ja e' controlado por grants. O guard vale para sessoes de usuario.
  if auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role and not app.is_admin() then
    raise exception 'Somente administradores alteram o papel de acesso.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.active is distinct from old.active and not app.is_admin() then
    raise exception 'Somente administradores ativam/desativam usuarios.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.can_switch_environment is distinct from old.can_switch_environment
     and not app.is_admin() then
    raise exception 'Somente administradores concedem acesso a troca de ambiente.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Gatilho de auditoria tolerante a chaves que nao sao UUID
--
-- A versao original assumia que toda PK era uuid e quebrava em tabelas de
-- configuracao com chave de outro tipo (app_environment usa PK booleana, o
-- padrao de linha unica). Agora o cast so acontece quando o valor realmente
-- tem formato de uuid; caso contrario a coluna fica nula e a auditoria segue.
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
  v_raw_id text;
  v_raw_project text;
  v_profile record;
  v_ignored text[] := array['updated_at', 'updated_by'];
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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
    elsif v_changed && array['owner_id','sponsor_id','assignee_id','role','can_switch_environment'] then v_action := 'ownership_change';
    end if;
  end if;

  v_raw_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_entity_id := case when v_raw_id ~ c_uuid then v_raw_id::uuid end;

  if tg_table_name = 'projects' then
    v_project := v_entity_id;
  else
    v_raw_project := coalesce(v_new ->> 'project_id', v_old ->> 'project_id');
    v_project := case when v_raw_project ~ c_uuid then v_raw_project::uuid end;
  end if;

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
