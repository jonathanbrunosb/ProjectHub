import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getColumnPreference: vi.fn(async () => null as unknown),
  saveColumnPreference: vi.fn(async () => undefined),
}));

vi.mock('@/services/views', () => mocks);

const {
  DASHBOARD_WIDGETS, resolveDashboardOrder, getDashboardLayout, saveDashboardLayout, resetDashboardLayout,
} = await import('../dashboardLayout');
const { getColumnPreference, saveColumnPreference } = mocks;

beforeEach(() => {
  getColumnPreference.mockClear();
  saveColumnPreference.mockClear();
});

describe('resolveDashboardOrder', () => {
  it('mantem a ordem salva quando cobre todo o catalogo', () => {
    const order = [...DASHBOARD_WIDGETS].reverse().map((w) => w.id);
    expect(resolveDashboardOrder({ order, hidden: [] })).toEqual(order);
  });

  it('anexa ao final widgets do catalogo ausentes do layout salvo (adicionados depois)', () => {
    const partial = DASHBOARD_WIDGETS.slice(0, 2).map((w) => w.id);
    const resolved = resolveDashboardOrder({ order: partial, hidden: [] });
    expect(resolved.slice(0, 2)).toEqual(partial);
    expect(resolved).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(new Set(resolved)).toEqual(new Set(DASHBOARD_WIDGETS.map((w) => w.id)));
  });

  it('descarta ids de um layout salvo que nao existem mais no catalogo', () => {
    const order = ['widget_removido', ...DASHBOARD_WIDGETS.map((w) => w.id)];
    const resolved = resolveDashboardOrder({ order, hidden: [] });
    expect(resolved).not.toContain('widget_removido');
    expect(resolved).toHaveLength(DASHBOARD_WIDGETS.length);
  });
});

describe('getDashboardLayout', () => {
  it('retorna o layout padrao (tudo visivel, ordem do catalogo) quando nao ha preferencia salva', async () => {
    const layout = await getDashboardLayout('user-1');
    expect(getColumnPreference).toHaveBeenCalledWith('user-1', 'dashboard');
    expect(layout).toEqual({ order: DASHBOARD_WIDGETS.map((w) => w.id), hidden: [] });
  });

  it('deriva os widgets ocultos a partir de visible=false na preferencia salva', async () => {
    getColumnPreference.mockResolvedValueOnce({
      order: ['kpis_execucao', 'kpis_prazos'],
      visible: { kpis_prazos: false, kpis_execucao: true },
    });
    const layout = await getDashboardLayout('user-1');
    expect(layout).toEqual({ order: ['kpis_execucao', 'kpis_prazos'], hidden: ['kpis_prazos'] });
  });
});

describe('saveDashboardLayout', () => {
  it('persiste a ordem e converte ocultos em visible=false', async () => {
    await saveDashboardLayout('user-1', { order: ['a', 'b', 'c'], hidden: ['b'] });
    expect(saveColumnPreference).toHaveBeenCalledWith('user-1', 'dashboard', {
      order: ['a', 'b', 'c'], visible: { b: false },
    });
  });
});

describe('resetDashboardLayout', () => {
  it('limpa a preferencia salva', async () => {
    await resetDashboardLayout('user-1');
    expect(saveColumnPreference).toHaveBeenCalledWith('user-1', 'dashboard', {});
  });
});
