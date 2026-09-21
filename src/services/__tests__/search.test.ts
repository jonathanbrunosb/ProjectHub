import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeQuery(data: unknown[], error: Error | null = null) {
  const q: Record<string, unknown> = {};
  q.or = vi.fn(() => q);
  q.limit = vi.fn(async () => ({ data, error }));
  return q;
}

const projectsQuery = makeQuery([{ id: 'p1', code: 'PRJ-1', name: 'Migracao ERP' }]);
const tasksQuery = makeQuery([{ id: 't1', project_id: 'p1', code: 'T-1', title: 'Homologar migracao', project: { code: 'PRJ-1', name: 'Migracao ERP' } }]);
const risksQuery = makeQuery([]);
const actionPlansQuery = makeQuery([]);
const decisionsQuery = makeQuery([]);

const from = vi.fn((table: string) => {
  const select = vi.fn(() => {
    if (table === 'projects') return projectsQuery;
    if (table === 'tasks') return tasksQuery;
    if (table === 'risks') return risksQuery;
    if (table === 'action_plans') return actionPlansQuery;
    return decisionsQuery;
  });
  return { select };
});

vi.mock('@/lib/supabase/client', () => ({ supabase: { from } }));

const { globalSearch } = await import('../search');

beforeEach(() => {
  from.mockClear();
});

describe('globalSearch', () => {
  it('retorna vazio para termo com menos de 2 caracteres, sem consultar o banco', async () => {
    const results = await globalSearch('a');
    expect(results).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('consulta as 5 entidades em paralelo e monta o link correto por tipo', async () => {
    const results = await globalSearch('migracao');

    expect(from).toHaveBeenCalledWith('projects');
    expect(from).toHaveBeenCalledWith('tasks');
    expect(from).toHaveBeenCalledWith('risks');
    expect(from).toHaveBeenCalledWith('action_plans');
    expect(from).toHaveBeenCalledWith('decisions');

    expect(results).toEqual([
      { kind: 'project', id: 'p1', code: 'PRJ-1', title: 'Migracao ERP', subtitle: 'PRJ-1', link: '/projetos/p1' },
      {
        kind: 'task', id: 't1', code: 'T-1', title: 'Homologar migracao',
        subtitle: 'PRJ-1 · Migracao ERP', link: '/projetos/p1/tarefas',
      },
    ]);
  });

  it('filtra por code OU pelo campo de texto principal', async () => {
    await globalSearch('erp');
    expect(projectsQuery.or).toHaveBeenCalledWith('code.ilike.%erp%,name.ilike.%erp%');
    expect(tasksQuery.or).toHaveBeenCalledWith('code.ilike.%erp%,title.ilike.%erp%');
    expect(decisionsQuery.or).toHaveBeenCalledWith('code.ilike.%erp%,subject.ilike.%erp%');
  });

  it('propaga o erro se qualquer consulta falhar', async () => {
    risksQuery.limit = vi.fn(async () => ({ data: null, error: new Error('falhou') }));
    await expect(globalSearch('erp')).rejects.toThrow('falhou');
  });
});
