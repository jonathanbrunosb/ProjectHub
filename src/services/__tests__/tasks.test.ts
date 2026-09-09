import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn(async () => ({ error: null }));
const from = vi.fn(() => ({ insert }));

vi.mock('@/lib/supabase/client', () => ({ supabase: { from } }));

const { createTasks } = await import('../tasks');

beforeEach(() => {
  insert.mockClear();
  from.mockClear();
});

describe('createTasks', () => {
  it('envia todas as tarefas em um único insert', async () => {
    const tasks = [
      { project_id: 'project-1', code: 'T001', title: 'Primeira' },
      { project_id: 'project-1', code: 'T002', title: 'Segunda' },
    ];

    await expect(createTasks(tasks)).resolves.toBe(2);
    expect(from).toHaveBeenCalledWith('tasks');
    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(tasks);
  });

  it('não chama o banco quando não há linhas', async () => {
    await expect(createTasks([])).resolves.toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
