import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';

/**
 * Cobre o CRUD de Gerencia e Area em Configuracoes (item 3/4/5 do prompt de
 * Areas): criar, editar, ativar/inativar e visualizar vinculos - sem tocar
 * banco de verdade.
 */
vi.mock('@/components/layout/AppShell', () => ({ useBreadcrumbs: vi.fn() }));

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    can: () => true,
    profile: { id: 'admin-1', role: 'admin', area_id: 'area-1', full_name: 'Admin Um', email: 'admin@empresa.com.br' },
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('@/services/views', () => ({
  listSavedViews: vi.fn(async () => []),
  getColumnPreference: vi.fn(async () => null),
  saveColumnPreference: vi.fn(async () => {}),
  createSavedView: vi.fn(),
  updateSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}));

const businessUnits = [
  { id: 'bu-1', company_id: 'co-1', code: 'CTB', name: 'Contabilidade Corporativa', active: true },
  { id: 'bu-2', company_id: 'co-1', code: 'FIS', name: 'Fiscal e Tributario', active: false },
];

const areas = [
  {
    id: 'area-1', business_unit_id: 'bu-1', code: 'CTG', name: 'Contabilidade Geral',
    description: null, manager_user_id: 'admin-1', is_active: true,
    created_at: '2026-01-01T00:00:00Z', created_by: 'admin-1', updated_at: '2026-01-01T00:00:00Z', updated_by: null,
    business_unit: { id: 'bu-1', name: 'Contabilidade Corporativa', code: 'CTB' },
    manager: { id: 'admin-1', full_name: 'Admin Um' },
  },
];

const profiles = [
  { id: 'admin-1', full_name: 'Admin Um', email: 'admin@empresa.com.br', area_id: 'area-1', active: true },
  { id: 'user-2', full_name: 'Colaborador Dois', email: 'colab@empresa.com.br', area_id: null, active: true },
];

const companies = [
  { id: 'co-1', code: 'HOLD', name: 'Holding Corporativa', cnpj: '12345678000190', active: true },
  { id: 'co-2', code: 'LEG', name: 'Empresa Legada', cnpj: null, active: false },
];

const listBusinessUnits = vi.fn(async () => businessUnits);
const createBusinessUnit = vi.fn(async (_input: unknown) => 'bu-new');
const updateBusinessUnit = vi.fn(async (_id: string, _patch: unknown) => {});
const setBusinessUnitActive = vi.fn(async (_id: string, _active: boolean) => {});
const listAreas = vi.fn(async () => areas);
const createArea = vi.fn(async (_input: unknown) => 'area-new');
const updateArea = vi.fn(async (_id: string, _patch: unknown) => {});
const setAreaActive = vi.fn(async (_id: string, _active: boolean) => {});
const assignPrimaryArea = vi.fn(async (_userId: string, _areaId: string) => {});
const listAllCompanies = vi.fn(async () => companies);
const createCompany = vi.fn(async (_input: unknown) => 'co-new');
const updateCompany = vi.fn(async (_id: string, _patch: unknown) => {});
const setCompanyActive = vi.fn(async (_id: string, _active: boolean) => {});

vi.mock('@/services/areas', () => ({
  listBusinessUnits: (...a: []) => listBusinessUnits(...a),
  createBusinessUnit: (...a: [unknown]) => createBusinessUnit(...a),
  updateBusinessUnit: (...a: [string, unknown]) => updateBusinessUnit(...a),
  setBusinessUnitActive: (...a: [string, boolean]) => setBusinessUnitActive(...a),
  listAreas: (...a: []) => listAreas(...a),
  createArea: (...a: [unknown]) => createArea(...a),
  updateArea: (...a: [string, unknown]) => updateArea(...a),
  setAreaActive: (...a: [string, boolean]) => setAreaActive(...a),
  assignPrimaryArea: (...a: [string, string]) => assignPrimaryArea(...a),
}));

vi.mock('@/services/projects', () => ({
  listProfiles: vi.fn(async () => profiles),
  listActiveProfiles: vi.fn(async () => profiles),
  listCompanies: vi.fn(async () => companies.filter((company) => company.active)),
  listAllCompanies: (...a: []) => listAllCompanies(...a),
  createCompany: (...a: [unknown]) => createCompany(...a),
  updateCompany: (...a: [string, unknown]) => updateCompany(...a),
  setCompanyActive: (...a: [string, boolean]) => setCompanyActive(...a),
  listTemplates: vi.fn(async () => []),
}));

vi.mock('@/services/customFields', () => ({
  listAllDefinitions: vi.fn(async () => []),
  upsertDefinition: vi.fn(), deleteDefinition: vi.fn(), replaceOptions: vi.fn(),
}));
vi.mock('@/services/governance', () => ({ refreshAllHealth: vi.fn() }));
vi.mock('@/services/adminUsers', () => ({ createUser: vi.fn(), resetUserPassword: vi.fn(), deleteUser: vi.fn() }));

const { SettingsPage } = await import('../SettingsPage');

function renderGerencias() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/gerencias']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function renderEmpresas() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/empresas']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function renderAreas() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/areas']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function renderPerfil() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/perfil']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listBusinessUnits.mockClear().mockImplementation(async () => businessUnits);
  createBusinessUnit.mockClear();
  updateBusinessUnit.mockClear();
  setBusinessUnitActive.mockClear();
  listAreas.mockClear().mockImplementation(async () => areas);
  createArea.mockClear();
  updateArea.mockClear();
  setAreaActive.mockClear();
  assignPrimaryArea.mockClear();
  listAllCompanies.mockClear().mockImplementation(async () => companies);
  createCompany.mockClear();
  updateCompany.mockClear();
  setCompanyActive.mockClear();
});

