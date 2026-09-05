import { describe, expect, it } from 'vitest';
import {
  consolidateCurve, groupCount, healthDistribution, portfolioKpis,
  progressByProject, teamCapacity,
} from '../selectors';
import type { ProjectOverview, ResourceCapacity } from '@/types/domain';

function project(overrides: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    id: crypto.randomUUID(), code: 'P-001', name: 'Projeto', category: 'Regulatorio',
    status: 'em_andamento', health: 'verde', health_is_manual: false, priority: 'media',
    phase: null, portfolio_id: null, template_id: null, owner_id: null, sponsor_id: null,
    team_id: null, company_id: null, owner_name: 'Rafael', sponsor_name: null,
    team_name: 'Contabilidade', company_name: null, start_date: '2026-01-01',
    target_date: '2026-12-31', actual_end_date: null,
    progress_planned: 50, progress_actual: 50, progress_deviation: 0, days_overdue: 0,
    budget: 100_000, actual: 40_000, committed: 10_000, forecast: 100_000, remaining: 50_000,
    forecast_variance: 0, forecast_variance_pct: 0,
    financial_module_mode: 'inherit', financial_effective_enabled: true,
    goal_indicator_enabled: false, goal_indicator_realized: null, goal_indicator_projected: null,
    goal_deliveries_pending: null,
    critical_risks: 0, open_risks: 0, overdue_tasks: 0, open_tasks: 0, overdue_actions: 0,
    pending_decisions: 0, next_milestone_name: null, next_milestone_date: null,
    last_update_at: '2026-06-01T10:00:00Z', archived_at: null,
    ...overrides,
  };
}

describe('portfolioKpis', () => {
  it('consolida contagens por saude e status', () => {
    const kpis = portfolioKpis([
      project({ health: 'verde' }),
      project({ health: 'amarelo' }),
      project({ health: 'vermelho' }),
      project({ status: 'concluido', health: 'verde' }),
      project({ status: 'em_espera', health: 'cinza' }),
    ]);
    expect(kpis.total).toBe(5);
    expect(kpis.active).toBe(3);
    expect(kpis.completed).toBe(1);
    expect(kpis.onTrack).toBe(2);
    expect(kpis.attention).toBe(1);
    expect(kpis.critical).toBe(1);
    expect(kpis.onHold).toBe(1);
  });

  it('calcula avanco medio apenas sobre projetos ativos', () => {
    // O concluido tem 100% e distorceria a leitura de execucao corrente.
    const kpis = portfolioKpis([
      project({ progress_actual: 40, progress_planned: 60 }),
      project({ progress_actual: 60, progress_planned: 60 }),
      project({ status: 'concluido', progress_actual: 100, progress_planned: 100 }),
    ]);
    expect(kpis.avgProgress).toBe(50);
    expect(kpis.avgPlanned).toBe(60);
    expect(kpis.progressDeviation).toBe(-10);
  });

  it('calcula a variacao de forecast contra o orcamento', () => {
    const kpis = portfolioKpis([
      project({ budget: 100_000, forecast: 120_000 }),
      project({ budget: 100_000, forecast: 100_000 }),
    ]);
    expect(kpis.budget).toBe(200_000);
    expect(kpis.forecast).toBe(220_000);
    expect(kpis.forecastVariance).toBe(20_000);
    expect(kpis.forecastVariancePct).toBe(10);
  });

  it('nao divide por zero quando nao ha orcamento', () => {
    const kpis = portfolioKpis([project({ budget: 0, forecast: 5_000 })]);
    expect(kpis.forecastVariancePct).toBe(0);
  });

  it('devolve zeros para um portfolio vazio', () => {
    const kpis = portfolioKpis([]);
    expect(kpis.total).toBe(0);
    expect(kpis.avgProgress).toBe(0);
    expect(kpis.lastUpdateAt).toBeNull();
  });

  it('exclui projetos com o modulo financeiro desativado das somas financeiras', () => {
    const kpis = portfolioKpis([
      project({ budget: 100_000, actual: 40_000, forecast: 100_000, financial_effective_enabled: true }),
      project({ budget: 999_999, actual: 999_999, forecast: 999_999, financial_effective_enabled: false }),
    ]);
    expect(kpis.budget).toBe(100_000);
    expect(kpis.actual).toBe(40_000);
    expect(kpis.forecast).toBe(100_000);
    // total/active continuam contando todo mundo - so o financeiro e' filtrado.
    expect(kpis.total).toBe(2);
  });
});

