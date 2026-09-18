import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn(async () => ({ data: [], error: null as Error | null }));
const eqChain = vi.fn(() => ({ eq: eqChain, order }));
const select = vi.fn(() => ({ eq: eqChain }));
const insert = vi.fn(async (_payload: Record<string, unknown>) => ({ error: null as Error | null }));
const updateEq = vi.fn(async (_column: string, _value: string) => ({ error: null as Error | null }));
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }));
const deleteEq = vi.fn(async (_column: string, _value: string) => ({ error: null as Error | null }));
const del = vi.fn(() => ({ eq: deleteEq }));
const from = vi.fn(() => ({ select, insert, update, delete: del }));

vi.mock('@/lib/supabase/client', () => ({ supabase: { from: (table: string) => from(table) } }));

const { listComments, createComment, updateComment, deleteComment, MAX_COMMENT_LENGTH } = await import('../comments');

beforeEach(() => {
  order.mockClear();
  eqChain.mockClear();
  select.mockClear();
  insert.mockClear();
  updateEq.mockClear();
  update.mockClear();
  deleteEq.mockClear();
  del.mockClear();
  from.mockClear();
});

describe('listComments', () => {
  it('filtra por projeto, entidade e registro, em ordem cronologica', async () => {
    await listComments('p1', 'task', 't1');
    expect(from).toHaveBeenCalledWith('comments');
    expect(eqChain).toHaveBeenCalledWith('project_id', 'p1');
    expect(eqChain).toHaveBeenCalledWith('entity', 'task');
    expect(eqChain).toHaveBeenCalledWith('entity_id', 't1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});

describe('createComment', () => {
  it('grava o comentario com o texto aparado', async () => {
    await createComment({ projectId: 'p1', entity: 'risk', entityId: 'r1', body: '  Atenção aqui  ' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'p1', entity: 'risk', entity_id: 'r1', body: 'Atenção aqui', parent_id: null,
    }));
  });

  it('inclui parent_id quando e uma resposta', async () => {
    await createComment({ projectId: 'p1', entity: 'risk', entityId: 'r1', body: 'resposta', parentId: 'c1' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 'c1' }));
  });

  it('rejeita corpo vazio sem chamar o banco', async () => {
    await expect(createComment({ projectId: 'p1', entity: 'risk', entityId: 'r1', body: '   ' }))
      .rejects.toThrow(/vazio/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejeita corpo acima do limite sem chamar o banco', async () => {
    const body = 'a'.repeat(MAX_COMMENT_LENGTH + 1);
    await expect(createComment({ projectId: 'p1', entity: 'risk', entityId: 'r1', body }))
      .rejects.toThrow(/8000/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('updateComment', () => {
  it('atualiza o corpo e marca edited_at', async () => {
    await updateComment('c1', '  texto novo  ');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ body: 'texto novo' }));
    const [payload] = update.mock.calls[0];
    expect(typeof (payload as { edited_at: string }).edited_at).toBe('string');
    expect(updateEq).toHaveBeenCalledWith('id', 'c1');
  });

  it('rejeita corpo vazio sem chamar o banco', async () => {
    await expect(updateComment('c1', '   ')).rejects.toThrow(/vazio/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('deleteComment', () => {
  it('apaga pelo id', async () => {
    await deleteComment('c1');
    expect(del).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith('id', 'c1');
  });
});
