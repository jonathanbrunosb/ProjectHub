import { supabase } from '@/lib/supabase/client';
import type {
  GoalScorePeriod, Holiday, ProjectGoalIndicator, ProjectGoalSettings, TaskGoalConfig, TaskGoalScore,
} from '@/types/domain';

const SETTINGS_COLUMNS =
  'project_id,enabled,day_basis,challenge_days,minimum_days,challenge_score,target_score,minimum_score,weight_mode';

export async function getProjectGoalSettings(projectId: string): Promise<ProjectGoalSettings | null> {
  const { data, error } = await supabase
    .from('project_goal_settings').select(SETTINGS_COLUMNS).eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectGoalSettings) ?? null;
}

/** Upsert manual: a tabela usa `project_id` como PK, sem coluna `id` propria. */
export async function upsertProjectGoalSettings(input: ProjectGoalSettings): Promise<void> {
  const { error } = await supabase.from('project_goal_settings').upsert(input, { onConflict: 'project_id' });
  if (error) throw error;
}

const TASK_GOAL_CONFIG_COLUMNS =
  'task_id,included,weight,baseline_date,challenge_days_override,minimum_days_override,' +
  'override_score,override_reason,override_by,override_at';

export async function listTaskGoalConfigs(taskIds: string[]): Promise<TaskGoalConfig[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from('task_goal_config').select(TASK_GOAL_CONFIG_COLUMNS).in('task_id', taskIds);
  if (error) throw error;
  return (data ?? []) as unknown as TaskGoalConfig[];
}

export async function upsertTaskGoalConfig(input: Partial<TaskGoalConfig> & { task_id: string }): Promise<void> {
  const { error } = await supabase.from('task_goal_config').upsert(input, { onConflict: 'task_id' });
  if (error) throw error;
}

/**
 * Ajuste manual da nota (override) - sempre com justificativa, sempre
 * auditado pelo gatilho generico da tabela (item 51/52).
 */
export async function overrideTaskScore(taskId: string, score: number, reason: string): Promise<void> {
  const { error } = await supabase.from('task_goal_config').update({
    override_score: score, override_reason: reason,
  }).eq('task_id', taskId);
  if (error) throw error;
}

export async function clearTaskScoreOverride(taskId: string): Promise<void> {
  const { error } = await supabase.from('task_goal_config').update({
    override_score: null, override_reason: null,
  }).eq('task_id', taskId);
  if (error) throw error;
}

/** Congela a Data Meta atual como baseline - reprogramar due_date depois nao move mais a meta. */
export async function freezeTaskBaseline(taskId: string, currentDueDate: string): Promise<void> {
  const { error } = await supabase.from('task_goal_config').update({ baseline_date: currentDueDate }).eq('task_id', taskId);
  if (error) throw error;
}

export async function clearTaskBaseline(taskId: string): Promise<void> {
  const { error } = await supabase.from('task_goal_config').update({ baseline_date: null }).eq('task_id', taskId);
  if (error) throw error;
}

const TASK_SCORE_COLUMNS =
  'task_id,project_id,code,title,phase_id,assignee_id,weight,target_date,current_due_date,' +
  'baseline_frozen,actual_date,challenge_days,minimum_days,day_basis,challenge_score,target_score,' +
  'minimum_score,override_score,override_reason,is_override,score_realized,score_projected';

export async function listTaskGoalScores(projectId: string): Promise<TaskGoalScore[]> {
  const { data, error } = await supabase
    .from('v_task_goal_scores').select(TASK_SCORE_COLUMNS).eq('project_id', projectId).order('target_date');
  if (error) throw error;
  return (data ?? []) as unknown as TaskGoalScore[];
}

/** Todas as entregas elegiveis no escopo autorizado - alimenta o KPI "Entregas atrasadas" consolidado. */
export async function listAllTaskGoalScores(): Promise<TaskGoalScore[]> {
  const { data, error } = await supabase.from('v_task_goal_scores').select(TASK_SCORE_COLUMNS);
  if (error) throw error;
  return (data ?? []) as unknown as TaskGoalScore[];
}

const PROJECT_INDICATOR_COLUMNS =
  'project_id,deliveries_total,deliveries_done,deliveries_pending,weight_done_sum,weight_total_sum,' +
  'indicator_realized,indicator_projected';

export async function getProjectGoalIndicator(projectId: string): Promise<ProjectGoalIndicator | null> {
  const { data, error } = await supabase
    .from('v_project_goal_indicator').select(PROJECT_INDICATOR_COLUMNS).eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectGoalIndicator) ?? null;
}

export async function listProjectGoalIndicators(): Promise<ProjectGoalIndicator[]> {
  const { data, error } = await supabase.from('v_project_goal_indicator').select(PROJECT_INDICATOR_COLUMNS);
  if (error) throw error;
  return (data ?? []) as unknown as ProjectGoalIndicator[];
}

// --- Feriados corporativos (base para o calculo em dias uteis) -------------

export async function listHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase.from('holidays').select('id,date,name,active').order('date');
  if (error) throw error;
  return (data ?? []) as unknown as Holiday[];
}

export async function createHoliday(input: { date: string; name: string }): Promise<void> {
  const { error } = await supabase.from('holidays').insert(input);
  if (error) throw error;
}

export async function deleteHoliday(id: string): Promise<void> {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
}

// --- Fechamento de periodo (competencia) ------------------------------------

export async function listGoalPeriods(projectId: string): Promise<GoalScorePeriod[]> {
  const { data, error } = await supabase
    .from('goal_score_periods')
    .select('id,project_id,competencia,status,indicator_realized,indicator_projected,closed_at,reopened_at,reopen_reason')
    .eq('project_id', projectId)
    .order('competencia', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GoalScorePeriod[];
}

/** `competencia` no formato YYYY-MM-01 (primeiro dia do mes). */
export async function closeGoalPeriod(projectId: string, competencia: string): Promise<string> {
  const { data, error } = await supabase.rpc('close_goal_period', {
    p_project_id: projectId, p_competencia: competencia,
  });
  if (error) throw error;
  return data as string;
}

export async function reopenGoalPeriod(projectId: string, competencia: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_goal_period', {
    p_project_id: projectId, p_competencia: competencia, p_reason: reason,
  });
  if (error) throw error;
}
