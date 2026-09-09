import { supabase } from '@/lib/supabase/client';
import type {
  Project, ProjectOverview, Profile, Company, ProjectTemplate, Priority, FinancialModuleMode,
} from '@/types/domain';

const PROJECT_COLUMNS =
  'id,code,name,portfolio_id,template_id,category,objective,scope,expected_results,' +
  'executive_summary,executive_summary_updated_at,sponsor_id,owner_id,area_id,company_id,' +
  'priority,status,phase,health,health_is_manual,health_override_reason,health_overridden_at,' +
  'progress_method,progress_planned,progress_actual,start_date,target_date,' +
  'baseline_start_date,baseline_target_date,actual_end_date,evm_enabled,financial_module_mode,' +
  'archived_at,updated_at';

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
  area_id: string | null;
  start_date: string;
  target_date: string | null;
  budget: number | null;
  objective?: string | null;
  /** Omitido = 'inherit'. Ignorado no banco se quem chama nao gerenciar o modulo financeiro. */
  financial_module_mode?: FinancialModuleMode;
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
      p_area_id: input.area_id,
      p_category: input.category,
      p_priority: input.priority,
      p_budget: input.budget,
      p_financial_module_mode: input.financial_module_mode ?? null,
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
      area_id: input.area_id,
      start_date: input.start_date,
      target_date: input.target_date,
      baseline_start_date: input.start_date,
      baseline_target_date: input.target_date,
      objective: input.objective ?? null,
      financial_module_mode: input.financial_module_mode ?? 'inherit',
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
  start_date: string;
  end_date: string | null;
  status: 'ativo' | 'inativo';
  notes: string | null;
  profile: {
    full_name: string; email: string; employee_number: string | null; job_title: string | null; active: boolean;
    weekly_capacity_hours: number;
    area_id: string | null; area: { name: string; business_unit: { name: string } | null } | null;
  } | null;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberRow[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('id,project_id,profile_id,project_role,role_label,can_edit,start_date,end_date,status,notes,profile:profiles(full_name,email,employee_number,job_title,active,weekly_capacity_hours,area_id,area:areas!profiles_area_id_fkey(name,business_unit:business_units(name)))')
    .eq('project_id', projectId)
    .order('status').order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectMemberRow[];
}

// --- Cadastros de apoio (usados em formularios e filtros) -------------------

const PROFILE_COLUMNS =
  'id,email,employee_number,full_name,job_title,role,company_id,business_unit_id,area_id,avatar_url,weekly_capacity_hours,active,can_switch_environment';

/**
 * Todos os perfis, ativos ou nao. Uso: gestao de usuarios (Admin precisa ver
 * quem esta inativo para poder reativar) e filtros historicos como a trilha
 * de auditoria (uma acao antiga pode ter sido de alguem hoje inativo).
 */
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

/**
 * So' perfis ativos. Uso: seletores de responsavel (owner, sponsor, assignee,
 * decisor) - nao faz sentido atribuir trabalho novo a alguem inativo.
 */
export async function listActiveProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

const COMPANY_COLUMNS = 'id,code,name,cnpj,active';

/** Empresas ativas, usadas nos seletores de novos vinculos. */
export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies').select(COMPANY_COLUMNS).eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Company[];
}

export interface ProjectMemberCandidate {
  id: string; full_name: string; email: string; employee_number: string | null;
  job_title: string | null; active: boolean;
  area: { name: string; business_unit: { name: string } | null } | null;
}

export async function listProjectMemberCandidates(): Promise<ProjectMemberCandidate[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,email,employee_number,job_title,active,area:areas!profiles_area_id_fkey(name,business_unit:business_units(name))')
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as ProjectMemberCandidate[];
}

export interface ProjectMemberInput {
  project_id: string; profile_id: string; role_label: string; start_date: string;
  end_date: string | null; status: 'ativo' | 'inativo'; notes: string | null;
}

export async function createProjectMember(input: ProjectMemberInput): Promise<void> {
  const { error } = await supabase.from('project_members').insert({
    ...input, project_role: 'collaborator', can_edit: false,
  });
  if (error) throw error;
}

export async function updateProjectMember(
  id: string,
  patch: Partial<Omit<ProjectMemberInput, 'project_id' | 'profile_id'>>,
): Promise<void> {
  const { error } = await supabase.from('project_members').update(patch).eq('id', id);
  if (error) throw error;
}

/** Todas as empresas, inclusive inativas, para a tela de administracao. */
export async function listAllCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies').select(COMPANY_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Company[];
}

export interface CompanyInput {
  code: string;
  name: string;
  cnpj: string | null;
}

export async function createCompany(input: CompanyInput): Promise<string> {
  const { data, error } = await supabase.from('companies').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateCompany(id: string, patch: Partial<CompanyInput>): Promise<void> {
  const { error } = await supabase.from('companies').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setCompanyActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('companies').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const { data, error } = await supabase
    .from('project_templates')
    .select('id,code,name,category,description,default_progress_method,evm_enabled,financial_module_default,active')
    .eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as ProjectTemplate[];
}

/** Somente o padrao financeiro do template - alterado em Configuracoes > Templates. */
export async function updateTemplateFinancialDefault(
  templateId: string, financialModuleDefault: FinancialModuleMode,
): Promise<void> {
  const { error } = await supabase
    .from('project_templates')
    .update({ financial_module_default: financialModuleDefault })
    .eq('id', templateId);
  if (error) throw error;
}
