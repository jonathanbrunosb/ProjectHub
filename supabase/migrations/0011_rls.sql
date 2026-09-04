-- =============================================================================
-- 0011 - RBAC + Row Level Security
-- Principio: o frontend nunca decide acesso. Toda tabela exposta tem RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funcoes auxiliares (SECURITY DEFINER para evitar recursao de politica)
-- -----------------------------------------------------------------------------
create or replace function app.my_role()
returns app.role_key language sql stable security definer set search_path = public, app as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() = 'admin', false);
$$;

-- admin + PMO/Gerencia: gestao corporativa do portfolio
create or replace function app.is_portfolio_manager()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() in ('admin', 'pmo'), false);
$$;

-- leitura corporativa: admin, PMO e Auditor enxergam todo o portfolio
create or replace function app.is_portfolio_reader()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() in ('admin', 'pmo', 'auditor'), false);
$$;

create or replace function app.can_read_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.is_portfolio_reader() then true
    else exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and (p.owner_id = auth.uid() or p.sponsor_id = auth.uid())
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id and m.profile_id = auth.uid()
    )
  end;
$$;

-- escrita operacional dentro do projeto
create or replace function app.can_write_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.my_role() in ('viewer', 'auditor') then false
    when app.is_portfolio_manager() then true
    else exists (
      select 1 from public.projects p
       where p.id = p_project_id and p.owner_id = auth.uid()
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id
         and m.profile_id = auth.uid()
         and m.can_edit
         and m.project_role in ('project_owner', 'collaborator')
    )
  end;
$$;

-- gestao do projeto: membros, orcamento, exclusao, override de saude
create or replace function app.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.is_portfolio_manager() then true
    else exists (
      select 1 from public.projects p
       where p.id = p_project_id and p.owner_id = auth.uid()
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project_id
         and m.profile_id = auth.uid()
         and m.project_role = 'project_owner'
    )
  end;
$$;

-- sponsor do projeto (decisoes e aprovacoes)
create or replace function app.is_project_sponsor(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id and p.sponsor_id = auth.uid()
  );
$$;

grant execute on function
  app.my_role(), app.is_admin(), app.is_portfolio_manager(), app.is_portfolio_reader(),
  app.can_read_project(uuid), app.can_write_project(uuid), app.can_manage_project(uuid),
  app.is_project_sponsor(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Grants base: anon nao acessa nada; authenticated passa pela RLS
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- -----------------------------------------------------------------------------
-- Ativa RLS em tudo
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    -- NAO usar FORCE: as funcoes SECURITY DEFINER (app.can_read_project etc.) e os
    -- gatilhos de rollup pertencem ao owner e precisam enxergar as linhas para
    -- avaliar a propria politica. FORCE criaria recursao/negacao indevida.
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- =============================================================================
-- Cadastros corporativos: leitura para autenticados, escrita para admin/PMO
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['companies','business_units','teams','portfolios','cost_centers',
                           'project_templates','template_phases','template_tasks',
                           'critical_calendar_events','automation_rules']
  loop
    execute format($f$
      create policy %1$I_read on public.%1$I for select to authenticated using (auth.uid() is not null);
      create policy %1$I_write on public.%1$I for insert to authenticated with check (app.is_portfolio_manager());
      create policy %1$I_update on public.%1$I for update to authenticated
        using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());
      create policy %1$I_delete on public.%1$I for delete to authenticated using (app.is_admin());
    $f$, t);
  end loop;
end $$;

-- =============================================================================
-- profiles
-- =============================================================================
create policy profiles_read on public.profiles for select to authenticated
  using (auth.uid() is not null);

create policy profiles_insert on public.profiles for insert to authenticated
  with check (app.is_admin());

-- usuario edita o proprio cadastro; admin edita qualquer um.
-- A troca de papel (role) e' bloqueada por gatilho, nao apenas pelo frontend.
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());

create policy profiles_delete on public.profiles for delete to authenticated
  using (app.is_admin());

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
  return new;
end $$;

create trigger trg_profiles_guard_role before update on public.profiles
  for each row execute function app.guard_profile_role();

create policy team_memberships_read on public.team_memberships for select to authenticated
  using (auth.uid() is not null);
create policy team_memberships_write on public.team_memberships for insert to authenticated
  with check (app.is_portfolio_manager());
create policy team_memberships_update on public.team_memberships for update to authenticated
  using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());
create policy team_memberships_delete on public.team_memberships for delete to authenticated
  using (app.is_portfolio_manager());

