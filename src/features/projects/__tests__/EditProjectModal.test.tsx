import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { Project } from '@/types/domain';

/**
 * Cobre a governanca de edicao cadastral do projeto: Sponsor, Owner, Empresa
 * e Area responsavel ficam somente leitura sem a capability dedicada
 * (project.change_sponsor/change_owner/change_organizational_scope), viram
 * editaveis com ela, e a troca de Owner exige confirmacao antes de salvar -
 * sem transferir tarefas/alocacoes automaticamente.
 */
let currentCan: (capability: string) => boolean = () => false;
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can: (c: string) => currentCan(c) }),
}));

const profiles = [
  { id: 'sponsor-1', full_name: 'Sponsor Atual', email: 'sponsor@empresa.com.br', active: true },
  { id: 'owner-1', full_name: 'Owner Atual', email: 'owner@empresa.com.br', active: true },
  { id: 'owner-2', full_name: 'Novo Owner', email: 'novo@empresa.com.br', active: true },
];
const companies = [{ id: 'co-1', code: 'HOLD', name: 'Holding Corporativa', cnpj: null, active: true }];
const areas = [{
  id: 'area-1', business_unit_id: 'bu-1', code: 'CTG', name: 'Contabilidade Geral', is_active: true,
  business_unit: { id: 'bu-1', name: 'Contabilidade Corporativa', code: 'CTB' }, manager: null,
}];

const listProfiles = vi.fn(async () => profiles);
const listAllCompanies = vi.fn(async () => companies);
const updateProject = vi.fn(async (_id: string, _patch: unknown, _expectedUpdatedAt?: string) => {});
class ProjectConflictError extends Error {}

vi.mock('@/services/projects', () => ({
  listProfiles: (...a: []) => listProfiles(...a),
  listAllCompanies: (...a: []) => listAllCompanies(...a),
  updateProject: (...a: [string, unknown, string?]) => updateProject(...a),
  ProjectConflictError,
}));

const listAreas = vi.fn(async () => areas);
vi.mock('@/services/areas', () => ({ listAreas: (...a: []) => listAreas(...a) }));

vi.mock('@/services/systemSettings', () => ({
  getSystemSettings: vi.fn(async () => ({ financial_module_enabled: true })),
}));

const { EditProjectModal } = await import('../ProjectPage');

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', code: 'CTB-001', name: 'Projeto Teste', portfolio_id: null, template_id: null,
    schedule_baseline_version: 0, schedule_baseline_frozen_at: null, schedule_baseline_frozen_by: null,
    category: 'Regulatorio', objective: null, scope: null, expected_results: null,
    executive_summary: null, executive_summary_updated_at: null,
    sponsor_id: 'sponsor-1', owner_id: 'owner-1', area_id: 'area-1', company_id: 'co-1',
    priority: 'media', status: 'em_andamento', phase: null,
    health: 'verde', health_is_manual: false, health_override_reason: null, health_overridden_at: null,
    progress_method: 'automatico', progress_planned: 0, progress_actual: 0,
    start_date: '2026-01-01', target_date: '2026-06-01',
    baseline_start_date: '2026-01-01', baseline_target_date: '2026-06-01',
    actual_end_date: null, evm_enabled: false, financial_module_mode: 'inherit',
    archived_at: null, updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  listProfiles.mockClear();
  listAllCompanies.mockClear();
  listAreas.mockClear();
  updateProject.mockClear().mockResolvedValue(undefined);
});

describe('EditProjectModal - governanca de Sponsor/Owner/Empresa/Area', () => {
  it('sem as capabilities de governanca, os campos ficam somente leitura com o valor atual', async () => {
    currentCan = () => false;
    renderWithProviders(<EditProjectModal open onClose={() => {}} project={baseProject()} />);

    expect(await screen.findByDisplayValue('Sponsor Atual')).toHaveAttribute('readonly');
    expect(await screen.findByDisplayValue('Owner Atual')).toHaveAttribute('readonly');
    expect(await screen.findByDisplayValue('Holding Corporativa')).toHaveAttribute('readonly');
    expect(await screen.findByDisplayValue('Contabilidade Geral')).toHaveAttribute('readonly');
  });

  it('com as capabilities, os campos viram selects editaveis', async () => {
    currentCan = (c) => [
      'project.change_sponsor', 'project.change_owner', 'project.change_organizational_scope',
    ].includes(c);
    renderWithProviders(<EditProjectModal open onClose={() => {}} project={baseProject()} />);

    // So' aparece como <option> quando o select carregou os dados (nao esta desabilitado).
    await within(screen.getByLabelText('Owner')).findByRole('option', { name: 'Novo Owner' });
    expect(screen.getByLabelText('Sponsor').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Sponsor')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Owner').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Empresa').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Area responsavel').tagName).toBe('SELECT');
  });

  it('sem project.change_owner, trocar apenas o Sponsor salva direto sem pedir confirmacao', async () => {
    currentCan = (c) => c === 'project.change_sponsor';
    renderWithProviders(<EditProjectModal open onClose={() => {}} project={baseProject()} />);

    await screen.findByRole('option', { name: 'Novo Owner' });
    await userEvent.selectOptions(screen.getByLabelText('Sponsor'), 'owner-2');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(screen.queryByText(/trocar o responsavel pelo projeto/i)).toBeNull();
    const [, patch] = updateProject.mock.calls[0];
    expect(patch).toMatchObject({ sponsor_id: 'owner-2' });
    expect(patch).not.toHaveProperty('owner_id');
  });

  it('trocar o Owner exige confirmacao antes de salvar, e nao transfere tarefas automaticamente', async () => {
    currentCan = (c) => c === 'project.change_owner';
    renderWithProviders(<EditProjectModal open onClose={() => {}} project={baseProject()} />);

    await screen.findByRole('option', { name: 'Novo Owner' });
    await userEvent.selectOptions(screen.getByLabelText('Owner'), 'owner-2');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/trocar o responsavel pelo projeto/i)).toBeInTheDocument();
    expect(screen.getByText(/serao preservadas/i)).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^continuar$/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const [projectId, patch, expectedUpdatedAt] = updateProject.mock.calls[0];
    expect(projectId).toBe('proj-1');
    expect(patch).toMatchObject({ owner_id: 'owner-2' });
    // Concorrencia otimista: passa o updated_at capturado na abertura do form.
    expect(expectedUpdatedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('conflito de concorrencia oferece recarregar em vez de sobrescrever', async () => {
    currentCan = () => true;
    updateProject.mockRejectedValueOnce(new ProjectConflictError('conflict'));
    const onClose = vi.fn();
    renderWithProviders(<EditProjectModal open onClose={onClose} project={baseProject()} />);

    await userEvent.click(await screen.findByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/o projeto foi alterado/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /recarregar e fechar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
