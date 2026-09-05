-- =============================================================================
-- 0016 - Modulo financeiro opcional (config global + override por projeto)
--
-- O modulo financeiro (orcamento/realizado/comprometido/forecast) continua
-- existindo permanentemente no schema - esta migration apenas adiciona uma
-- camada de visibilidade/uso opcional, sem tocar em dado financeiro algum.
--
-- Dois niveis, com o projeto podendo sobrepor o global nos dois sentidos
-- (ligar uma excecao mesmo com o global desligado, e vice-versa):
--   1. public.system_settings.financial_module_enabled - padrao da plataforma.
--   2. public.projects.financial_module_mode - 'inherit'|'enabled'|'disabled'.
--
-- 'inherit' e' o unico caso em que o valor global e' consultado; 'enabled' e
-- 'disabled' forcam o projeto independente do que o global diga.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuracao global (padrao de linha unica, igual a public.app_environment)
-- -----------------------------------------------------------------------------
create table public.system_settings (
  id boolean primary key default true,
  financial_module_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint system_settings_singleton_ck check (id)
);
select app.attach_stamps('public.system_settings');

alter table public.system_settings enable row level security;

-- Quem gerencia o modulo financeiro: Admin, PMO ou Sponsor (papel de gerencia/
-- diretoria neste app - RoleKey nao tem um valor "gerencia" dedicado).
create or replace function app.can_manage_financial_module()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() in ('admin', 'pmo', 'sponsor'), false);
$$;
grant execute on function app.can_manage_financial_module() to authenticated;

create policy system_settings_read on public.system_settings for select to authenticated
  using (auth.uid() is not null);
create policy system_settings_write on public.system_settings for all to authenticated
  using (app.can_manage_financial_module()) with check (app.can_manage_financial_module());

insert into public.system_settings (id) values (true) on conflict (id) do nothing;

select app.attach_audit('public.system_settings');

-- -----------------------------------------------------------------------------
-- Override por projeto e valor padrao por template
-- -----------------------------------------------------------------------------
alter table public.projects
  add column financial_module_mode text not null default 'inherit'
  constraint projects_financial_module_mode_ck check (financial_module_mode in ('inherit', 'enabled', 'disabled'));

alter table public.project_templates
  add column financial_module_default text not null default 'inherit'
  constraint project_templates_financial_module_default_ck check (financial_module_default in ('inherit', 'enabled', 'disabled'));

-- Alterar o modulo financeiro de um projeto e' privilegio de gestao, nao uma
-- edicao operacional comum - Project Owner continua podendo editar/criar o
-- resto do projeto (RLS de projects_insert/projects_update), mas nao esta
-- coluna especificamente. Cobre INSERT tambem: sem isso, um Project Owner
-- poderia contornar a regra criando o projeto ja com o modo desejado em vez
-- de alterá-lo depois (create_project_from_template ja se autolimita, mas o
-- insert direto de projeto sem template passa por aqui).
create or replace function app.guard_financial_module_mode()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if app.can_manage_financial_module() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.financial_module_mode <> 'inherit' then
      new.financial_module_mode := 'inherit';
    end if;
    return new;
  end if;
  if new.financial_module_mode is distinct from old.financial_module_mode then
    raise exception 'Somente Admin, PMO ou Gerencia alteram o modulo financeiro do projeto.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger trg_projects_guard_financial_module before insert or update on public.projects
  for each row execute function app.guard_financial_module_mode();

-- -----------------------------------------------------------------------------
-- Saude do projeto: neutraliza o desvio financeiro quando o modulo nao se
-- aplica (senao um projeto sem orcamento cadastrado ficaria com desvio 0 por
-- acaso, mas um projeto com o modulo desligado deliberadamente nao deveria
-- nem entrar nessa conta).
-- -----------------------------------------------------------------------------
create or replace function app.calc_project_health(p_project_id uuid)
returns app.health language plpgsql stable security definer set search_path = public, app as $$
declare
  r record; cfg record; v_global_financial boolean; v_financial_enabled boolean;
  v_schedule_dev numeric; v_budget_dev numeric;
  v_overdue_milestone int; v_unmitigated_critical int;