-- =============================================================================
-- projects
-- =============================================================================
create policy projects_read on public.projects for select to authenticated
  using (app.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (app.is_portfolio_manager() or app.my_role() = 'project_owner');
create policy projects_update on public.projects for update to authenticated
  using (app.can_write_project(id)) with check (app.can_write_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (app.is_portfolio_manager());

create policy project_members_read on public.project_members for select to authenticated
  using (app.can_read_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (app.can_manage_project(project_id));
create policy project_members_update on public.project_members for update to authenticated
  using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (app.can_manage_project(project_id));

-- =============================================================================
-- Tabelas filhas com project_id: leitura/escrita derivadas do projeto
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'project_business_units','project_phases','tasks','milestones','risks','action_plans',
    'indicators','evm_snapshots','decisions','financial_entries','resource_allocations',
    'comments','attachments','custom_field_values','notifications_placeholder'
  ]
  loop
    continue when t = 'notifications_placeholder';
    execute format($f$
      create policy %1$I_read on public.%1$I for select to authenticated
        using (app.can_read_project(project_id));
      create policy %1$I_insert on public.%1$I for insert to authenticated
        with check (app.can_write_project(project_id));
      create policy %1$I_update on public.%1$I for update to authenticated
        using (app.can_write_project(project_id)) with check (app.can_write_project(project_id));
      create policy %1$I_delete on public.%1$I for delete to authenticated
        using (app.can_write_project(project_id));
    $f$, t);
  end loop;
end $$;

-- Orcamento: alteracao restrita a gestao do projeto (impacto financeiro)
create policy project_budgets_read on public.project_budgets for select to authenticated
  using (app.can_read_project(project_id));
create policy project_budgets_insert on public.project_budgets for insert to authenticated
  with check (app.can_manage_project(project_id));
create policy project_budgets_update on public.project_budgets for update to authenticated
  using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
create policy project_budgets_delete on public.project_budgets for delete to authenticated
  using (app.is_portfolio_manager());

-- Aprovacoes: sponsor/decisor responde; gestao do projeto cria
create policy approvals_read on public.approvals for select to authenticated
  using (app.can_read_project(project_id));
create policy approvals_insert on public.approvals for insert to authenticated
  with check (app.can_manage_project(project_id) or app.is_project_sponsor(project_id));
create policy approvals_update on public.approvals for update to authenticated
  using (approver_id = auth.uid() or app.is_portfolio_manager())
  with check (approver_id = auth.uid() or app.is_portfolio_manager());
create policy approvals_delete on public.approvals for delete to authenticated
  using (app.is_portfolio_manager());

-- Decisoes: sponsor tambem decide, alem de quem escreve no projeto
create policy decisions_sponsor_update on public.decisions for update to authenticated
  using (app.is_project_sponsor(project_id)) with check (app.is_project_sponsor(project_id));

-- Tabelas filhas ligadas a tarefa (sem project_id proprio)
do $$
declare t text;
begin
  foreach t in array array['task_corresponsibles','task_checklist_items','task_reschedules']
  loop
    execute format($f$
      create policy %1$I_read on public.%1$I for select to authenticated
        using (exists (select 1 from public.tasks t where t.id = %1$I.task_id and app.can_read_project(t.project_id)));
      create policy %1$I_insert on public.%1$I for insert to authenticated
        with check (exists (select 1 from public.tasks t where t.id = task_id and app.can_write_project(t.project_id)));
      create policy %1$I_update on public.%1$I for update to authenticated
        using (exists (select 1 from public.tasks t where t.id = %1$I.task_id and app.can_write_project(t.project_id)))
        with check (exists (select 1 from public.tasks t where t.id = task_id and app.can_write_project(t.project_id)));
      create policy %1$I_delete on public.%1$I for delete to authenticated
        using (exists (select 1 from public.tasks t where t.id = %1$I.task_id and app.can_write_project(t.project_id)));
    $f$, t);
  end loop;
end $$;

create policy task_dependencies_read on public.task_dependencies for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_dependencies.successor_id and app.can_read_project(t.project_id)));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (exists (select 1 from public.tasks t where t.id = successor_id and app.can_write_project(t.project_id)));
create policy task_dependencies_update on public.task_dependencies for update to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_dependencies.successor_id and app.can_write_project(t.project_id)))
  with check (exists (select 1 from public.tasks t where t.id = successor_id and app.can_write_project(t.project_id)));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_dependencies.successor_id and app.can_write_project(t.project_id)));

-- =============================================================================
-- Indicadores de medicao
-- =============================================================================
create policy indicator_measurements_read on public.indicator_measurements for select to authenticated
  using (exists (select 1 from public.indicators i where i.id = indicator_id
                  and (i.project_id is null or app.can_read_project(i.project_id))));
create policy indicator_measurements_write on public.indicator_measurements for insert to authenticated
  with check (exists (select 1 from public.indicators i where i.id = indicator_id
                  and (case when i.project_id is null then app.is_portfolio_manager() else app.can_write_project(i.project_id) end)));