describe('healthDistribution e groupCount', () => {
  it('omite faixas de saude sem projetos', () => {
    const dist = healthDistribution([project({ health: 'verde' }), project({ health: 'verde' })]);
    expect(dist).toEqual([{ key: 'verde', label: 'No prazo', value: 2 }]);
  });

  it('agrupa por chave e ordena pelo maior volume', () => {
    const rows = groupCount(
      [
        project({ category: 'Regulatorio' }),
        project({ category: 'Regulatorio' }),
        project({ category: 'Inovacao' }),
      ],
      (p) => p.category,
    );
    expect(rows[0]).toEqual({ key: 'Regulatorio', label: 'Regulatorio', value: 2 });
  });

  it('agrupa valores nulos como "Nao informado"', () => {
    const rows = groupCount([project({ owner_name: null })], (p) => p.owner_name);
    expect(rows[0].key).toBe('Nao informado');
  });
});

describe('progressByProject', () => {
  it('ordena pelo maior desvio negativo primeiro', () => {
    const rows = progressByProject([
      project({ code: 'A', progress_actual: 90, progress_planned: 90 }),
      project({ code: 'B', progress_actual: 20, progress_planned: 70 }),
      project({ code: 'C', progress_actual: 50, progress_planned: 60 }),
    ]);
    expect(rows.map((r) => r.code)).toEqual(['B', 'C', 'A']);
  });

  it('ignora projetos concluidos e cancelados', () => {
    const rows = progressByProject([
      project({ code: 'A' }),
      project({ code: 'B', status: 'concluido' }),
      project({ code: 'C', status: 'cancelado' }),
    ]);
    expect(rows.map((r) => r.code)).toEqual(['A']);
  });
});

describe('consolidateCurve', () => {
  it('soma varios projetos na mesma competencia e ordena por mes', () => {
    const curve = consolidateCurve([
      { project_id: '1', reference_month: '2026-02-01', planned: 100, actual: 80, committed: 0, forecast: 90 },
      { project_id: '2', reference_month: '2026-02-01', planned: 200, actual: 150, committed: 10, forecast: 210 },
      { project_id: '1', reference_month: '2026-01-01', planned: 50, actual: 50, committed: null, forecast: null },
    ]);
    expect(curve.map((c) => c.month)).toEqual(['2026-01-01', '2026-02-01']);
    expect(curve[1]).toEqual({ month: '2026-02-01', planned: 300, actual: 230, committed: 10, forecast: 300 });
  });

  it('exclui pontos de projetos fora do conjunto de ids habilitados', () => {
    const curve = consolidateCurve(
      [
        { project_id: '1', reference_month: '2026-02-01', planned: 100, actual: 80, committed: 0, forecast: 90 },
        { project_id: '2', reference_month: '2026-02-01', planned: 200, actual: 150, committed: 10, forecast: 210 },
      ],
      new Set(['1']),
    );
    expect(curve).toEqual([{ month: '2026-02-01', planned: 100, actual: 80, committed: 0, forecast: 90 }]);
  });
});

describe('teamCapacity', () => {
  const rows: ResourceCapacity[] = [
    { profile_id: '1', full_name: 'A', team_id: 't1', team_name: 'Contabil', reference_month: '2026-06-01', capacity_hours: 100, allocated_hours: 120, allocation_pct: 120, project_count: 3 },
    { profile_id: '2', full_name: 'B', team_id: 't1', team_name: 'Contabil', reference_month: '2026-06-01', capacity_hours: 100, allocated_hours: 60, allocation_pct: 60, project_count: 1 },
    { profile_id: '3', full_name: 'C', team_id: 't2', team_name: 'Fiscal', reference_month: '2026-06-01', capacity_hours: 100, allocated_hours: 50, allocation_pct: 50, project_count: 1 },
    { profile_id: '1', full_name: 'A', team_id: 't1', team_name: 'Contabil', reference_month: '2026-07-01', capacity_hours: 100, allocated_hours: 300, allocation_pct: 300, project_count: 5 },
  ];

  it('agrega por equipe apenas o mes de referencia', () => {
    const result = teamCapacity(rows, '2026-06-01');
    expect(result).toHaveLength(2);
    const contabil = result.find((r) => r.team === 'Contabil')!;
    expect(contabil.capacity).toBe(200);
    expect(contabil.allocated).toBe(180);
    expect(contabil.pct).toBe(90);
    expect(contabil.overloaded).toBe(false);
  });

  it('marca sobrecarga quando a alocacao supera a capacidade', () => {
    const result = teamCapacity(rows, '2026-07-01');
    expect(result[0].overloaded).toBe(true);
    expect(result[0].pct).toBe(300);
  });
});
