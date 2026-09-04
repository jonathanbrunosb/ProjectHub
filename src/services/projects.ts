import { supabase } from '@/lib/supabase/client';
import type {
  Project, ProjectOverview, Profile, Team, Company, ProjectTemplate, Priority,
} from '@/types/domain';

const PROJECT_COLUMNS =
  'id,code,name,portfolio_id,template_id,category,objective,scope,expected_results,' +
  'executive_summary,executive_summary_updated_at,sponsor_id,owner_id,team_id,company_id,' +
  'priority,status,phase,health,health_is_manual,health_override_reason,health_overridden_at,' +
  'progress_method,progress_planned,progress_actual,start_date,target_date,' +
  'baseline_start_date,baseline_target_date,actual_end_date,evm_enabled,archived_at,updated_at';

export async function listProjectOverview(): Promise<ProjectOverview[]> {
  const { data, error } = await supabase
    .from('v_project_overview')
    .select('*')
    .is('archived_at', null)
    .order('code');
  if (error) throw error;
  return (data ?? []) as unknown as ProjectOverview[];
}

export async function getProjectOverview(id: string): Promise<ProjectOverview | null> {
  const { data, error } = await supabase
    .from('v_project_overview')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectOverview) ?? null;
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Project) ?? null;
}

export interface CreateProjectInput {
  code: string;
  name: string;
  template_id: string | null;
  category: string;
  priority: Priority;
  owner_id: string | null;
  sponsor_id: string | null;
  company_id: string | null;
  team_id: string | null;
  start_date: string;
  target_date: string | null;
  budget: number | null;
  objective?: string | null;
}

/**
 * Criacao passa por RPC quando ha template: a funcao instancia fases, tarefas,
 * marcos e orcamento em uma unica transacao no banco.
 */
export async function createProject(input: CreateProjectInput): Promise<string> {
  if (input.template_id) {
    const { data, error } = await supabase.rpc('create_project_from_template', {
      p_template_id: input.template_id,
      p_code: input.code,
      p_name: input.name,
      p_start_date: input.start_date,
      p_target_date: input.target_date,
      p_owner_id: input.owner_id,
      p_sponsor_id: input.sponsor_id,
      p_company_id: input.company_id,
      p_team_id: input.team_id,
      p_category: input.category,
      p_priority: input.priority,
      p_budget: input.budget,
    });
    if (error) throw error;
    return data as string;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      code: input.code.toUpperCase(),
      name: input.name,
      category: input.category,
      priority: input.priority,
      owner_id: input.owner_id,
      sponsor_id: input.sponsor_id,
      company_id: input.company_id,
      team_id: input.team_id,
      start_date: input.start_date,
      target_date: input.target_date,
      baseline_start_date: input.start_date,
      baseline_target_date: input.target_date,
      objective: input.objective ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (input.budget != null) {
    const { error: budgetError } = await supabase.from('project_budgets').insert({
      project_id: data.id, revision: 0, amount: input.budget,
      effective_from: input.start_date, is_current: true,
    });
    if (budgetError) throw budgetError;
  }
  return data.id as unknown as string;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function overrideHealth(projectId: string, health: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('override_project_health', {
    p_project_id: projectId, p_health: health, p_reason: reason,
  });
  if (error) throw error;
}

export async function clearHealthOverride(projectId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_health_override', { p_project_id: projectId });
  if (error) throw error;
}

export interface ProjectMemberRow {
  id: string;
  project_id: string;
  profile_id: string;
  project_role: string;
  role_label: string | null;
  can_edit: boolean;
  profile: { full_name: string; email: string; job_title: string | null } | null;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberRow[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('id,project_id,profile_id,project_role,role_label,can_edit,profile:profiles(full_name,email,job_title)')
    .eq('project_id', projectId)
    .order('project_role');
  if (error) throw error;
  return (data ?? []) as unknown as ProjectMemberRow[];
}

// --- Cadastros de apoio (usados em formularios e filtros) -------------------

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,job_title,role,company_id,business_unit_id,primary_team_id,avatar_url,weekly_capacity_hours,active')
    .eq('active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

export async function listTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id,name,area,manager_id,weekly_capacity_hours,max_allocation_pct,active')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Team[];
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies').select('id,code,name,active').eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Company[];
}

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const { data, error } = await supabase
    .from('project_templates')
    .select('id,code,name,category,description,default_progress_method,evm_enabled,active')
    .eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as ProjectTemplate[];
}
