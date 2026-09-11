import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(async () => 'task-new'),
  updateTask: vi.fn(async () => undefined),
  deleteTask: vi.fn(async () => undefined),
  nextTaskCode: vi.fn(async () => 'T003'),
  listTaskCorresponsibles: vi.fn(async (): Promise<import('@/types/domain').TaskCorresponsible[]> => []),
  replaceTaskCorresponsibles: vi.fn(async () => undefined),
}));

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can: () => false }),
}));

vi.mock('@/services/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/tasks')>();
  return {
    ...actual,
    createTask: mocks.createTask,
    updateTask: mocks.updateTask,
    deleteTask: mocks.deleteTask,
    nextTaskCode: mocks.nextTaskCode,
    listTaskCorresponsibles: mocks.listTaskCorresponsibles,
    replaceTaskCorresponsibles: mocks.replaceTaskCorresponsibles,
  };
});

vi.mock('@/services/projects', () => ({
  listProjectMembers: vi.fn(async () => [
    {
      id: 'member-1', project_id: 'project-1', profile_id: 'person-1', project_role: 'collaborator',
      role_label: 'Membro', can_edit: false, start_date: '2026-01-01', end_date: null, status: 'ativo',
      notes: null, profile: { full_name: 'Ana Ribeiro', email: 'ana@empresa.com', employee_number: 'M-001', job_title: 'Analista', active: true, weekly_capacity_hours: 40, area_id: null, area: null },
    },
    {
      id: 'member-2', project_id: 'project-1', profile_id: 'person-2', project_role: 'collaborator',
      role_label: 'Membro', can_edit: false, start_date: '2026-01-01', end_date: null, status: 'ativo',
      notes: null, profile: { full_name: 'Bruno Souza', email: 'bruno@empresa.com', employee_number: 'M-002', job_title: 'Especialista', active: true, weekly_capacity_hours: 40, area_id: null, area: null },
    },
  ]),
}));

vi.mock('@/services/goalIndicators', () => ({
  getProjectGoalSettings: vi.fn(async () => ({ enabled: false, weight_mode: 'igual', day_basis: 'uteis' })),
  listTaskGoalConfigs: vi.fn(async () => []),
  upsertTaskGoalConfig: vi.fn(async () => undefined),
}));

const { TaskModal } = await import('../TaskModal');

const task = {
  id: 'task-1', project_id: 'project-1', phase_id: null, parent_task_id: null,
  code: 'T001', title: 'Validar calculos IFRS 16', description: null,
  assignee_id: 'person-1', priority: 'media' as const, status: 'em_andamento' as const,
  start_date: '2026-10-01', due_date: '2026-10-10',
  baseline_start_date: '2026-10-01', baseline_due_date: '2026-10-10',
  completed_at: null, weight: 1, progress: 0, is_milestone: false, is_critical: false,
  estimated_hours: 40, baseline_estimated_hours: 40, assignee_allocation_percent: null,
  tags: [], position: 0,
  assignee: { full_name: 'Ana Ribeiro', area_id: null, area: null },
  project: { code: 'PRJ1', name: 'Projeto 1' },
};

describe('TaskModal - rateio de responsaveis', () => {
  it('sem co-responsaveis, informa que 100% vai para o responsavel principal e nao exibe percentuais', async () => {
    renderWithProviders(<TaskModal open onClose={() => {}} projectId="project-1" task={task} canEdit />);
    expect(await screen.findByText(/Sem co-responsaveis: 100% das horas planejadas/i)).toBeInTheDocument();
  });

  it('adiciona um co-responsavel e exige rateio completo somando 100%', async () => {
    renderWithProviders(<TaskModal open onClose={() => {}} projectId="project-1" task={task} canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: /Adicionar responsavel/i }));

    const assigneePercent = screen.getByLabelText('Participacao do responsavel principal (%)');
    await userEvent.type(assigneePercent, '70');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Preencha o percentual de todos os responsaveis/i)).toBeInTheDocument();
    expect(mocks.updateTask).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Participacao (%)'), '30');
    expect(await screen.findByText('Total: 100.0%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({
      assignee_allocation_percent: 70,
    })));
    expect(mocks.replaceTaskCorresponsibles).toHaveBeenCalledWith('task-1', [
      expect.objectContaining({ profile_id: 'person-2', allocation_percent: 30 }),
    ]);
  });

  it('carrega co-responsaveis e percentuais ja salvos', async () => {
    mocks.listTaskCorresponsibles.mockResolvedValueOnce([
      { id: 'tc-1', task_id: 'task-1', profile_id: 'person-2', allocation_percent: 25, profile: { full_name: 'Bruno Souza' } },
    ]);
    renderWithProviders(<TaskModal open onClose={() => {}} projectId="project-1" task={{ ...task, assignee_allocation_percent: 75 }} canEdit />);
    expect(await screen.findByDisplayValue('75')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('25')).toBeInTheDocument();
  });
});