begin
  select * into cfg from public.health_rules where key = 'default';
  select p.*, f.budget, f.forecast into r
    from public.projects p
    left join public.v_project_financials f on f.project_id = p.id
   where p.id = p_project_id;

  if r is null then return 'cinza'; end if;
  if r.status in ('em_espera', 'cancelado') then return 'cinza'; end if;
  if r.status = 'concluido' then return 'verde'; end if;

  select financial_module_enabled into v_global_financial from public.system_settings limit 1;
  v_financial_enabled := case r.financial_module_mode
    when 'enabled' then true
    when 'disabled' then false
    else coalesce(v_global_financial, true)
  end;

  v_schedule_dev := greatest(0, coalesce(r.progress_planned, 0) - coalesce(r.progress_actual, 0));
  v_budget_dev := case when not v_financial_enabled or coalesce(r.budget, 0) = 0 then 0
                       else (coalesce(r.forecast, 0) - r.budget) * 100 / r.budget end;

  select count(*) into v_overdue_milestone
    from public.milestones m
   where m.project_id = p_project_id and m.is_critical
     and m.completed_at is null and m.due_date < current_date;

  select count(*) into v_unmitigated_critical
    from public.risks k
   where k.project_id = p_project_id and k.kind = 'risco'
     and k.score >= 15 and k.status in ('aberto', 'em_tratamento')
     and (k.mitigation_plan is null or k.strategy is null);

  if v_overdue_milestone > 0
     or v_unmitigated_critical > 0
     or v_schedule_dev >= cfg.schedule_deviation_red
     or v_budget_dev >= cfg.budget_deviation_red then
    return 'vermelho';
  end if;

  if v_schedule_dev >= cfg.schedule_deviation_yellow
     or v_budget_dev >= cfg.budget_deviation_yellow
     or exists (select 1 from public.risks k where k.project_id = p_project_id
                 and k.score >= 9 and k.status in ('aberto','em_tratamento'))
     or r.updated_at < now() - make_interval(days => cfg.stale_update_days) then
    return 'amarelo';
  end if;

  return 'verde';
end $$;

-- -----------------------------------------------------------------------------
-- v_project_overview: expoe o modo e o status efetivo ja calculado, para o
-- frontend nao precisar buscar a config global separadamente em toda lista.
-- -----------------------------------------------------------------------------
create or replace view public.v_project_overview as
select
  p.id,
  p.code,
  p.name,
  p.category,
  p.status,
  p.health,
  p.health_is_manual,
  p.priority,
  p.phase,
  p.portfolio_id,
  p.template_id,
  p.owner_id,
  p.sponsor_id,
  p.team_id,
  p.company_id,
  own.full_name as owner_name,
  spo.full_name as sponsor_name,
  tm.name as team_name,
  co.name as company_name,
  p.start_date,
  p.target_date,
  p.actual_end_date,
  p.progress_planned,
  p.progress_actual,
  round(p.progress_actual - p.progress_planned, 2) as progress_deviation,
  case when p.target_date is null or p.status in ('concluido','cancelado') then 0
       else greatest(0, current_date - p.target_date) end as days_overdue,
  fin.budget,
  fin.actual,
  fin.committed,
  fin.forecast,
  fin.remaining,
  fin.forecast_variance,
  fin.forecast_variance_pct,
  agg.critical_risks,
  agg.open_risks,
  agg.overdue_tasks,
  agg.open_tasks,
  agg.overdue_actions,
  agg.pending_decisions,
  nxt.next_milestone_name,
  nxt.next_milestone_date,
  p.updated_at as last_update_at,
  p.archived_at,
  -- Colunas novas sempre ao final: `create or replace view` proibe reordenar
  -- ou inserir colunas no meio de uma view ja existente.
  p.financial_module_mode,
  case p.financial_module_mode
    when 'enabled' then true
    when 'disabled' then false
    else coalesce((select financial_module_enabled from public.system_settings limit 1), true)
  end as financial_effective_enabled
from public.projects p
left join public.profiles own on own.id = p.owner_id
left join public.profiles spo on spo.id = p.sponsor_id
left join public.teams tm on tm.id = p.team_id
left join public.companies co on co.id = p.company_id
left join public.v_project_financials fin on fin.project_id = p.id
left join lateral (
  select
    (select count(*) from public.risks r where r.project_id = p.id and r.score >= 15 and r.status in ('aberto','em_tratamento')) as critical_risks,
    (select count(*) from public.risks r where r.project_id = p.id and r.status in ('aberto','em_tratamento')) as open_risks,
    (select count(*) from public.tasks t where t.project_id = p.id and t.due_date < current_date and t.status not in ('concluida','cancelada')) as overdue_tasks,
    (select count(*) from public.tasks t where t.project_id = p.id and t.status not in ('concluida','cancelada')) as open_tasks,
    (select count(*) from public.action_plans a where a.project_id = p.id and a.due_date < current_date and a.status not in ('concluida','cancelada')) as overdue_actions,
    (select count(*) from public.decisions d where d.project_id = p.id and d.status = 'aguardando_decisao') as pending_decisions
) agg on true
left join lateral (
  select m.name as next_milestone_name, m.due_date as next_milestone_date
    from public.milestones m
   where m.project_id = p.id and m.completed_at is null and m.due_date >= current_date
   order by m.due_date asc limit 1
) nxt on true;

