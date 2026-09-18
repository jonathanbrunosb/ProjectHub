import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  listIndicators: vi.fn(async (): Promise<import('@/types/domain').Indicator[]> => []),
  listMeasurements: vi.fn(async (): Promise<import('@/types/domain').IndicatorMeasurement[]> => []),
  upsertIndicator: vi.fn(async () => undefined),
  listEvmSnapshots: vi.fn(async (): Promise<import('@/types/domain').EvmSnapshot[]> => [
    { id: 'evm-1', project_id: 'project-1', reference_date: '2026-08-01', pv: 100000, ev: 90000, ac: 95000, spi: 0.9, cpi: 0.9474 },
  ]),
  upsertEvmSnapshot: vi.fn(async () => undefined),
  deleteEvmSnapshot: vi.fn(async () => undefined),
}));

vi.mock('@/services/governance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/governance')>();
  return {
    ...actual,
    listIndicators: mocks.listIndicators,
    listMeasurements: mocks.listMeasurements,
    upsertIndicator: mocks.upsertIndicator,
    listEvmSnapshots: mocks.listEvmSnapshots,
    upsertEvmSnapshot: mocks.upsertEvmSnapshot,
    deleteEvmSnapshot: mocks.deleteEvmSnapshot,
  };
});

const { IndicatorsTab } = await import('../GovernanceTabs');

describe('IndicatorsTab - Earned Value Management', () => {
  it('nao exibe o painel de EVM quando o projeto nao tem EVM habilitado', async () => {
    renderWithProviders(<IndicatorsTab projectId="project-1" canEdit evmEnabled={false} />);
    await screen.findByText(/Nenhum indicador cadastrado/i);
    expect(screen.queryByText('Earned Value Management')).not.toBeInTheDocument();
  });

  it('exibe PV/EV/AC/SPI/CPI do ultimo snapshot e a tabela de historico', async () => {
    renderWithProviders(<IndicatorsTab projectId="project-1" canEdit evmEnabled />);

    expect(await screen.findByText('Earned Value Management')).toBeInTheDocument();
    expect((await screen.findAllByText('0,9')).length).toBeGreaterThan(0); // SPI (0.9, sem zero a direita no formatNumber)
    expect((await screen.findAllByText('0,95')).length).toBeGreaterThan(0); // CPI arredondado (0.9474 -> 0.95)
  });

  it('cria um novo snapshot de EVM com os valores informados', async () => {
    renderWithProviders(<IndicatorsTab projectId="project-1" canEdit evmEnabled />);
    await screen.findByText('Earned Value Management');

    await userEvent.click(screen.getByRole('button', { name: /Novo snapshot/i }));
    const dialog = await screen.findByRole('dialog', { name: /Novo snapshot de EVM/i });

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;
    const numberInputs = within(dialog).getAllByRole('spinbutton');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-09-01');
    await userEvent.type(numberInputs[0], '120000');
    await userEvent.type(numberInputs[1], '110000');
    await userEvent.type(numberInputs[2], '105000');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.upsertEvmSnapshot).toHaveBeenCalledWith({
      project_id: 'project-1', reference_date: '2026-09-01', pv: 120000, ev: 110000, ac: 105000,
    }));
  });

  it('ao editar um snapshot existente, a data de referencia fica bloqueada', async () => {
    renderWithProviders(<IndicatorsTab projectId="project-1" canEdit evmEnabled />);
    await screen.findByText('Earned Value Management');

    await userEvent.click(await screen.findByText('01/08/2026'));
    const dialog = await screen.findByRole('dialog', { name: /Editar snapshot de EVM/i });
    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeDisabled();
    expect(dateInput).toHaveValue('2026-08-01');
  });
});
