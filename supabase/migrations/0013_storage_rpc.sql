-- =============================================================================
-- 0013 - Storage privado e RPCs de aplicacao
-- =============================================================================

-- Bucket privado: download somente por URL assinada gerada no servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files', 'project-files', false, 52428800,
  array['application/pdf','image/png','image/jpeg','image/webp','text/csv','text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Convencao de caminho: <project_id>/<entity>/<arquivo>
create policy "project files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and app.can_read_project((storage.foldername(name))[1]::uuid)
  );

create policy "project files insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and app.can_write_project((storage.foldername(name))[1]::uuid)
  );

create policy "project files update" on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and app.can_write_project((storage.foldername(name))[1]::uuid));

create policy "project files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and app.can_manage_project((storage.foldername(name))[1]::uuid));

-- =============================================================================
-- Criacao de projeto a partir de template (fases, tarefas, marcos e campos)
-- =============================================================================
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
  p_budget numeric default null
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
begin
  if not (app.is_portfolio_manager() or app.my_role() = 'project_owner') then
    raise exception 'Sem permissao para criar projetos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tpl from public.project_templates where id = p_template_id;

  insert into public.projects (
    code, name, template_id, category, priority, status,
    owner_id, sponsor_id, company_id, team_id,
    start_date, target_date, baseline_start_date, baseline_target_date,
    progress_method, evm_enabled, created_by, updated_by
  ) values (
    upper(p_code), p_name, p_template_id,
    coalesce(p_category, v_tpl.category, 'Outros'), p_priority, 'planejamento',
    coalesce(p_owner_id, auth.uid()), p_sponsor_id, p_company_id, p_team_id,
    p_start_date, p_target_date, p_start_date, p_target_date,
    coalesce(v_tpl.default_progress_method, 'automatico'), coalesce(v_tpl.evm_enabled, false),
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
grant execute on function public.create_project_from_template(uuid, text, text, date, date, uuid, uuid, uuid, uuid, text, app.priority, numeric) to authenticated;

-- =============================================================================
-- Publicacao de Status Report com snapshot historico imutavel
-- =============================================================================
create or replace function public.publish_status_report(p_report_id uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare r record; v_snapshot jsonb; v_prev uuid;
begin
  select * into r from public.status_reports where id = p_report_id;
  if r is null then raise exception 'Status Report inexistente'; end if;
  if not app.can_manage_project(r.project_id) then
    raise exception 'Somente Owner/PMO publicam Status Report' using errcode = 'insufficient_privilege';
  end if;
  if r.state = 'publicado' then raise exception 'Status Report ja publicado'; end if;

  select jsonb_build_object(
      'project', to_jsonb(o.*),
      'risks', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select code, title, score, status, strategy from public.risks
           where project_id = r.project_id and status in ('aberto','em_tratamento')
           order by score desc limit 10) x), '[]'::jsonb),
      'milestones', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select name, due_date, completed_at from public.milestones
           where project_id = r.project_id order by due_date limit 10) x), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select code, subject, status, deadline from public.decisions
           where project_id = r.project_id and status = 'aguardando_decisao') x), '[]'::jsonb),
      'generated_at', now()
    ) into v_snapshot
    from public.v_project_overview o where o.id = r.project_id;

  select id into v_prev from public.status_reports
   where project_id = r.project_id and state = 'publicado'
   order by version desc limit 1;

  if v_prev is not null then
    update public.status_reports set state = 'substituido' where id = v_prev;
  end if;

  update public.status_reports
     set state = 'publicado',
         published_at = now(),
         published_by = auth.uid(),
         supersedes_id = v_prev,
         snapshot = v_snapshot,
         health = (select health from public.projects where id = r.project_id),
         progress_actual = (select progress_actual from public.projects where id = r.project_id),
         progress_planned = (select progress_planned from public.projects where id = r.project_id)
   where id = p_report_id;

  return p_report_id;
end $$;
grant execute on function public.publish_status_report(uuid) to authenticated;
