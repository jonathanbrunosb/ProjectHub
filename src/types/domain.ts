// Tipos de dominio espelhando os enums e tabelas do PostgreSQL (schema app/public).
// Mantidos a mao para evitar dependencia de geracao de tipos no build do GitHub Pages.

export type RoleKey =
  | 'admin' | 'pmo' | 'sponsor' | 'project_owner' | 'collaborator' | 'viewer' | 'auditor';

export type ProjectStatus =
  | 'planejamento' | 'em_andamento' | 'em_espera' | 'concluido' | 'cancelado';

export type Health = 'verde' | 'amarelo' | 'vermelho' | 'cinza';
export type Priority = 'baixa' | 'media' | 'alta' | 'critica';

export type TaskStatus =
  | 'nao_iniciada' | 'em_andamento' | 'bloqueada' | 'em_revisao' | 'concluida' | 'cancelada';

export type ProgressMethod = 'manual' | 'automatico';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type CustomFieldType =
  | 'texto' | 'texto_longo' | 'numero' | 'moeda' | 'percentual' | 'data' | 'data_hora'
  | 'boolean' | 'lista_unica' | 'multipla_escolha' | 'usuario' | 'equipe' | 'status' | 'url';

export type CustomFieldScope = 'global' | 'template' | 'projeto';
export type FinancialNature = 'orcado' | 'realizado' | 'comprometido' | 'forecast';
export type RiskKind = 'risco' | 'issue';
export type RiskStrategy = 'evitar' | 'mitigar' | 'transferir' | 'aceitar';
export type RiskStatus = 'aberto' | 'em_tratamento' | 'mitigado' | 'materializado' | 'encerrado';
export type ActionStatus = 'nao_iniciada' | 'em_andamento' | 'concluida' | 'cancelada';
export type DecisionStatus =
  | 'em_preparacao' | 'aguardando_decisao' | 'aprovado' | 'rejeitado' | 'reavaliar';
export type IndicatorUnit = 'numero' | 'moeda' | 'percentual' | 'quantidade' | 'prazo' | 'score';
export type IndicatorFrequency = 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'trimestral' | 'anual';
export type Trend = 'subindo' | 'estavel' | 'caindo';
export type StatusReportState = 'rascunho' | 'publicado' | 'substituido';
export type SavedViewScope = 'privada' | 'compartilhada' | 'padrao_projeto' | 'padrao_template';
export type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'insert' | 'update' | 'delete'
  | 'status_change' | 'health_change' | 'financial_change' | 'schedule_change'
  | 'ownership_change' | 'export' | 'permission_change' | 'config_change'
  | 'environment_switch' | 'environment_switch_denied';
export type CalendarWindowKind =
  | 'fechamento_mensal' | 'fechamento_trimestral' | 'itr' | 'dfp' | 'ecd' | 'ecf'
  | 'entrega_regulatoria' | 'inventario' | 'auditoria' | 'freeze' | 'outro';
export type RiskCriticality = 'critico' | 'alto' | 'moderado' | 'baixo';
export type FinancialModuleMode = 'inherit' | 'enabled' | 'disabled';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: RoleKey;
  company_id: string | null;
  business_unit_id: string | null;
  primary_team_id: string | null;
  avatar_url: string | null;
  weekly_capacity_hours: number;
  active: boolean;
  /** Permite alternar entre QA e PRD pelo seletor da interface. */
  can_switch_environment: boolean;
}

export interface Company { id: string; code: string; name: string; active: boolean }
export interface BusinessUnit { id: string; company_id: string; code: string; name: string; active: boolean }
export interface Team {
  id: string; name: string; area: string | null; manager_id: string | null;
  weekly_capacity_hours: number; max_allocation_pct: number; active: boolean;
}

export interface ProjectTemplate {
  id: string; code: string; name: string; category: string; description: string | null;
  default_progress_method: ProgressMethod; evm_enabled: boolean; active: boolean;
  financial_module_default: FinancialModuleMode;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  portfolio_id: string | null;
  template_id: string | null;
  category: string;
  objective: string | null;
  scope: string | null;
  expected_results: string | null;
  executive_summary: string | null;
  executive_summary_updated_at: string | null;
  sponsor_id: string | null;
  owner_id: string | null;
  team_id: string | null;
  company_id: string | null;
  priority: Priority;
  status: ProjectStatus;
  phase: string | null;
  health: Health;
  health_is_manual: boolean;
  health_override_reason: string | null;
  health_overridden_at: string | null;
  progress_method: ProgressMethod;
  progress_planned: number;
  progress_actual: number;
  start_date: string | null;
  target_date: string | null;
  baseline_start_date: string | null;
  baseline_target_date: string | null;
  actual_end_date: string | null;
  evm_enabled: boolean;
  financial_module_mode: FinancialModuleMode;
  archived_at: string | null;
  updated_at: string;
}

