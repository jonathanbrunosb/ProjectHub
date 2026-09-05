import type {
  ActionStatus, CalendarWindowKind, DecisionStatus, FinancialModuleMode, Health, Priority,
  ProjectStatus, RiskCriticality, RiskStatus, RiskStrategy, RoleKey, TaskStatus, AuditAction,
  StatusReportState,
} from '@/types/domain';
import type { Tone } from '@/components/ui/Badge';

/**
 * Semantica de cor padronizada da plataforma:
 * verde = no prazo | amarelo = atencao | vermelho = critico
 * cinza = em espera/inativo | azul = informativo | roxo = estrategico
 */
export const healthLabel: Record<Health, string> = {
  verde: 'No prazo',
  amarelo: 'Atencao',
  vermelho: 'Critico',
  cinza: 'Em espera',
};

export const healthTone: Record<Health, Tone> = {
  verde: 'ok', amarelo: 'warn', vermelho: 'danger', cinza: 'neutral',
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  em_espera: 'Em espera',
  concluido: 'Concluido',
  cancelado: 'Cancelado',
};

export const projectStatusTone: Record<ProjectStatus, Tone> = {
  planejamento: 'info',
  em_andamento: 'brand',
  em_espera: 'neutral',
  concluido: 'ok',
  cancelado: 'neutral',
};

export const priorityLabel: Record<Priority, string> = {
  baixa: 'Baixa', media: 'Media', alta: 'Alta', critica: 'Critica',
};

export const priorityTone: Record<Priority, Tone> = {
  baixa: 'neutral', media: 'info', alta: 'warn', critica: 'danger',
};

export const financialModeLabel: Record<FinancialModuleMode, string> = {
  inherit: 'Herdar configuracao padrao', enabled: 'Ativar neste projeto', disabled: 'Desativar neste projeto',
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  nao_iniciada: 'Nao iniciada',
  em_andamento: 'Em andamento',
  bloqueada: 'Bloqueada',
  em_revisao: 'Em revisao',
  concluida: 'Concluida',
  cancelada: 'Cancelada',
};

export const taskStatusTone: Record<TaskStatus, Tone> = {
  nao_iniciada: 'neutral',
  em_andamento: 'brand',
  bloqueada: 'danger',
  em_revisao: 'strategic',
  concluida: 'ok',
  cancelada: 'neutral',
};

export const riskStatusLabel: Record<RiskStatus, string> = {
  aberto: 'Aberto',
  em_tratamento: 'Em tratamento',
  mitigado: 'Mitigado',
  materializado: 'Materializado',
  encerrado: 'Encerrado',
};

export const riskStatusTone: Record<RiskStatus, Tone> = {
  aberto: 'warn',
  em_tratamento: 'info',
  mitigado: 'ok',
  materializado: 'danger',
  encerrado: 'neutral',
};

export const riskStrategyLabel: Record<RiskStrategy, string> = {
  evitar: 'Evitar', mitigar: 'Mitigar', transferir: 'Transferir', aceitar: 'Aceitar',
};

export const criticalityLabel: Record<RiskCriticality, string> = {
  critico: 'Critico', alto: 'Alto', moderado: 'Moderado', baixo: 'Baixo',
};

export const criticalityTone: Record<RiskCriticality, Tone> = {
  critico: 'danger', alto: 'warn', moderado: 'info', baixo: 'neutral',
};

/** Matriz 5x5: score = probabilidade x impacto. */
export function riskCriticality(score: number): RiskCriticality {
  if (score >= 15) return 'critico';
  if (score >= 9) return 'alto';
  if (score >= 4) return 'moderado';
  return 'baixo';
}

export const actionStatusLabel: Record<ActionStatus, string> = {
  nao_iniciada: 'Nao iniciada', em_andamento: 'Em andamento',
  concluida: 'Concluida', cancelada: 'Cancelada',
};

export const actionStatusTone: Record<ActionStatus, Tone> = {
  nao_iniciada: 'neutral', em_andamento: 'brand', concluida: 'ok', cancelada: 'neutral',
};

export const decisionStatusLabel: Record<DecisionStatus, string> = {
  em_preparacao: 'Em preparacao',
  aguardando_decisao: 'Aguardando decisao',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  reavaliar: 'Reavaliar',
};