create policy indicator_measurements_update on public.indicator_measurements for update to authenticated
  using (exists (select 1 from public.indicators i where i.id = indicator_id
                  and (case when i.project_id is null then app.is_portfolio_manager() else app.can_write_project(i.project_id) end)))
  with check (true);
create policy indicator_measurements_delete on public.indicator_measurements for delete to authenticated
  using (exists (select 1 from public.indicators i where i.id = indicator_id
                  and (case when i.project_id is null then app.is_portfolio_manager() else app.can_write_project(i.project_id) end)));

-- =============================================================================
-- Status reports: publicacao restrita a gestao do projeto
-- =============================================================================
create policy status_reports_read on public.status_reports for select to authenticated
  using (app.can_read_project(project_id));
create policy status_reports_insert on public.status_reports for insert to authenticated
  with check (app.can_write_project(project_id));
create policy status_reports_update on public.status_reports for update to authenticated
  using (app.can_write_project(project_id)) with check (app.can_write_project(project_id));
create policy status_reports_delete on public.status_reports for delete to authenticated
  using (app.can_manage_project(project_id) and state = 'rascunho');

-- =============================================================================
-- Campos personalizados: definicao e' configuracao; valor segue o projeto
-- =============================================================================
create policy cfd_read on public.custom_field_definitions for select to authenticated
  using (
    scope in ('global', 'template')
    or (scope = 'projeto' and app.can_read_project(project_id))
  );
create policy cfd_insert on public.custom_field_definitions for insert to authenticated
  with check (
    case when scope = 'projeto' then app.can_manage_project(project_id)
         else app.is_portfolio_manager() end
  );
create policy cfd_update on public.custom_field_definitions for update to authenticated
  using (case when scope = 'projeto' then app.can_manage_project(project_id) else app.is_portfolio_manager() end)
  with check (case when scope = 'projeto' then app.can_manage_project(project_id) else app.is_portfolio_manager() end);
create policy cfd_delete on public.custom_field_definitions for delete to authenticated
  using (case when scope = 'projeto' then app.can_manage_project(project_id) else app.is_admin() end);

create policy cfo_read on public.custom_field_options for select to authenticated
  using (auth.uid() is not null);
create policy cfo_write on public.custom_field_options for insert to authenticated
  with check (exists (select 1 from public.custom_field_definitions d where d.id = definition_id
    and (case when d.scope = 'projeto' then app.can_manage_project(d.project_id) else app.is_portfolio_manager() end)));
create policy cfo_update on public.custom_field_options for update to authenticated
  using (exists (select 1 from public.custom_field_definitions d where d.id = custom_field_options.definition_id
    and (case when d.scope = 'projeto' then app.can_manage_project(d.project_id) else app.is_portfolio_manager() end)))
  with check (true);
create policy cfo_delete on public.custom_field_options for delete to authenticated
  using (exists (select 1 from public.custom_field_definitions d where d.id = custom_field_options.definition_id
    and (case when d.scope = 'projeto' then app.can_manage_project(d.project_id) else app.is_portfolio_manager() end)));

-- =============================================================================
-- Preferencias pessoais e visualizacoes salvas
-- =============================================================================
create policy column_preferences_own on public.column_preferences for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy saved_views_read on public.saved_views for select to authenticated
  using (
    (scope = 'privada' and owner_id = auth.uid())
    or scope = 'compartilhada'
    or (scope = 'padrao_projeto' and app.can_read_project(project_id))
    or (scope = 'padrao_template')
  );
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    case
      when scope = 'privada' then owner_id = auth.uid()
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  );
create policy saved_views_update on public.saved_views for update to authenticated
  using (
    case
      when scope = 'privada' then owner_id = auth.uid()
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  ) with check (true);
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (
    case
      when scope = 'privada' then owner_id = auth.uid()
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  );

-- =============================================================================
-- Notificacoes: caixa pessoal
-- =============================================================================
create policy notifications_read on public.notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (app.is_portfolio_manager());
create policy notifications_delete on public.notifications for delete to authenticated
  using (profile_id = auth.uid());

-- =============================================================================
-- Trilha de auditoria: leitura para Admin/PMO/Auditor; ninguem escreve pelo cliente
-- =============================================================================
create policy audit_read on public.application_audit_log for select to authenticated
  using (app.is_portfolio_reader());

revoke insert, update, delete on public.application_audit_log from authenticated;
revoke all on public.application_audit_log from anon;

-- Views herdam a RLS das tabelas base (security_invoker)
alter view public.v_project_financials set (security_invoker = on);
alter view public.v_project_financial_curve set (security_invoker = on);
alter view public.v_resource_capacity set (security_invoker = on);
alter view public.v_calendar_conflicts set (security_invoker = on);
grant select on public.v_project_financials, public.v_project_financial_curve,
                public.v_resource_capacity, public.v_calendar_conflicts to authenticated;
