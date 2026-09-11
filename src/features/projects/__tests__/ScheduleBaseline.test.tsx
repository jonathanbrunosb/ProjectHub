import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

/**
 * Baseline do cronograma na aba Plano & Cronograma.
 *
 * A regra de quem pode congelar vive no banco (02_business_rules.sql cobre
 * permissao, versionamento, justificativa e as guardas). Aqui o que importa e'
 * a sinalizacao: o estado da baseline precisa ficar visivel, e a acao so'
 * aparece para quem administra o portfolio.
 */
let currentCan: (capability: string) => boolean = () => false;
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can: (c: string) => currentCan(c) }),
}));

let baselineVersion = 0;
const freezeScheduleBaseline = vi.fn(async (_projectId: string) => 2);
const rebaselineSchedule = vi.fn(async (_projectId: string, _reason: string) => 2);

vi.mock('@/services/projects', () => ({
  getProject: vi.fn(async () => ({
    id: 'proj-1',
    schedule_baseline_version: baselineVersion,
    schedule_baseline_frozen_at: baselineVersion > 0 ? '2026-09-11T13:00:00Z' : null,
    schedule_baseline_frozen_by: baselineVersion > 0 ? 'user-1' : null,
  })),
  freezeScheduleBaseline: (...a: [string]) => freezeScheduleBaseline(...a),
  rebaselineSchedule: (...a: [string, string]) => rebaselineSchedule(...a),
}));

vi.mock('@/services/tasks', () => ({
  listTasks: vi.fn(async () => [{
    id: 't1', code: 'T001', title: 'Tarefa', status: 'nao_iniciada',
    start_date: '2026-10-05', due_date: '2026-10-15',
    baseline_start_date: null, baseline_due_date: null,
    progress: 0, is_milestone: false, is_critical: false,
  }]),
  listMilestones: vi.fn(async () => []),
}));

async function renderTab() {
  const { ScheduleTab } = await import('../ProjectPage');
  renderWithProviders(<ScheduleTab projectId="proj-1" />);
  await waitFor(() => expect(screen.getByText(/T001/)).toBeInTheDocument());
}

describe('Baseline do cronograma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baselineVersion = 0;
    currentCan = () => false;
  });

  it('sinaliza cronograma sem baseline', async () => {
    await renderTab();
    expect(screen.getByText('Sem baseline')).toBeInTheDocument();
  });

  it('mostra a versao vigente quando ja congelada', async () => {
    baselineVersion = 2;
    await renderTab();
    expect(screen.getByText('Baseline v2')).toBeInTheDocument();
  });

  it('nao oferece a acao a quem nao administra o portfolio', async () => {
    await renderTab();
    expect(screen.queryByRole('button', { name: /congelar/i })).not.toBeInTheDocument();
  });

  it('permite ao PMO congelar a baseline', async () => {
    currentCan = (c) => c === 'portfolio.manage';
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: /congelar baseline/i }));
    await waitFor(() => expect(freezeScheduleBaseline).toHaveBeenCalledWith('proj-1'));
  });

  it('exige justificativa para replanejar', async () => {
    baselineVersion = 2;
    currentCan = (c) => c === 'portfolio.manage';
    await renderTab();

    await userEvent.click(screen.getByRole('button', { name: /replanejar/i }));
    const botoes = screen.getAllByRole('button', { name: /replanejar/i });
    const confirmar = botoes[botoes.length - 1];
    expect(confirmar).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'Mudanca de escopo aprovada');
    await waitFor(() => expect(confirmar).toBeEnabled());

    await userEvent.click(confirmar);
    await waitFor(() => expect(rebaselineSchedule)
      .toHaveBeenCalledWith('proj-1', 'Mudanca de escopo aprovada'));
  });
});