/** Linha da view v_project_overview: base do portfolio e da visao executiva. */
export interface ProjectOverview {
  id: string;
  code: string;
  name: string;
  category: string;
  status: ProjectStatus;
  health: Health;
  health_is_manual: boolean;
  priority: Priority;
  phase: string | null;
  portfolio_id: string | null;
  template_id: string | null;
  owner_id: string | null;
  sponsor_id: string | null;
  team_id: string | null;
  company_id: string | null;
  owner_name: string | null;
  sponsor_name: string | null;
  team_name: string | null;
  company_name: string | null;
  start_date: string | null;
  target_date: string | null;
  actual_end_date: string | null;
  progress_planned: number;
  progress_actual: number;
  progress_deviation: number;
  days_overdue: number;
  budget: number;
  actual: number;
  committed: number;
  forecast: number;
  remaining: number;
  forecast_variance: number;
  forecast_variance_pct: number;
  financial_module_mode: FinancialModuleMode;
  /** Ja calculado no banco: 'enabled'/'disabled' forcam; 'inherit' consulta o global. */
  financial_effective_enabled: boolean;
  goal_indicator_enabled: boolean;
  goal_indicator_realized: number | null;
  goal_indicator_projected: number | null;
  goal_deliveries_pending: number | null;
  critical_risks: number;
  open_risks: number;
  overdue_tasks: number;
  open_tasks: number;
  overdue_actions: number;
  pending_decisions: number;
  next_milestone_name: string | null;
  next_milestone_date: string | null;
  last_update_at: string;
  archived_at: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  phase_id: string | null;
  parent_task_id: string | null;
  code: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  priority: Priority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  baseline_due_date: string | null;
  completed_at: string | null;
  weight: number;
  progress: number;
  is_milestone: boolean;
  is_critical: boolean;
  estimated_hours: number | null;
  tags: string[];
  position: number;
}

export interface Milestone {
  id: string; project_id: string; task_id: string | null; name: string;
  description: string | null; due_date: string; baseline_date: string | null;
  completed_at: string | null; is_critical: boolean; owner_id: string | null;
}

export interface Risk {
  id: string; project_id: string; code: string; kind: RiskKind; category: string | null;
  title: string; description: string | null; cause: string | null; consequence: string | null;
  probability: number; impact: number; score: number; owner_id: string | null;
  strategy: RiskStrategy | null; mitigation_plan: string | null; due_date: string | null;
  status: RiskStatus; residual_probability: number | null; residual_impact: number | null;
  identified_at: string; last_review_at: string | null; evidence_url: string | null;
}

export interface ActionPlan {
  id: string; project_id: string; risk_id: string | null; code: string; title: string;
  description: string | null; origin: string; owner_id: string | null; due_date: string | null;
  status: ActionStatus; priority: Priority; evidence_url: string | null;
  completed_at: string | null; comment: string | null;
}

export interface ProjectBudget {
  id: string; project_id: string; revision: number; amount: number; currency: string;
  effective_from: string; is_current: boolean; justification: string | null; approved_by: string | null;
}

export interface FinancialEntry {
  id: string; project_id: string; nature: FinancialNature; reference_month: string;
  amount: number; currency: string; category: string | null; supplier: string | null;
  cost_center_id: string | null; account: string | null; description: string | null;
}

export interface FinancialSummary {
  project_id: string; code: string; name: string; budget: number; actual: number;
  committed: number; forecast: number; remaining: number;
  forecast_variance: number; forecast_variance_pct: number;
}

export interface FinancialCurvePoint {
  project_id: string; reference_month: string;
  planned: number | null; actual: number | null; committed: number | null; forecast: number | null;
}

export interface Indicator {
  id: string; project_id: string | null; name: string; description: string | null;
  category: string | null; formula: string | null; unit: IndicatorUnit;
  target_value: number | null; current_value: number | null; direction: 'maior_melhor' | 'menor_melhor';
  frequency: IndicatorFrequency; source: string | null; owner_id: string | null;
  trend: Trend | null; active: boolean;
}

export interface IndicatorMeasurement {
  id: string; indicator_id: string; reference_date: string; value: number;
  target_value: number | null; note: string | null;
}

export interface Decision {
  id: string; project_id: string; code: string; subject: string; context: string | null;
  alternatives: string | null; recommendation: string | null; decider_id: string | null;
  deadline: string | null; status: DecisionStatus; decision: string | null;
  rationale: string | null; decided_at: string | null;
}

export interface ResourceAllocation {
  id: string; project_id: string; profile_id: string; team_id: string | null;
  role_label: string | null; period_start: string; period_end: string;
  allocated_hours: number; allocation_pct: number | null;
}

export interface ResourceCapacity {
  profile_id: string; full_name: string; team_id: string | null; team_name: string | null;
  reference_month: string; capacity_hours: number; allocated_hours: number;
  allocation_pct: number; project_count: number;
}

export interface CriticalCalendarEvent {
  id: string; company_id: string | null; kind: CalendarWindowKind; name: string;
  description: string | null; start_date: string; end_date: string;
  is_freeze: boolean; severity: Priority; active: boolean;
}

