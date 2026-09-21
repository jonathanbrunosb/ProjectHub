-- =============================================================================
-- Otimizacao de performance apontada pelo advisor do Supabase (get_advisors),
-- rodado pela primeira vez desde o hardening de search_path. Tres achados
-- reais e acionaveis, sem mudanca de comportamento - so' performance:
--
-- 1. 29 politicas RLS chamam auth.uid() direto no predicado, reavaliado
--    LINHA A LINHA pelo planner (auth_rls_initplan). Envolver em
--    `(select auth.uid())` deixa o Postgres cachear o valor uma vez por
--    query em vez de por linha - imperceptivel no volume atual (dezenas de
--    linhas por tabela), vira gargalo real conforme o portfolio cresce.
--    Politicas que so' chamam funcoes app.* (app.is_admin(), etc.) nao
--    precisam de ajuste - o advisor so' sinaliza chamada direta a auth.* no
--    texto do predicado, e essas funcoes ja encapsulam a leitura de
--    auth.uid() internamente de um jeito que o planner nao replica por linha
--    aqui.
-- 2. 27 foreign keys sem indice de cobertura (unindexed_foreign_keys) - joins
--    e o `on delete` de cada FK fazem sequential scan sem isso.
-- 3. 6 tabelas com duas politicas PERMISSIVE pro mesmo papel/acao
--    (multiple_permissive_policies): cada uma roda perto do dobro do
--    necessario, porque Postgres executa TODAS as politicas permissivas
--    aplicaveis e faz OR entre elas. Em 5 casos (app_environment,
--    health_rules, system_settings, goal_score_periods,
--    goal_score_snapshot_items) o padrao e' uma policy "_read" (SELECT) mais
--    uma "_write" (FOR ALL, que ja inclui SELECT) - divide a "_write" em
--    INSERT/UPDATE/DELETE, sem sobrepor o SELECT que a "_read" ja cobre. No
--    sexto caso (decisions, UPDATE duplicado) funde as duas condicoes num
--    OR de uma politica so'.
--
-- Nao mexe nos ~35 indices "nunca usados" que o advisor tambem lista: boa
-- parte foi criada nesta mesma sessao (notifications_webhook_pending_idx,
-- notifications_email_pending_idx, notifications_entity_idx) e so' ainda nao
-- tem uso por causa do volume baixo de dados, nao porque sejam inuteis.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS: (select auth.uid()) no lugar de auth.uid() direto
-- -----------------------------------------------------------------------------

alter policy companies_read on public.companies
  using ((select auth.uid()) is not null);
alter policy business_units_read on public.business_units
  using ((select auth.uid()) is not null);
alter policy portfolios_read on public.portfolios
  using ((select auth.uid()) is not null);
alter policy cost_centers_read on public.cost_centers
  using ((select auth.uid()) is not null);
alter policy project_templates_read on public.project_templates
  using ((select auth.uid()) is not null);
alter policy template_phases_read on public.template_phases
  using ((select auth.uid()) is not null);
alter policy template_tasks_read on public.template_tasks
  using ((select auth.uid()) is not null);
alter policy critical_calendar_events_read on public.critical_calendar_events
  using ((select auth.uid()) is not null);
alter policy automation_rules_read on public.automation_rules
  using ((select auth.uid()) is not null);
alter policy profiles_read on public.profiles
  using ((select auth.uid()) is not null);
alter policy health_rules_read on public.health_rules
  using ((select auth.uid()) is not null);
alter policy app_environment_read on public.app_environment
  using ((select auth.uid()) is not null);
alter policy system_settings_read on public.system_settings
  using ((select auth.uid()) is not null);
alter policy holidays_read on public.holidays
  using ((select auth.uid()) is not null);
alter policy areas_read on public.areas
  using ((select auth.uid()) is not null);
alter policy cfo_read on public.custom_field_options
  using ((select auth.uid()) is not null);

alter policy profiles_update on public.profiles
  using (id = (select auth.uid()) or app.is_admin())
  with check (id = (select auth.uid()) or app.is_admin());

alter policy approvals_update on public.approvals
  using (approver_id = (select auth.uid()) or app.is_portfolio_manager())
  with check (approver_id = (select auth.uid()) or app.is_portfolio_manager());

alter policy column_preferences_own on public.column_preferences
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

alter policy notifications_read on public.notifications
  using (profile_id = (select auth.uid()));
alter policy notifications_update on public.notifications
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
alter policy notifications_delete on public.notifications
  using (profile_id = (select auth.uid()));

alter policy user_area_assignments_read on public.user_area_assignments
  using (app.is_portfolio_reader() or user_id = (select auth.uid()));

alter policy comments_update on public.comments
  using (created_by = (select auth.uid()) or app.is_portfolio_manager())
  with check (created_by = (select auth.uid()) or app.is_portfolio_manager());
alter policy comments_delete on public.comments
  using (created_by = (select auth.uid()) or app.is_portfolio_manager());

alter policy saved_views_read on public.saved_views
  using (
    (scope = 'privada' and owner_id = (select auth.uid()))
    or scope = 'compartilhada'
    or (scope = 'padrao_projeto' and app.can_read_project(project_id))
    or scope = 'padrao_template'
  );