export const decisionStatusTone: Record<DecisionStatus, Tone> = {
  em_preparacao: 'neutral',
  aguardando_decisao: 'warn',
  aprovado: 'ok',
  rejeitado: 'danger',
  reavaliar: 'strategic',
};

export const roleLabel: Record<RoleKey, string> = {
  admin: 'Administrador',
  pmo: 'PMO / Gerencia',
  sponsor: 'Sponsor',
  project_owner: 'Project Owner',
  collaborator: 'Colaborador',
  viewer: 'Consulta',
  auditor: 'Auditor',
};

export const roleDescription: Record<RoleKey, string> = {
  admin: 'Acesso integral ao sistema e a configuracao.',
  pmo: 'Acesso corporativo ao portfolio, dashboards, templates e relatorios.',
  sponsor: 'Visao executiva e registro de decisoes/aprovacoes dos projetos patrocinados.',
  project_owner: 'Gestao completa dos projetos sob sua responsabilidade.',
  collaborator: 'Execucao nos projetos e tarefas em que participa.',
  viewer: 'Somente leitura no escopo autorizado.',
  auditor: 'Consulta aos dados e a trilha de auditoria, sem edicao operacional.',
};

export const calendarKindLabel: Record<CalendarWindowKind, string> = {
  fechamento_mensal: 'Fechamento mensal',
  fechamento_trimestral: 'Fechamento trimestral',
  itr: 'ITR',
  dfp: 'DFP',
  ecd: 'ECD',
  ecf: 'ECF',
  entrega_regulatoria: 'Entrega regulatoria',
  inventario: 'Inventario',
  auditoria: 'Auditoria',
  freeze: 'Periodo de freeze',
  outro: 'Outro',
};

export const auditActionLabel: Record<AuditAction, string> = {
  login: 'Login',
  logout: 'Logout',
  login_failed: 'Falha de autenticacao',
  insert: 'Criacao',
  update: 'Alteracao',
  delete: 'Exclusao',
  status_change: 'Mudanca de status',
  health_change: 'Mudanca de saude',
  financial_change: 'Alteracao financeira',
  schedule_change: 'Alteracao de prazo',
  ownership_change: 'Mudanca de responsavel',
  export: 'Exportacao',
  permission_change: 'Alteracao de permissao',
  config_change: 'Alteracao de configuracao',
  environment_switch: 'Troca de ambiente',
  environment_switch_denied: 'Troca de ambiente negada',
};

export const auditActionTone: Record<AuditAction, Tone> = {
  login: 'info', logout: 'neutral', login_failed: 'danger',
  insert: 'ok', update: 'info', delete: 'danger',
  status_change: 'brand', health_change: 'warn', financial_change: 'strategic',
  schedule_change: 'warn', ownership_change: 'strategic', export: 'info',
  permission_change: 'danger', config_change: 'neutral',
  environment_switch: 'strategic', environment_switch_denied: 'danger',
};

export const statusReportStateLabel: Record<StatusReportState, string> = {
  rascunho: 'Rascunho', publicado: 'Publicado', substituido: 'Substituido',
};

export const statusReportStateTone: Record<StatusReportState, Tone> = {
  rascunho: 'neutral', publicado: 'ok', substituido: 'info',
};

export const entityLabel: Record<string, string> = {
  projects: 'Projeto',
  tasks: 'Tarefa',
  milestones: 'Marco',
  risks: 'Risco / Issue',
  action_plans: 'Plano de acao',
  decisions: 'Decisao',
  approvals: 'Aprovacao',
  project_budgets: 'Orcamento',
  financial_entries: 'Lancamento financeiro',
  indicators: 'Indicador',
  status_reports: 'Status Report',
  custom_field_definitions: 'Campo personalizado',
  custom_field_values: 'Valor de campo personalizado',
  resource_allocations: 'Alocacao de recurso',
  attachments: 'Anexo',
  profiles: 'Usuario',
  teams: 'Equipe',
  project_members: 'Membro do projeto',
  critical_calendar_events: 'Calendario critico',
  automation_rules: 'Regra de automacao',
  auth: 'Autenticacao',
  report: 'Relatorio',
  environment: 'Ambiente (QA/PRD)',
};
