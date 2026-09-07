import { supabase } from '@/lib/supabase/client';
import type { Milestone, Task } from '@/types/domain';

const TASK_COLUMNS =
  'id,project_id,phase_id,parent_task_id,code,title,description,assignee_id,priority,status,' +
  'start_date,due_date,baseline_due_date,completed_at,weight,progress,is_milestone,is_critical,' +
  'estimated_hours,tags,position';

export interface TaskWithContext extends Task {
  assignee: { full_name: string; area_id: string | null; area: { name: string } | null } | null;
  project: { code: string; name: string } | null;
}

export async function listTasks(projectId?: string): Promise<TaskWithContext[]> {
  let query = supabase
    .from('tasks')
    .select(`${TASK_COLUMNS},assignee:profiles!tasks_assignee_id_fkey(full_name,area_id,area:areas(name)),project:projects(code,name)`)
    .order('position')
    .order('due_date', { nullsFirst: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TaskWithContext[];
}

/** Tarefas atribuidas ao usuario logado (RLS ja limita ao escopo permitido). */
export async function listMyTasks(profileId: string): Promise<TaskWithContext[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`${TASK_COLUMNS},assignee:profiles!tasks_assignee_id_fkey(full_name,area_id,area:areas(name)),project:projects(code,name)`)
    .eq('assignee_id', profileId)
    .not('status', 'in', '(concluida,cancelada)')
    .order('due_date', { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as TaskWithContext[];
}

export async function createTask(input: Partial<Task> & { project_id: string; code: string; title: string }): Promise<string> {
  const { data, error } = await supabase.from('tasks').insert(input).select('id').single();
  if (error) throw error;
  return data.id as unknown as string;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

/** Proximo codigo sequencial da tarefa dentro do projeto (T001, T002, ...). */
export async function nextTaskCode(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('tasks').select('code').eq('project_id', projectId)
    .order('code', { ascending: false }).limit(1);
  if (error) throw error;
  const last = data?.[0]?.code as string | undefined;
  const n = last ? Number(last.replace(/\D/g, '')) + 1 : 1;
  return `T${String(Number.isFinite(n) ? n : 1).padStart(3, '0')}`;
}

export interface MilestoneWithProject extends Milestone {
  project: { code: string; name: string; health: string } | null;
}

export async function listMilestones(projectId?: string): Promise<MilestoneWithProject[]> {
  let query = supabase
    .from('milestones')
    .select('id,project_id,task_id,name,description,due_date,baseline_date,completed_at,is_critical,owner_id,project:projects(code,name,health)')
    .order('due_date');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MilestoneWithProject[];
}

/** Marcos em aberto nos proximos N dias - alimenta a Visao Executiva. */
export async function listUpcomingMilestones(days: number): Promise<MilestoneWithProject[]> {
  const until = new Date();
  until.setDate(until.getDate() + days);
  const { data, error } = await supabase
    .from('milestones')
    .select('id,project_id,task_id,name,description,due_date,baseline_date,completed_at,is_critical,owner_id,project:projects(code,name,health)')
    .is('completed_at', null)
    .lte('due_date', until.toISOString().slice(0, 10))
    .order('due_date')
    .limit(30);
  if (error) throw error;
  return (data ?? []) as unknown as MilestoneWithProject[];
}

export async function upsertMilestone(input: Partial<Milestone> & { project_id: string; name: string; due_date: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('milestones').update(input).eq('id', input.id)
    : await supabase.from('milestones').insert(input);
  if (error) throw error;
}

export interface TaskDependency {
  id: string; predecessor_id: string; successor_id: string;
  dependency_type: string; lag_days: number;
}

export async function listDependencies(projectId: string): Promise<TaskDependency[]> {
  const { data: tasks, error: taskError } = await supabase
    .from('tasks').select('id').eq('project_id', projectId);
  if (taskError) throw taskError;
  const ids = (tasks ?? []).map((t) => t.id as string);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('task_dependencies')
    .select('id,predecessor_id,successor_id,dependency_type,lag_days')
    .in('successor_id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as TaskDependency[];
}
