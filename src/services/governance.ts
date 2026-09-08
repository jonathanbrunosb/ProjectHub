import { supabase } from '@/lib/supabase/client';
import type {
  AuditLogEntry, CalendarConflict, CriticalCalendarEvent, Decision, Indicator,
  IndicatorMeasurement, Notification, ResourceCapacity, StatusReport,
} from '@/types/domain';

// --- Decisoes ---------------------------------------------------------------
export interface DecisionWithContext extends Decision {
  decider: { full_name: string } | null;
  project: { code: string; name: string } | null;
}

const DECISION_COLUMNS =
  'id,project_id,code,subject,context,alternatives,recommendation,decider_id,deadline,status,' +
  'decision,rationale,decided_at';

export async function listDecisions(projectId?: string): Promise<DecisionWithContext[]> {
  let query = supabase
    .from('decisions')
    .select(`${DECISION_COLUMNS},decider:profiles!decisions_decider_id_fkey(full_name),project:projects(code,name)`)
    .order('deadline', { nullsFirst: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DecisionWithContext[];
}

export async function upsertDecision(input: Partial<Decision> & { project_id: string; subject: string }): Promise<void> {
  const payload = { ...input };
  if ((payload.status === 'aprovado' || payload.status === 'rejeitado') && !payload.decided_at) {
    payload.decided_at = new Date().toISOString();
  }
  const { error } = payload.id
    ? await supabase.from('decisions').update(payload).eq('id', payload.id)
    : await supabase.from('decisions').insert(payload);
  if (error) throw error;
}

export async function nextDecisionCode(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('decisions').select('code').eq('project_id', projectId)
    .order('code', { ascending: false }).limit(1);
  if (error) throw error;
  const n = data?.[0]?.code ? Number(String(data[0].code).replace(/\D/g, '')) + 1 : 1;
  return `D${String(Number.isFinite(n) ? n : 1).padStart(3, '0')}`;
}

// --- Indicadores ------------------------------------------------------------
const INDICATOR_COLUMNS =
  'id,project_id,name,description,category,formula,unit,target_value,current_value,direction,' +
  'frequency,source,owner_id,trend,active';

export async function listIndicators(projectId?: string): Promise<Indicator[]> {
  let query = supabase.from('indicators').select(INDICATOR_COLUMNS).eq('active', true).order('name');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Indicator[];
}

export async function listMeasurements(indicatorId: string): Promise<IndicatorMeasurement[]> {
  const { data, error } = await supabase
    .from('indicator_measurements')
    .select('id,indicator_id,reference_date,value,target_value,note')
    .eq('indicator_id', indicatorId)
    .order('reference_date');
  if (error) throw error;
  return (data ?? []) as unknown as IndicatorMeasurement[];
}

export async function upsertIndicator(input: Partial<Indicator> & { name: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('indicators').update(input).eq('id', input.id)
    : await supabase.from('indicators').insert(input);
  if (error) throw error;
}

// --- Status Reports ---------------------------------------------------------
export async function listStatusReports(projectId: string): Promise<StatusReport[]> {
  const { data, error } = await supabase
    .from('status_reports').select('*').eq('project_id', projectId)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StatusReport[];
}

export async function createStatusReport(input: Partial<StatusReport> & { project_id: string }): Promise<string> {
  const existing = await listStatusReports(input.project_id);
  const version = existing.length ? Math.max(...existing.map((r) => r.version)) + 1 : 1;
  const { data, error } = await supabase
    .from('status_reports')
    .insert({ ...input, version, state: 'rascunho' })
    .select('id').single();
  if (error) throw error;
  return data.id as unknown as string;
}

export async function updateStatusReport(id: string, patch: Partial<StatusReport>): Promise<void> {
  const { error } = await supabase.from('status_reports').update(patch).eq('id', id);
  if (error) throw error;
}

/** Publicacao grava snapshot imutavel via RPC; correcoes exigem nova versao. */
export async function publishStatusReport(id: string): Promise<void> {
  const { error } = await supabase.rpc('publish_status_report', { p_report_id: id });
  if (error) throw error;
}

// --- Recursos e capacidade --------------------------------------------------
export async function listCapacity(): Promise<ResourceCapacity[]> {
  const { data, error } = await supabase
    .from('v_resource_capacity').select('*').order('reference_month').order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as ResourceCapacity[];
}

export interface AllocationRow {
  id: string; project_id: string; profile_id: string;
  role_label: string | null; period_start: string; period_end: string;
  allocated_hours: number; allocation_pct: number | null;
  profile: { full_name: string; area_id: string | null; area: { name: string } | null } | null;
  project: { code: string; name: string } | null;
}

export async function listAllocations(projectId?: string): Promise<AllocationRow[]> {
  let query = supabase
    .from('resource_allocations')
    .select('id,project_id,profile_id,role_label,period_start,period_end,allocated_hours,allocation_pct,profile:profiles(full_name,area_id,area:areas!profiles_area_id_fkey(name)),project:projects(code,name)')
    .order('period_start', { ascending: false });
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AllocationRow[];
}

export async function upsertAllocation(input: Partial<AllocationRow> & { project_id: string; profile_id: string; period_start: string; period_end: string }): Promise<void> {
  const { profile: _p, project: _pr, ...payload } = input;
  const { error } = payload.id
    ? await supabase.from('resource_allocations').update(payload).eq('id', payload.id)
    : await supabase.from('resource_allocations').insert(payload);
  if (error) throw error;
}

export async function deleteAllocation(id: string): Promise<void> {
  const { error } = await supabase.from('resource_allocations').delete().eq('id', id);
  if (error) throw error;
}

// --- Calendario critico contabil -------------------------------------------
export async function listCalendarEvents(): Promise<CriticalCalendarEvent[]> {
  const { data, error } = await supabase
    .from('critical_calendar_events')
    .select('id,company_id,kind,name,description,start_date,end_date,is_freeze,severity,active')
    .eq('active', true)
    .order('start_date');
  if (error) throw error;
  return (data ?? []) as unknown as CriticalCalendarEvent[];
}

export async function upsertCalendarEvent(input: Partial<CriticalCalendarEvent> & { name: string; kind: string; start_date: string; end_date: string }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('critical_calendar_events').update(input).eq('id', input.id)
    : await supabase.from('critical_calendar_events').insert(input);
  if (error) throw error;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('critical_calendar_events').delete().eq('id', id);
  if (error) throw error;
}

/** Marcos que caem dentro de janelas sensiveis da Contabilidade. */
export async function listCalendarConflicts(): Promise<CalendarConflict[]> {
  const { data, error } = await supabase
    .from('v_calendar_conflicts').select('*').order('due_date');
  if (error) throw error;
  return (data ?? []) as unknown as CalendarConflict[];
}

// --- Trilha de auditoria ----------------------------------------------------
export interface AuditFilters {
  userId?: string; projectId?: string; entity?: string; action?: string;
  from?: string; to?: string; limit?: number;
}

export async function listAuditLog(filters: AuditFilters = {}): Promise<AuditLogEntry[]> {
  let query = supabase
    .from('application_audit_log')
    .select('id,occurred_at,user_id,user_name,user_email,action,entity,entity_id,project_id,old_data,new_data,changed_fields,ip_address,user_agent,origin')
    .order('occurred_at', { ascending: false })
    .limit(filters.limit ?? 300);

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.entity) query = query.eq('entity', filters.entity);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.from) query = query.gte('occurred_at', filters.from);
  if (filters.to) query = query.lte('occurred_at', `${filters.to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogEntry[];
}

/** Atividade recente do portfolio exibida na Visao Executiva. */
export async function listRecentActivity(limit = 12): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('application_audit_log')
    .select('id,occurred_at,user_name,action,entity,entity_id,project_id,changed_fields')
    .not('project_id', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogEntry[];
}

// --- Notificacoes -----------------------------------------------------------
export async function listNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,profile_id,project_id,rule_key,severity,title,body,link,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}

export async function runAlertEngine(): Promise<number> {
  const { data, error } = await supabase.rpc('generate_alerts');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function refreshAllHealth(): Promise<number> {
  const { data, error } = await supabase.rpc('refresh_all_health');
  if (error) throw error;
  return (data as number) ?? 0;
}