alter view public.v_project_overview set (security_invoker = on);
grant select on public.v_project_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Criacao a partir de template: herda o financial_module_default do template
-- quando o chamador nao informa um modo explicito (mesmo padrao de evm_enabled).
--
-- `create or replace function` NAO substitui uma funcao quando a lista de
-- parametros muda (viraria um overload novo, ambiguo para o PostgREST) - por
-- isso a versao antiga (12 parametros) precisa ser removida explicitamente
-- antes de criar a versao com o 13o parametro.
-- -----------------------------------------------------------------------------
drop function if exists public.create_project_from_template(
  uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric
);

create or replace function public.create_project_from_template(
  p_template_id uuid,
  p_code text,
  p_name text,
  p_start_date date,
  p_target_date date default null,
  p_owner_id uuid default null,
  p_sponsor_id uuid default null,
  p_company_id uuid default null,
  p_team_id uuid default null,
  p_category text default null,
  p_priority app.priority default 'media',
  p_budget numeric default null,
  p_financial_module_mode text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_project_id uuid;
  v_tpl record;
  v_phase record;
  v_task record;
  v_phase_map jsonb := '{}'::jsonb;
  v_new_phase_id uuid;
  v_task_id uuid;
  v_seq int := 0;
  v_financial_mode text;
begin
  if not (app.is_portfolio_manager() or app.my_role() = 'project_owner') then
    raise exception 'Sem permissao para criar projetos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tpl from public.project_templates where id = p_template_id;

  v_financial_mode := coalesce(p_financial_module_mode, v_tpl.financial_module_default, 'inherit');
  if v_financial_mode not in ('inherit', 'enabled', 'disabled') then
    v_financial_mode := 'inherit';
  end if;
  -- Sem privilegio para definir um override explicito, trg_projects_guard_financial_module
  -- (dispara tambem em insert) rebaixa silenciosamente para 'inherit'.

  insert into public.projects (
    code, name, template_id, category, priority, status,
    owner_id, sponsor_id, company_id, team_id,
    start_date, target_date, baseline_start_date, baseline_target_date,
    progress_method, evm_enabled, financial_module_mode, created_by, updated_by
  ) values (
    upper(p_code), p_name, p_template_id,
    coalesce(p_category, v_tpl.category, 'Outros'), p_priority, 'planejamento',
    coalesce(p_owner_id, auth.uid()), p_sponsor_id, p_company_id, p_team_id,
    p_start_date, p_target_date, p_start_date, p_target_date,
    coalesce(v_tpl.default_progress_method, 'automatico'), coalesce(v_tpl.evm_enabled, false),
    v_financial_mode,
    auth.uid(), auth.uid()
  ) returning id into v_project_id;

  insert into public.project_members (project_id, profile_id, project_role, can_edit, created_by, updated_by)
  values (v_project_id, coalesce(p_owner_id, auth.uid()), 'project_owner', true, auth.uid(), auth.uid())
  on conflict do nothing;

  if p_budget is not null then
    insert into public.project_budgets (project_id, revision, amount, effective_from, is_current, created_by, updated_by)
    values (v_project_id, 0, p_budget, coalesce(p_start_date, current_date), true, auth.uid(), auth.uid());
  end if;

  if p_template_id is null then
    return v_project_id;
  end if;

  for v_phase in
    select * from public.template_phases where template_id = p_template_id order by position
  loop
    insert into public.project_phases (project_id, name, position, weight, created_by, updated_by)
    values (v_project_id, v_phase.name, v_phase.position, v_phase.weight, auth.uid(), auth.uid())
    returning id into v_new_phase_id;
    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
  end loop;

  for v_task in
    select * from public.template_tasks where template_id = p_template_id order by position
  loop
    v_seq := v_seq + 1;
    insert into public.tasks (
      project_id, phase_id, code, title, description, weight, position,
      start_date, due_date, baseline_due_date, is_milestone, created_by, updated_by
    ) values (
      v_project_id,
      nullif(v_phase_map ->> v_task.template_phase_id::text, '')::uuid,
      'T' || lpad(v_seq::text, 3, '0'),
      v_task.title, v_task.description, v_task.weight, v_task.position,
      coalesce(p_start_date, current_date) + v_task.offset_start_days,
      coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
      coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
      v_task.is_milestone, auth.uid(), auth.uid()
    ) returning id into v_task_id;

    if v_task.is_milestone then
      insert into public.milestones (project_id, task_id, name, due_date, baseline_date, is_critical, created_by, updated_by)
      values (
        v_project_id, v_task_id, v_task.title,
        coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
        coalesce(p_start_date, current_date) + v_task.offset_start_days + v_task.duration_days,
        true, auth.uid(), auth.uid()
      );
    end if;
  end loop;

  perform app.refresh_project_progress(v_project_id);
  return v_project_id;
end $$;
grant execute on function public.create_project_from_template(
  uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric, text
) to authenticated;
