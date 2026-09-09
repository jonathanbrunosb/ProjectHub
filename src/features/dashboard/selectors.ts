import type { FinancialCurvePoint, Health, ProjectOverview, ResourceCapacity } from '@/types/domain';

export interface PortfolioKpis {
  total: number;
  active: number;
  completed: number;
  onTrack: number;
  attention: number;
  critical: number;
  onHold: number;
  avgProgress: number;
  avgPlanned: number;
  progressDeviation: number;
  budget: number;
  actual: number;
  committed: number;
  forecast: number;
  remaining: number;
  forecastVariance: number;
  forecastVariancePct: number;
  criticalRisks: number;
  overdueTasks: number;
  overdueActions: number;
  pendingDecisions: number;
  lastUpdateAt: string | null;
}

const sum = (rows: ProjectOverview[], pick: (p: ProjectOverview) => number) =>
  rows.reduce((acc, p) => acc + Number(pick(p) ?? 0), 0);

/**
 * Consolida a carteira. O avanco medio considera apenas projetos ativos:
 * incluir concluidos e cancelados distorce a leitura de execucao corrente.
 */
export function portfolioKpis(projects: ProjectOverview[]): PortfolioKpis {
  const active = projects.filter((p) => p.status === 'em_andamento' || p.status === 'planejamento');
  const base = active.length ? active : [];

  // Projetos com o modulo financeiro desligado nao entram nas consolidacoes -
  // somar budget=0/forecast=0 deles distorceria a leitura como se fossem
  // projetos sem orcamento, quando na verdade o financeiro nem se aplica.
  const financial = projects.filter((p) => p.financial_effective_enabled);

  const avgProgress = base.length ? sum(base, (p) => p.progress_actual) / base.length : 0;
  const avgPlanned = base.length ? sum(base, (p) => p.progress_planned) / base.length : 0;
  const budget = sum(financial, (p) => p.budget);
  const forecast = sum(financial, (p) => p.forecast);

  const lastUpdates = projects
    .map((p) => p.last_update_at)
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    total: projects.length,
    active: active.length,
    completed: projects.filter((p) => p.status === 'concluido').length,
    onTrack: projects.filter((p) => p.health === 'verde').length,
    attention: projects.filter((p) => p.health === 'amarelo').length,
    critical: projects.filter((p) => p.health === 'vermelho').length,
    onHold: projects.filter((p) => p.status === 'em_espera').length,
    avgProgress: round(avgProgress),
    avgPlanned: round(avgPlanned),
    progressDeviation: round(avgProgress - avgPlanned),
    budget,
    actual: sum(financial, (p) => p.actual),
    committed: sum(financial, (p) => p.committed),
    forecast,
    remaining: sum(financial, (p) => p.remaining),
    forecastVariance: forecast - budget,
    forecastVariancePct: budget === 0 ? 0 : round(((forecast - budget) / budget) * 100),
    criticalRisks: sum(projects, (p) => p.critical_risks),
    overdueTasks: sum(projects, (p) => p.overdue_tasks),
    overdueActions: sum(projects, (p) => p.overdue_actions),
    pendingDecisions: sum(projects, (p) => p.pending_decisions),
    lastUpdateAt: lastUpdates[0] ?? null,
  };
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export interface DistributionSlice { key: string; label: string; value: number }

const healthOrder: Health[] = ['verde', 'amarelo', 'vermelho', 'cinza'];
const healthNames: Record<Health, string> = {
  verde: 'No prazo', amarelo: 'Atencao', vermelho: 'Critico', cinza: 'Em espera',
};

export function healthDistribution(projects: ProjectOverview[]): DistributionSlice[] {
  return healthOrder
    .map((h) => ({
      key: h,
      label: healthNames[h],
      value: projects.filter((p) => p.health === h).length,
    }))
    .filter((s) => s.value > 0);
}

export function groupCount(
  projects: ProjectOverview[], pick: (p: ProjectOverview) => string | null,
): DistributionSlice[] {
  const map = new Map<string, number>();
  for (const p of projects) {
    const key = pick(p) ?? 'Nao informado';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value);
}

export interface ProgressBar {
  id: string; code: string; name: string; planned: number; actual: number; health: Health;
}

