import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const createTasks = vi.fn(async (_tasks: unknown[]) => 2);
vi.mock('@/services/tasks', () => ({ createTasks: (tasks: unknown[]) => createTasks(tasks) }));

vi.mock('@/services/projects', () => ({
  listActiveProfiles: vi.fn(async () => [{ id: 'profile-1', email: 'ana@empresa.com.br' }]),
}));

const downloadTaskImportTemplate = vi.fn(async () => {});
const parseTaskImportFile = vi.fn(async (_file: File, _context: unknown) => ({
  tasks: [
    { project_id: 'project-1', code: 'T001', title: 'Primeira' },
    { project_id: 'project-1', code: 'T002', title: 'Segunda' },
  ],
  issues: [],
}));
vi.mock('../taskImport', () => ({
  downloadTaskImportTemplate: () => downloadTaskImportTemplate(),
  parseTaskImportFile: (file: File, context: unknown) => parseTaskImportFile(file, context),
}));

const { TaskImportModal } = await import('../TaskImportModal');

beforeEach(() => {
  createTasks.mockClear();
  downloadTaskImportTemplate.mockClear();
  parseTaskImportFile.mockClear();
});

describe('TaskImportModal', () => {
  it('entrega o modelo de importação ao usuário', async () => {
    renderWithProviders(
      <TaskImportModal open onClose={vi.fn()} projectId="project-1" existingTasks={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /baixar modelo/i }));
    await waitFor(() => expect(downloadTaskImportTemplate).toHaveBeenCalledOnce());
  });

  it('valida o xlsx antes de liberar a importação em lote', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <TaskImportModal open onClose={onClose} projectId="project-1" existingTasks={[]} />,
    );

    const input = screen.getByLabelText(/arquivo excel de tarefas/i);
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.upload(input, new File(['xlsx'], 'tarefas.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));

    expect(await screen.findByText(/2 tarefa\(s\) pronta\(s\)/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /importar 2 tarefa/i }));

    await waitFor(() => expect(createTasks).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
