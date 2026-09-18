import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn(async () => ({ data: [], error: null as Error | null }));
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const upsert = vi.fn(async (_payload: Record<string, unknown>, _opts: Record<string, unknown>) => ({ error: null as Error | null }));
const deleteEq = vi.fn(async (_column: string, _value: string) => ({ error: null as Error | null }));
const del = vi.fn(() => ({ eq: deleteEq }));
const from = vi.fn((_table: string) => ({ select, upsert, delete: del }));

vi.mock('@/lib/supabase/client', () => ({ supabase: { from } }));

const { listEvmSnapshots, upsertEvmSnapshot, deleteEvmSnapshot } = await import('../governance');

beforeEach(() => {
  order.mockClear();
  eq.mockClear();
  select.mockClear();
  upsert.mockClear();
  deleteEq.mockClear();
  del.mockClear();
  from.mockClear();
});

describe('listEvmSnapshots', () => {
  it('filtra por projeto e ordena por data de referencia', async () => {
    await listEvmSnapshots('p1');
    expect(from).toHaveBeenCalledWith('evm_snapshots');
    expect(eq).toHaveBeenCalledWith('project_id', 'p1');
    expect(order).toHaveBeenCalledWith('reference_date');
  });
});

describe('upsertEvmSnapshot', () => {
  it('grava via upsert com conflito em (project_id, reference_date)', async () => {
    await upsertEvmSnapshot({ project_id: 'p1', reference_date: '2026-09-01', pv: 1000, ev: 900, ac: 950 });
    expect(upsert).toHaveBeenCalledWith(
      { project_id: 'p1', reference_date: '2026-09-01', pv: 1000, ev: 900, ac: 950 },
      { onConflict: 'project_id,reference_date' },
    );
  });
});

describe('deleteEvmSnapshot', () => {
  it('apaga pelo id', async () => {
    await deleteEvmSnapshot('s1');
    expect(del).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith('id', 's1');
  });
});
