import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { currentMonthKey } from '@/features/dashboard/selectors';

/**
 * Cobre a tab "Por area" de Recursos & Capacidade (item 10/11/12/13 do
 * prompt de Areas): soma capacidade e horas antes de dividir - sem formula
 * divergente, sem dupla contagem. Equipe foi eliminada do modelo: Area e' a
 * unica unidade organizacional de agrupamento.
 */
vi.mock('@/components/layout/AppShell', () => ({ useBreadcrumbs: vi.fn() }));

const month = currentMonthKey();

const capacity = [
  { profile_id: 'p1', full_name: 'Ana Ribeiro', reference_month: month, capacity_hours: 100, allocated_hours: 120, allocation_pct: 120, project_count: 2, area_id: 'a1', area_name: 'Contabilidade Geral', business_unit_id: 'bu1', business_unit_name: 'Contabilidade Corporativa' },
  { profile_id: 'p2', full_name: 'Carlos Menezes', reference_month: month, capacity_hours: 100, allocated_hours: 60, allocation_pct: 60, project_count: 1, area_id: 'a1', area_name: 'Contabilidade Geral', business_unit_id: 'bu1', business_unit_name: 'Contabilidade Corporativa' },
  { profile_id: 'p3', full_name: 'Helena Duarte', reference_month: month, capacity_hours: 100, allocated_hours: 50, allocation_pct: 50, project_count: 1, area_id: 'a2', area_name: 'Fiscal e Tributario', business_unit_id: 'bu2', business_unit_name: 'Fiscal Corporativo' },
];

const allocations = [
  { id: 'al1', project_id: 'pr1', profile_id: 'p1', role_label: 'Analista', period_start: `${month.slice(0, 7)}-01`, period_end: `${month.slice(0, 7)}-28`, allocated_hours: 80, allocation_pct: 80, profile: { full_name: 'Ana Ribeiro' }, project: { code: 'PRJ-1', name: 'Fechamento Anual' } },
  { id: 'al2', project_id: 'pr2', profile_id: 'p1', role_label: 'Analista', period_start: `${month.slice(0, 7)}-01`, period_end: `${month.slice(0, 7)}-28`, allocated_hours: 40, allocation_pct: 40, profile: { full_name: 'Ana Ribeiro' }, project: { code: 'PRJ-2', name: 'Migracao ECD' } },
];

const areas = [
  { id: 'a1', business_unit_id: 'bu1', code: 'CTG', name: 'Contabilidade Geral', is_active: true, max_allocation_pct: 100, manager: { id: 'p1', full_name: 'Ana Ribeiro' } },
  { id: 'a2', business_unit_id: 'bu2', code: 'FIS', name: 'Fiscal e Tributario', is_active: true, max_allocation_pct: 100, manager: { id: 'p3', full_name: 'Helena Duarte' } },
];

const profiles = [
  { id: 'p1', full_name: 'Ana Ribeiro', area_id: 'a1', active: true },
  { id: 'p2', full_name: 'Carlos Menezes', area_id: 'a1', active: true },
  { id: 'p3', full_name: 'Helena Duarte', area_id: 'a2', active: true },
];

vi.mock('@/services/governance', () => ({
  listCapacity: vi.fn(async () => capacity),
  listAllocations: vi.fn(async () => allocations),
}));

vi.mock('@/services/projects', () => ({
  listProfiles: vi.fn(async () => profiles),
}));

vi.mock('@/services/areas', () => ({
  listAreas: vi.fn(async () => areas),
}));

const { ResourcesPage } = await import('../ResourcesPage');

function render() {
  return renderWithProviders(<ResourcesPage />);
}

beforeEach(() => {});

/**
 * O filtro de area no cabecalho da pagina lista os mesmos nomes que aparecem
 * na tabela "Por area" - escopar a busca a tabela evita ambiguidade entre a
 * <option> do filtro e a celula correspondente.
 */
async function rowInTable(text: string) {
  const table = await screen.findByRole('table');
  return within(table).getByText(text).closest('tr')!;
}

describe('Recursos & Capacidade - tab Por area', () => {
  it('nao existe mais tab "Por equipe" - Area e a unica unidade de agrupamento', async () => {
    render();
    const abas = await screen.findAllByRole('tab');
    const labels = abas.map((a) => a.textContent);
    expect(labels).not.toContain('Por equipe');
    expect(labels).toContain('Por area');
  });

  it('agrega por area somando capacidade e horas (nao a media dos percentuais)', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Por area' }));

    const linha = await rowInTable('Contabilidade Geral');
    // (120+60) capacidade=200, alocado=180 -> 90%, nao a media de 120% e 60% (que tambem daria 90 -
    // a distincao real ja esta coberta no teste unitario de areaCapacity; aqui valida a integracao).
    expect(within(linha).getByText('90%')).toBeInTheDocument();
    expect(within(linha).getByText('Contabilidade Corporativa')).toBeInTheDocument();
    expect(within(linha).getByText('Ana Ribeiro')).toBeInTheDocument(); // gestor
    const outraLinha = await rowInTable('Fiscal e Tributario');
    expect(within(outraLinha).getByText('Fiscal Corporativo')).toBeInTheDocument(); // outra area, outra linha
  });

  it('mostra o badge de sobrecarga e a contagem de colaboradores sobrecarregados', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Por area' }));
    const linha = await rowInTable('Contabilidade Geral');
    expect(within(linha).getByText(/1 sobrecarregado/)).toBeInTheDocument();
  });

  it('filtra por gerencia', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Por area' }));
    await rowInTable('Contabilidade Geral');
    await userEvent.selectOptions(screen.getByLabelText(/filtrar por gerencia/i), 'Fiscal Corporativo');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Contabilidade Geral')).toBeNull();
    expect(within(table).getByText('Fiscal e Tributario')).toBeInTheDocument();
  });

  it('filtra por status de capacidade (atencao/sobrecarga)', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Por area' }));
    await rowInTable('Contabilidade Geral');
    // 200h de capacidade / 180h alocadas = 90% -> Atencao (>85%, nao ultrapassa 100%).
    await userEvent.selectOptions(screen.getByLabelText(/filtrar por status/i), 'warn');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Contabilidade Geral')).toBeInTheDocument();
    expect(within(table).queryByText('Fiscal e Tributario')).toBeNull();
  });

  it('drill-down mostra os colaboradores da area e as alocacoes por projeto que compoem a utilizacao', async () => {
    render();
    await userEvent.click(screen.getByRole('tab', { name: 'Por area' }));
    const linha = await rowInTable('Contabilidade Geral');
    await userEvent.click(within(linha).getByRole('button', { name: /ver colaboradores/i }));

    const modal = await screen.findByRole('dialog', { name: /colaboradores de contabilidade geral/i });
    expect(within(modal).getByText('Ana Ribeiro')).toBeInTheDocument();
    expect(within(modal).getByText('Carlos Menezes')).toBeInTheDocument();
    expect(within(modal).getByText('PRJ-1')).toBeInTheDocument();
    expect(within(modal).getByText('PRJ-2')).toBeInTheDocument();
  });
});
