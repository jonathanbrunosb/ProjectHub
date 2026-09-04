import { supabase } from '@/lib/supabase/client';
import type { ActionPlan, Risk } from '@/types/domain';

const RISK_COLUMNS =
  'id,project_id,code,kind,category,title,description,cause,consequence,probability,impact,score,' +
  'owner_id,strategy,mitigation_plan,due_date,status,residual_probability,residual_impact,' +
  'identified_at,last_review_at,evidence_url';

export interface RiskWithContext extends Risk {
  owner: { full_name: string } | null;
  project: { code: string; name: string } | null;
}

export async function listRisks(projectId?: string): Promise<RiskWithContext[]> {
  let query = supabase
    .from('risks')
    .select(`${RISK_COLUMNS},owner:profiles!risks_owner_id_fkey(full_name),project:projects(code,name)`)
    .order('score', { ascending: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RiskWithContext[];
}

export async function upsertRisk(input: Partial<Risk> & { project_id: string; title: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('risks').update(input).eq('id', input.id)
    : await supabase.from('risks').insert(input);
  if (error) throw error;
}

export async function deleteRisk(id: string): Promise<void> {
  const { error } = await supabase.from('risks').delete().eq('id', id);
  if (error) throw error;
}

export async function nextRiskCode(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('risks').select('code').eq('project_id', projectId)
    .order('code', { ascending: false }).limit(1);
  if (error) throw error;
  const n = data?.[0]?.code ? Number(String(data[0].code).replace(/\D/g, '')) + 1 : 1;
  return `R${String(Number.isFinite(n) ? n : 1).padStart(3, '0')}`;
}

export interface ActionPlanWithContext extends ActionPlan {
  owner: { full_name: string } | null;
  project: { code: string; name: string } | null;
  risk: { code: string; title: string } | null;
}

const ACTION_COLUMNS =
  'id,project_id,risk_id,code,title,description,origin,owner_id,due_date,status,priority,' +
  'evidence_url,completed_at,comment';

export async function listActionPlans(projectId?: string): Promise<ActionPlanWithContext[]> {
  let query = supabase
    .from('action_plans')
    .select(`${ACTION_COLUMNS},owner:profiles!action_plans_owner_id_fkey(full_name),project:projects(code,name),risk:risks(code,title)`)
    .order('due_date', { nullsFirst: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ActionPlanWithContext[];
}

export async function upsertActionPlan(input: Partial<ActionPlan> & { project_id: string; title: string }): Promise<void> {
  const payload = { ...input };
  if (payload.status === 'concluida' && !payload.completed_at) {
    payload.completed_at = new Date().toISOString().slice(0, 10);
  }
  const { error } = payload.id
    ? await supabase.from('action_plans').update(payload).eq('id', payload.id)
    : await supabase.from('action_plans').insert(payload);
  if (error) throw error;
}

export async function nextActionCode(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('action_plans').select('code').eq('project_id', projectId)
    .order('code', { ascending: false }).limit(1);
  if (error) throw error;
  const n = data?.[0]?.code ? Number(String(data[0].code).replace(/\D/g, '')) + 1 : 1;
  return `AP${String(Number.isFinite(n) ? n : 1).padStart(3, '0')}`;
}
