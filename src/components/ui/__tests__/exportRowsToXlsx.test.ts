import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';
import type { WorkbookSpec } from '@/lib/export/xlsx';

const downloadWorkbook = vi.fn<(spec: WorkbookSpec) => Promise<void>>(() => Promise.resolve());

vi.mock('@/lib/export/xlsx', async () => {
  const actual = await vi.importActual<typeof import('@/lib/export/xlsx')>('@/lib/export/xlsx');
  return { ...actual, downloadWorkbook: (spec: WorkbookSpec) => downloadWorkbook(spec) };
});

const { exportRowsToXlsx } = await import('@/components/ui/DataTable');

interface Row { code: string; budget: number; progress: number; health: string }

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'code', header: 'Codigo', meta: { label: 'Codigo' } },
  { accessorKey: 'budget', header: 'Orcamento', meta: { label: 'Orcamento', exportType: 'currency' } },
  { accessorKey: 'progress', header: 'Avanco', meta: { label: 'Avanco realizado', exportType: 'percent' } },
  { id: 'health', header: 'Saude', meta: { label: 'Saude', exportable: false } },
];

const rows: Row[] = [
  { code: 'PRJ-1', budget: 1000, progress: 40, health: 'verde' },
  { code: 'PRJ-2', budget: 2000, progress: 80, health: 'vermelho' },
];

beforeEach(() => downloadWorkbook.mockClear());

describe('exportRowsToXlsx', () => {
  it('gera arquivo .xlsx com ambiente e data no nome', async () => {
    await exportRowsToXlsx(rows, columns, 'Portfolio de Projetos', { environment: 'PRD', title: 'Portfolio' });
    const spec = downloadWorkbook.mock.calls[0][0];
    expect(spec.fileName).toMatch(/^portfolio_de_projetos_PRD_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('usa o rotulo amigavel da coluna, nunca a chave tecnica', async () => {
    await exportRowsToXlsx(rows, columns, 'portfolio', { environment: 'QA', title: 'Portfolio' });
    const headers = downloadWorkbook.mock.calls[0][0].sheets[0].columns?.map((c) => c.header);
    expect(headers).toContain('Avanco realizado');
    expect(headers).not.toContain('progress');
  });

  it('omite colunas marcadas como nao exportaveis', async () => {
    await exportRowsToXlsx(rows, columns, 'portfolio', { environment: 'QA', title: 'Portfolio' });
    const keys = downloadWorkbook.mock.calls[0][0].sheets[0].columns?.map((c) => c.key);
    expect(keys).toEqual(['code', 'budget', 'progress']);
  });

  it('propaga os tipos declarados para o Excel receber numero e nao texto', async () => {
    await exportRowsToXlsx(rows, columns, 'portfolio', { environment: 'QA', title: 'Portfolio' });
    const cols = downloadWorkbook.mock.calls[0][0].sheets[0].columns ?? [];
    expect(cols.find((c) => c.key === 'budget')?.type).toBe('currency');
    expect(cols.find((c) => c.key === 'progress')?.type).toBe('percent');
  });

  it('exporta somente as linhas recebidas - as ja filtradas pela tela', async () => {
    const filtered = rows.filter((r) => r.health === 'vermelho');
    await exportRowsToXlsx(filtered, columns, 'portfolio', { environment: 'PRD', title: 'Portfolio' });
    const sheet = downloadWorkbook.mock.calls[0][0].sheets[0];
    expect(sheet.rows).toHaveLength(1);
    expect((sheet.rows[0] as unknown as Row).code).toBe('PRJ-2');
  });

  it('respeita a ordem das colunas visiveis recebida da tela', async () => {
    const reordered = [columns[2], columns[0], columns[1]];
    await exportRowsToXlsx(rows, reordered, 'portfolio', { environment: 'QA', title: 'Portfolio' });
    const keys = downloadWorkbook.mock.calls[0][0].sheets[0].columns?.map((c) => c.key);
    expect(keys).toEqual(['progress', 'code', 'budget']);
  });

  it('carimba o ambiente ativo nos metadados da planilha', async () => {
    await exportRowsToXlsx(rows, columns, 'portfolio', {
      environment: 'QA', title: 'Portfolio', userEmail: 'ana@empresa.com.br',
    });
    expect(downloadWorkbook.mock.calls[0][0].meta).toMatchObject({
      environment: 'QA', userEmail: 'ana@empresa.com.br',
    });
  });
});
