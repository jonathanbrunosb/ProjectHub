import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { TaskWithContext } from '@/services/tasks';

/**
 * Cobre a exclusao em massa de "Tarefas & Entregas": some sem a capability
 * tasks.bulk_delete (Owner/Collaborator continuam so' com exclusao individual
 * via TaskModal), aparece com ela, exige digitar a quantidade antes de
 * confirmar, e clicar no checkbox nao abre o modal de edicao da linha.
 */
let currentCan: (capability: string) => boolean = () => false;
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can: (c: string) => currentCan(c) }),
}));

const mocks = vi.hoisted(() => ({
  bulkDeleteTasks: vi.fn(async () => undefined),
  listDependencies: vi.fn(async () => []),
}));

vi.mock('@/services/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/tasks')>();
  return { ...actual, bulkDeleteTasks: mocks.bulkDeleteTasks, listDependencies: mocks.listDependencies };
});

const { TaskList } = await import('../TaskList');

function task(overrides: Partial<TaskWithContext>): TaskWithContext {
  return {
    id: 't1', project_id: 'project-1', phase_id: null, parent_task_id: null,
    code: 'T001', title: 'Validar calculos IFRS 16', description: null,
    assignee_id: null, priority: 'media', status: 'nao_iniciada',
    start_date: null, due_date: null, baseline_start_date: null, baseline_due_date: null,
    completed_at: null, weight: 1, progress: 0, is_milestone: false, is_critical: false,
    estimated_hours: null, baseline_estimated_hours: null, assignee_allocation_percent: null,
    tags: [], position: 0,
    assignee: null, project: { code: 'PRJ1', name: 'Projeto 1' },
    ...overrides,
  };
}

const tasks: TaskWithContext[] = [
  task({ id: 't1', code: 'T001', title: 'Validar calculos IFRS 16' }),
  task({ id: 't2', code: 'T002', title: 'Levantar contratos' }),
];

beforeEach(() => {
  mocks.bulkDeleteTasks.mockClear();
});

describe('TaskList - exclusao em massa (Admin)', () => {
  it('sem tasks.bulk_delete, nao mostra checkbox nem botao de exclusao em massa', () => {
    currentCan = () => false;
    renderWithProviders(<TaskList tasks={tasks} loading={false} canEdit={false} />);

    expect(screen.queryByLabelText('Selecionar todas as tarefas visiveis')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir selecionadas/i })).not.toBeInTheDocument();
  });

  it('com tasks.bulk_delete, seleciona tarefas e exige digitar a quantidade antes de excluir', async () => {
    currentCan = (c) => c === 'tasks.bulk_delete';
    renderWithProviders(<TaskList tasks={tasks} loading={false} canEdit={false} />);

    await userEvent.click(screen.getByLabelText('Selecionar T001'));
    await userEvent.click(screen.getByLabelText('Selecionar T002'));

    const bulkButton = screen.getByRole('button', { name: 'Excluir selecionadas (2)' });
    await userEvent.click(bulkButton);

    expect(await screen.findByText('Excluir tarefas selecionadas')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Excluir' });
    expect(confirmButton).toBeDisabled();
    expect(mocks.bulkDeleteTasks).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Confirmacao'), '2');
    await userEvent.click(confirmButton);

    await waitFor(() => expect(mocks.bulkDeleteTasks).toHaveBeenCalledWith(['t1', 't2']));
  });

  it('marcar o checkbox de uma linha nao abre o modal de edicao da tarefa', async () => {
    currentCan = (c) => c === 'tasks.bulk_delete';
    renderWithProviders(<TaskList tasks={tasks} loading={false} canEdit={false} />);

    await userEvent.click(screen.getByLabelText('Selecionar T001'));
    expect(screen.queryByText('T001 · Validar calculos IFRS 16')).not.toBeInTheDocument();
  });

  it('o cabecalho "selecionar todas" marca e desmarca todas as linhas visiveis', async () => {
    currentCan = (c) => c === 'tasks.bulk_delete';
    renderWithProviders(<TaskList tasks={tasks} loading={false} canEdit={false} />);

    await userEvent.click(screen.getByLabelText('Selecionar todas as tarefas visiveis'));
    expect(await screen.findByRole('button', { name: 'Excluir selecionadas (2)' })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Selecionar todas as tarefas visiveis'));
    expect(screen.queryByRole('button', { name: /Excluir selecionadas/i })).not.toBeInTheDocument();
  });
});
