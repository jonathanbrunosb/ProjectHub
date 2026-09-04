import { supabase } from '@/lib/supabase/client';
import type { FinancialCurvePoint, FinancialEntry, FinancialSummary, ProjectBudget } from '@/types/domain';

export async function listFinancialSummary(): Promise<FinancialSummary[]> {
  const { data, error } = await supabase.from('v_project_financials').select('*');
  if (error) throw error;
  return (data ?? []) as unknown as FinancialSummary[];
}

export async function getFinancialSummary(projectId: string): Promise<FinancialSummary | null> {
  const { data, error } = await supabase
    .from('v_project_financials').select('*').eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return (data as unknown as FinancialSummary) ?? null;
}

export async function getFinancialCurve(projectId?: string): Promise<FinancialCurvePoint[]> {
  let query = supabase.from('v_project_financial_curve').select('*').order('reference_month');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as FinancialCurvePoint[];
}

export async function listBudgets(projectId: string): Promise<ProjectBudget[]> {
  const { data, error } = await supabase
    .from('project_budgets')
    .select('id,project_id,revision,amount,currency,effective_from,is_current,justification,approved_by')
    .eq('project_id', projectId)
    .order('revision', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectBudget[];
}

/** Nova revisao de orcamento: preserva o historico em vez de sobrescrever. */
export async function createBudgetRevision(
  projectId: string, amount: number, justification: string, effectiveFrom: string,
): Promise<void> {
  const current = await listBudgets(projectId);
  const nextRevision = current.length ? Math.max(...current.map((b) => b.revision)) + 1 : 0;
  const { error } = await supabase.from('project_budgets').insert({
    project_id: projectId, revision: nextRevision, amount,
    justification, effective_from: effectiveFrom, is_current: true,
  });
  if (error) throw error;
}

export interface FinancialEntryWithCostCenter extends FinancialEntry {
  cost_center: { code: string; name: string } | null;
}

export async function listFinancialEntries(projectId: string): Promise<FinancialEntryWithCostCenter[]> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select('id,project_id,nature,reference_month,amount,currency,category,supplier,cost_center_id,account,description,cost_center:cost_centers(code,name)')
    .eq('project_id', projectId)
    .order('reference_month', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FinancialEntryWithCostCenter[];
}

export async function upsertFinancialEntry(input: Partial<FinancialEntry> & { project_id: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('financial_entries').update(input).eq('id', input.id)
    : await supabase.from('financial_entries').insert(input);
  if (error) throw error;
}

export async function deleteFinancialEntry(id: string): Promise<void> {
  const { error } = await supabase.from('financial_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function listCostCenters(): Promise<{ id: string; code: string; name: string }[]> {
  const { data, error } = await supabase
    .from('cost_centers').select('id,code,name').eq('active', true).order('code');
  if (error) throw error;
  return (data ?? []) as { id: string; code: string; name: string }[];
}