/** Avanco por projeto ordenado pelo maior desvio negativo - o que exige acao. */
export function progressByProject(projects: ProjectOverview[], limit = 10): ProgressBar[] {
  return [...projects]
    .filter((p) => p.status === 'em_andamento' || p.status === 'planejamento' || p.status === 'concluido')
    .sort((a, b) => (a.progress_actual - a.progress_planned) - (b.progress_actual - b.progress_planned))
    .slice(0, limit)
    .map((p) => ({
      id: p.id, code: p.code, name: p.name,
      planned: Number(p.progress_planned), actual: Number(p.progress_actual), health: p.health,
    }));
}

export interface FinancialByProject {
  id: string; code: string; budget: number; actual: number; committed: number; forecast: number;
}

export function financialByProject(projects: ProjectOverview[], limit = 8): FinancialByProject[] {
  return projects
    .filter((p) => p.financial_effective_enabled)
    .sort((a, b) => Number(b.budget) - Number(a.budget))
    .slice(0, limit)
    .map((p) => ({
      id: p.id, code: p.code,
      budget: Number(p.budget), actual: Number(p.actual),
      committed: Number(p.committed), forecast: Number(p.forecast),
    }));
}

/**
 * Consolida a curva financeira de varios projetos por mes de competencia.
 * `enabledProjectIds`, quando informado, exclui pontos de projetos com o
 * modulo financeiro desligado - sem isso a curva do portfolio incluiria
 * lancamentos de projetos que a governanca decidiu deixar de fora.
 */
export function consolidateCurve(
  points: FinancialCurvePoint[], enabledProjectIds?: Set<string>,
): {
  month: string; planned: number; actual: number; committed: number; forecast: number;
}[] {
  const map = new Map<string, { planned: number; actual: number; committed: number; forecast: number }>();
  for (const p of points) {
    if (enabledProjectIds && !enabledProjectIds.has(p.project_id)) continue;
    const key = p.reference_month;
    const acc = map.get(key) ?? { planned: 0, actual: 0, committed: 0, forecast: 0 };
    acc.planned += Number(p.planned ?? 0);
    acc.actual += Number(p.actual ?? 0);
    acc.committed += Number(p.committed ?? 0);
    acc.forecast += Number(p.forecast ?? 0);
    map.set(key, acc);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}

export interface AreaCapacity {
  areaId: string | null;
  area: string;
  businessUnit: string | null;
  collaborators: number;
  capacity: number;
  allocated: number;
  available: number;
  pct: number;
  overloadedCollaborators: number;
  status: 'ok' | 'warn' | 'danger';
}

/**
 * Capacidade por Area no mes de referencia: soma capacidade e horas alocadas
 * de todos os colaboradores da area, so' depois divide. Nunca faz media dos
 * percentuais individuais: utilizacao = soma(alocado) / soma(capacidade) x 100.
 */
export function areaCapacity(rows: ResourceCapacity[], referenceMonth: string): AreaCapacity[] {
  const map = new Map<string, {
    areaId: string | null; area: string; businessUnit: string | null;
    capacity: number; allocated: number; collaborators: Set<string>; overloaded: number;
  }>();
  for (const r of rows) {
    if (r.reference_month !== referenceMonth) continue;
    const key = r.area_id ?? '__sem_area__';
    const acc = map.get(key) ?? {
      areaId: r.area_id, area: r.area_name ?? 'Sem area definida', businessUnit: r.business_unit_name,
      capacity: 0, allocated: 0, collaborators: new Set<string>(), overloaded: 0,
    };
    acc.capacity += Number(r.capacity_hours);
    acc.allocated += Number(r.allocated_hours);
    acc.collaborators.add(r.profile_id);
    if (Number(r.allocation_pct) > 100) acc.overloaded += 1;
    map.set(key, acc);
  }
  return [...map.values()]
    .map((v) => {
      const pct = v.capacity === 0 ? 0 : round((v.allocated / v.capacity) * 100);
      return {
        areaId: v.areaId,
        area: v.area,
        businessUnit: v.businessUnit,
        collaborators: v.collaborators.size,
        capacity: round(v.capacity, 0),
        allocated: round(v.allocated, 0),
        available: round(Math.max(0, v.capacity - v.allocated), 0),
        pct,
        overloadedCollaborators: v.overloaded,
        status: pct > 100 ? 'danger' as const : pct > 85 ? 'warn' as const : 'ok' as const,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}
