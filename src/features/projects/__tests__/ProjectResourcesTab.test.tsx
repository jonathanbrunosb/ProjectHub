import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  createMember: vi.fn(async () => undefined),
  updateMember: vi.fn(async () => undefined),
  upsertAllocation: vi.fn(async () => undefined),
  cancelAllocation: vi.fn(async () => undefined),
  capacity: vi.fn(async () => ({
    capacity_hours: 160, current_hours: 120, requested_hours: 80,
    total_hours: 200, total_pct: 125, limit_pct: 100, overloaded: true,
  })),
}));

vi.mock('@/services/projects', () => ({
  createProjectMember: mocks.createMember,
  updateProjectMember: mocks.updateMember,
  listProjectMemberCandidates: vi.fn(async () => [{
    id: 'person-2', full_name: 'Bruno Souza', email: 'bruno@empresa.com', employee_number: 'M-002',
    job_title: 'Especialista', active: true,
    area: { name: 'Controladoria', business_unit: { name: 'Gerencia Financeira' } },
  }]),
}));

vi.mock('@/services/governance', () => ({
  listAllocations: vi.fn(async () => []),
  upsertAllocation: mocks.upsertAllocation,
  cancelAllocation: mocks.cancelAllocation,
  checkAllocationCapacity: mocks.capacity,
}));

const member = {
  id: 'member-1', project_id: 'project-1', profile_id: 'person-1', project_role: 'collaborator',
  role_label: 'Membro', can_edit: false, start_date: '2026-09-01', end_date: null,
  status: 'ativo' as const, notes: null,
  profile: {
    full_name: 'Ana Ribeiro', email: 'ana@empresa.com', employee_number: 'M-001',
    job_title: 'Analista', active: true, weekly_capacity_hours: 40, area_id: 'area-1',
    area: { name: 'Contabilidade', business_unit: { name: 'Gerencia Contabil' } },
  },
};

const { ProjectResourcesTab } = await import('../ProjectResourcesTab');

describe('ProjectResourcesTab', () => {
  it('mostra as acoes apenas para quem gerencia recursos', () => {
    const { rerender } = renderWithProviders(<ProjectResourcesTab projectId="project-1" members={[]} loading={false} canManage={false} />);
    expect(screen.queryByRole('button', { name: /Adicionar membro/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Adicione colaboradores para definir responsabilidades/i)).toBeInTheDocument();
    rerender(<ProjectResourcesTab projectId="project-1" members={[]} loading={false} canManage />);
    expect(screen.getByRole('button', { name: /Adicionar membro/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar alocacao/i })).toBeDisabled();
  });

  it('busca colaborador existente por matricula e cria o vinculo sem alocacao', async () => {
    renderWithProviders(<ProjectResourcesTab projectId="project-1" members={[]} loading={false} canManage />);
    await userEvent.click(screen.getByRole('button', { name: /Adicionar membro/i }));
    await userEvent.type(screen.getByLabelText(/Buscar por nome, matricula ou e-mail/i), 'M-002');
    await screen.findByRole('option', { name: /Bruno Souza/ });
    await userEvent.selectOptions(await screen.findByLabelText('Colaborador'), 'person-2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.createMember).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', profile_id: 'person-2', role_label: 'Membro', status: 'ativo',
    })));
    expect(mocks.upsertAllocation).not.toHaveBeenCalled();
  });

  it('identifica sobrecarga e exige justificativa antes de salvar', async () => {
    renderWithProviders(<ProjectResourcesTab projectId="project-1" members={[member]} loading={false} canManage />);
    await userEvent.click(screen.getByRole('button', { name: /Registrar alocacao/i }));
    await userEvent.clear(screen.getByLabelText('Horas previstas'));
    await userEvent.type(screen.getByLabelText('Horas previstas'), '80');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Sobrecarga identificada: 125.0%/i)).toBeInTheDocument();
    expect(mocks.upsertAllocation).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Justificativa da sobrecarga/i), 'Aprovada pelo gestor responsavel');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.upsertAllocation).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', profile_id: 'person-1', allocated_hours: 80,
      overload_justification: 'Aprovada pelo gestor responsavel',
    })));
  });
});