alter policy saved_views_insert on public.saved_views
  with check (
    case
      when scope = 'privada' then owner_id = (select auth.uid())
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  );
alter policy saved_views_update on public.saved_views
  using (
    case
      when scope = 'privada' then owner_id = (select auth.uid())
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  )
  with check (true);
alter policy saved_views_delete on public.saved_views
  using (
    case
      when scope = 'privada' then owner_id = (select auth.uid())
      when scope = 'padrao_projeto' then app.can_manage_project(project_id)
      else app.is_portfolio_manager()
    end
  );

-- -----------------------------------------------------------------------------
-- 2. Indices de cobertura para as 27 foreign keys sem indice
-- -----------------------------------------------------------------------------

create index if not exists approvals_project_idx on public.approvals(project_id);
create index if not exists comments_created_by_idx on public.comments(created_by);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists decisions_decider_idx on public.decisions(decider_id);
create index if not exists financial_entries_cost_center_idx on public.financial_entries(cost_center_id);
create index if not exists goal_score_periods_closed_by_idx on public.goal_score_periods(closed_by);
create index if not exists goal_score_periods_reopened_by_idx on public.goal_score_periods(reopened_by);
create index if not exists goal_score_snapshot_items_period_idx on public.goal_score_snapshot_items(period_id);
create index if not exists goal_score_snapshot_items_task_idx on public.goal_score_snapshot_items(task_id);
create index if not exists indicators_owner_idx on public.indicators(owner_id);
create index if not exists milestones_owner_idx on public.milestones(owner_id);
create index if not exists milestones_task_idx on public.milestones(task_id);
create index if not exists notifications_project_idx on public.notifications(project_id);
create index if not exists portfolios_owner_idx on public.portfolios(owner_id);
create index if not exists profiles_business_unit_idx on public.profiles(business_unit_id);
create index if not exists profiles_company_idx on public.profiles(company_id);
create index if not exists project_budgets_approved_by_idx on public.project_budgets(approved_by);
create index if not exists projects_health_overridden_by_idx on public.projects(health_overridden_by);
create index if not exists projects_template_idx on public.projects(template_id);
create index if not exists saved_views_project_idx on public.saved_views(project_id);
create index if not exists saved_views_template_idx on public.saved_views(template_id);
create index if not exists status_reports_published_by_idx on public.status_reports(published_by);
create index if not exists status_reports_supersedes_idx on public.status_reports(supersedes_id);
create index if not exists task_corresponsibles_profile_idx on public.task_corresponsibles(profile_id);
create index if not exists task_goal_config_override_by_idx on public.task_goal_config(override_by);
create index if not exists tasks_phase_idx on public.tasks(phase_id);
create index if not exists template_tasks_phase_idx on public.template_tasks(template_phase_id);

-- -----------------------------------------------------------------------------
-- 3. Politicas PERMISSIVE duplicadas para o mesmo papel/acao
-- -----------------------------------------------------------------------------

-- app_environment: divide a "_write" (FOR ALL) em INSERT/UPDATE/DELETE, o
-- SELECT ja esta coberto por app_environment_read.
drop policy app_environment_write on public.app_environment;
create policy app_environment_insert on public.app_environment for insert to authenticated
  with check (app.is_admin());
create policy app_environment_update on public.app_environment for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy app_environment_delete on public.app_environment for delete to authenticated
  using (app.is_admin());

drop policy health_rules_write on public.health_rules;
create policy health_rules_insert on public.health_rules for insert to authenticated
  with check (app.is_admin());
create policy health_rules_update on public.health_rules for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy health_rules_delete on public.health_rules for delete to authenticated
  using (app.is_admin());

drop policy system_settings_write on public.system_settings;
create policy system_settings_insert on public.system_settings for insert to authenticated
  with check (app.can_manage_financial_module());
create policy system_settings_update on public.system_settings for update to authenticated
  using (app.can_manage_financial_module()) with check (app.can_manage_financial_module());
create policy system_settings_delete on public.system_settings for delete to authenticated
  using (app.can_manage_financial_module());

drop policy gsp_write on public.goal_score_periods;
create policy gsp_insert on public.goal_score_periods for insert to authenticated
  with check (app.can_manage_goal_indicator());
create policy gsp_update on public.goal_score_periods for update to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());
create policy gsp_delete on public.goal_score_periods for delete to authenticated
  using (app.can_manage_goal_indicator());

drop policy gssi_write on public.goal_score_snapshot_items;
create policy gssi_insert on public.goal_score_snapshot_items for insert to authenticated
  with check (app.can_manage_goal_indicator());
create policy gssi_update on public.goal_score_snapshot_items for update to authenticated
  using (app.can_manage_goal_indicator()) with check (app.can_manage_goal_indicator());
create policy gssi_delete on public.goal_score_snapshot_items for delete to authenticated
  using (app.can_manage_goal_indicator());

-- decisions: funde as duas politicas de UPDATE (sponsor + gestor de escrita)
-- num OR so', em vez de duas politicas permissivas separadas.
drop policy decisions_sponsor_update on public.decisions;
alter policy decisions_update on public.decisions
  using (app.can_write_project(project_id) or app.is_project_sponsor(project_id))
  with check (app.can_write_project(project_id) or app.is_project_sponsor(project_id));