export interface CalendarConflict {
  milestone_id: string; project_id: string; project_code: string; project_name: string;
  milestone_name: string; due_date: string; event_id: string; event_name: string;
  event_kind: CalendarWindowKind; is_freeze: boolean; severity: Priority;
  window_start: string; window_end: string;
}

export interface StatusReport {
  id: string; project_id: string; version: number; period_start: string; period_end: string;
  state: StatusReportState; health: Health; progress_actual: number; progress_planned: number;
  progress_in_period: number; executive_summary: string | null; main_deliveries: string | null;
  next_steps: string | null; risks_summary: string | null; issues_summary: string | null;
  financial_summary: string | null; required_decisions: string | null;
  snapshot: Record<string, unknown>; published_at: string | null; published_by: string | null;
  supersedes_id: string | null; created_at: string;
}

export interface CustomFieldDefinition {
  id: string; scope: CustomFieldScope; template_id: string | null; project_id: string | null;
  entity: string; key: string; label: string; description: string | null;
  field_type: CustomFieldType; required: boolean; default_text: string | null;
  default_number: number | null; default_date: string | null; default_boolean: boolean | null;
  position: number; visible_roles: RoleKey[]; editable_roles: RoleKey[]; active: boolean;
  options?: CustomFieldOption[];
}

export interface CustomFieldOption {
  id: string; definition_id: string; value: string; label: string;
  color: string | null; position: number; active: boolean;
}

export interface CustomFieldValue {
  id: string; definition_id: string; project_id: string | null; entity: string; record_id: string;
  value_text: string | null; value_number: number | null; value_date: string | null;
  value_timestamp: string | null; value_boolean: boolean | null; value_uuid: string | null;
  value_json: unknown | null;
}

export interface SavedView {
  id: string; owner_id: string | null; module: string; name: string; scope: SavedViewScope;
  project_id: string | null; template_id: string | null; is_default: boolean;
  config: SavedViewConfig;
}

export interface SavedViewConfig {
  filters?: Record<string, unknown>;
  sort?: { id: string; desc: boolean }[];
  columns?: { visible?: Record<string, boolean>; order?: string[]; sizes?: Record<string, number>; pinned?: string[] };
  grouping?: string[];
  search?: string;
}

export interface ColumnPreference {
  id: string; profile_id: string; module: string; view_key: string; config: SavedViewConfig['columns'];
}

export interface AuditLogEntry {
  id: number; occurred_at: string; user_id: string | null; user_name: string | null;
  user_email: string | null; action: AuditAction; entity: string; entity_id: string | null;
  project_id: string | null; old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null; changed_fields: string[] | null;
  ip_address: string | null; user_agent: string | null; origin: string;
}

export interface Notification {
  id: string; profile_id: string; project_id: string | null; rule_key: string | null;
  severity: Priority; title: string; body: string | null; link: string | null;
  read_at: string | null; created_at: string;
}

/** Configuracao global da plataforma (linha unica). */
export interface SystemSettings {
  financial_module_enabled: boolean;
}

// --- Indicadores de Metas (nota de aderencia a prazo das entregas) ---------

export type GoalDayBasis = 'uteis' | 'corridos';
export type GoalWeightMode = 'igual' | 'manual';
export type GoalPeriodStatus = 'em_apuracao' | 'fechado';

export interface Holiday { id: string; date: string; name: string; active: boolean }

export interface ProjectGoalSettings {
  project_id: string;
  enabled: boolean;
  day_basis: GoalDayBasis;
  challenge_days: number;
  minimum_days: number;
  challenge_score: number;
  target_score: number;
  minimum_score: number;
  weight_mode: GoalWeightMode;
}

export interface TaskGoalConfig {
  task_id: string;
  included: boolean;
  weight: number;
  baseline_date: string | null;
  challenge_days_override: number | null;
  minimum_days_override: number | null;
  override_score: number | null;
  override_reason: string | null;
  override_by: string | null;
  override_at: string | null;
}

/** Linha da view v_task_goal_scores: nota realizada e projetada por entrega. */
export interface TaskGoalScore {
  task_id: string;
  project_id: string;
  code: string;
  title: string;
  phase_id: string | null;
  assignee_id: string | null;
  weight: number;
  target_date: string | null;
  current_due_date: string | null;
  baseline_frozen: boolean;
  actual_date: string | null;
  challenge_days: number;
  minimum_days: number;
  day_basis: GoalDayBasis;
  challenge_score: number;
  target_score: number;
  minimum_score: number;
  override_score: number | null;
  override_reason: string | null;
  is_override: boolean;
  score_realized: number | null;
  score_projected: number | null;
}

/** Linha da view v_project_goal_indicator: media ponderada por projeto. */
export interface ProjectGoalIndicator {
  project_id: string;
  deliveries_total: number;
  deliveries_done: number;
  deliveries_pending: number;
  weight_done_sum: number | null;
  weight_total_sum: number | null;
  indicator_realized: number | null;
  indicator_projected: number | null;
}

export interface GoalScorePeriod {
  id: string;
  project_id: string;
  competencia: string;
  status: GoalPeriodStatus;
  indicator_realized: number | null;
  indicator_projected: number | null;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}