describe('aba Empresas', () => {
  it('lista empresas ativas e inativas com CNPJ formatado', async () => {
    renderEmpresas();
    expect(await screen.findByText('Holding Corporativa')).toBeInTheDocument();
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();
    const linhaInativa = screen.getByText('Empresa Legada').closest('tr')!;
    expect(within(linhaInativa).getByText(/inativa/i)).toBeInTheDocument();
  });

  it('cria uma nova empresa', async () => {
    renderEmpresas();
    await userEvent.click(await screen.findByRole('button', { name: /nova empresa/i }));
    await userEvent.type(screen.getByLabelText(/codigo/i), 'eqtl');
    await userEvent.type(screen.getByLabelText(/cnpj/i), '12345678000190');
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Equatorial Energia');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createCompany).toHaveBeenCalledWith({
      code: 'EQTL', name: 'Equatorial Energia', cnpj: '12345678000190',
    }));
  });

  it('pede confirmacao antes de inativar uma empresa', async () => {
    renderEmpresas();
    const botao = await screen.findByRole('button', { name: /^inativar$/i });
    await userEvent.click(botao);
    expect(await screen.findByText(/vinculos existentes/i)).toBeInTheDocument();
    expect(setCompanyActive).not.toHaveBeenCalled();
  });
});

describe('aba Gerencias', () => {
  it('lista as gerencias cadastradas com situacao', async () => {
    renderGerencias();
    expect(await screen.findByText('Contabilidade Corporativa')).toBeInTheDocument();
    const linhaFiscal = screen.getByText('Fiscal e Tributario').closest('tr')!;
    expect(within(linhaFiscal).getByText(/inativa/i)).toBeInTheDocument();
  });

  it('cria uma nova gerencia', async () => {
    renderGerencias();
    await userEvent.click(await screen.findByRole('button', { name: /nova gerencia/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/empresa/i), 'co-1');
    await userEvent.type(screen.getByLabelText(/codigo/i), 'ctr');
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Controladoria');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createBusinessUnit).toHaveBeenCalledWith({
      company_id: 'co-1', code: 'CTR', name: 'Controladoria',
    }));
  });

  it('pede confirmacao antes de inativar uma gerencia', async () => {
    renderGerencias();
    const botao = await screen.findByRole('button', { name: /inativar/i });
    await userEvent.click(botao);
    expect(await screen.findByText(/deixa de aparecer como opcao/i)).toBeInTheDocument();
    expect(setBusinessUnitActive).not.toHaveBeenCalled();
  });
});

describe('aba Areas', () => {
  it('lista as areas com gerencia, gestor e colaboradores vinculados', async () => {
    renderAreas();
    expect(await screen.findByText('Contabilidade Geral')).toBeInTheDocument();
    const linha = screen.getByText('Contabilidade Geral').closest('tr')!;
    expect(within(linha).getByText('Contabilidade Corporativa')).toBeInTheDocument();
    expect(within(linha).getByText('Admin Um')).toBeInTheDocument();
    // 1 colaborador ativo (admin-1) vinculado a area-1
    expect(within(linha).getByText('1')).toBeInTheDocument();
  });

  it('cria uma nova area vinculada a uma gerencia', async () => {
    renderAreas();
    await userEvent.click(await screen.findByRole('button', { name: /nova area/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/^gerencia$/i), 'bu-1');
    await userEvent.type(screen.getByLabelText(/codigo/i), 'ctb-reg');
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Contabilidade Regulatoria');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createArea).toHaveBeenCalledWith({
      business_unit_id: 'bu-1', code: 'CTB-REG', name: 'Contabilidade Regulatoria',
      description: null, manager_user_id: null, max_allocation_pct: 100,
    }));
  });

  it('a gerencia inativa nao aparece como opcao para nova area', async () => {
    renderAreas();
    await userEvent.click(await screen.findByRole('button', { name: /nova area/i }));
    const select = await screen.findByLabelText(/^gerencia$/i);
    expect(within(select).queryByText('Fiscal e Tributario')).toBeNull();
  });

  it('mostra os vinculos (colaboradores) da area', async () => {
    renderAreas();
    await userEvent.click(await screen.findByRole('button', { name: /vinculos/i }));
    const modal = await screen.findByRole('dialog', { name: /vinculos de contabilidade geral/i });
    expect(within(modal).getByText('Admin Um')).toBeInTheDocument();
  });

  it('inativar area nao remove colaboradores ja vinculados - so bloqueia novos vinculos', async () => {
    renderAreas();
    const botao = await screen.findByRole('button', { name: /^inativar$/i });
    await userEvent.click(botao);
    expect(await screen.findByText(/continuam vinculados/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^inativar$/i })[1]);
    await waitFor(() => expect(setAreaActive).toHaveBeenCalledWith('area-1', false));
  });
});

describe('aba Meu perfil - Area (item 6, visualizacao)', () => {
  it('mostra a area vinculada do proprio usuario, somente leitura', async () => {
    renderPerfil();
    expect(await screen.findByText('Area organizacional')).toBeInTheDocument();
    expect(await screen.findByText('Contabilidade Geral')).toBeInTheDocument();
    expect(screen.getByText(/alterada apenas por quem gerencia usuarios/i)).toBeInTheDocument();
  });
});
