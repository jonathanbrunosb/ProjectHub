import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../DataTable';

interface Row { code: string; name: string; budget: number }

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'code', header: 'Codigo', meta: { label: 'Codigo' } },
  { accessorKey: 'name', header: 'Projeto', meta: { label: 'Projeto' } },
  { accessorKey: 'budget', header: 'Orcamento', meta: { label: 'Orcamento' } },
];

const data: Row[] = [
  { code: 'CTB-001', name: 'IFRS 18', budget: 1000 },
  { code: 'CTB-002', name: 'Reforma Tributaria', budget: 2000 },
  { code: 'CTB-003', name: 'Migracao SAP', budget: 3000 },
];

describe('DataTable', () => {
  it('renderiza as linhas e a contagem de registros', () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText('IFRS 18')).toBeInTheDocument();
    expect(screen.getByText(/3 registros/)).toBeInTheDocument();
  });

  it('filtra pela busca global', async () => {
    const user = userEvent.setup();
    render(<DataTable data={data} columns={columns} />);
    await user.type(screen.getByLabelText('Buscar na tabela'), 'SAP');
    expect(screen.getByText('Migracao SAP')).toBeInTheDocument();
    expect(screen.queryByText('IFRS 18')).not.toBeInTheDocument();
  });

  it('permite ocultar uma coluna pelo seletor de colunas', async () => {
    const user = userEvent.setup();
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByRole('columnheader', { name: /Orcamento/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Colunas/ }));
    await user.click(screen.getByRole('checkbox', { name: /Orcamento/ }));

    expect(screen.queryByRole('columnheader', { name: /Orcamento/ })).not.toBeInTheDocument();
  });

  it('propaga o estado da tabela para persistencia externa', async () => {
    const user = userEvent.setup();
    const onStateChange = vi.fn();
    const state = {
      sorting: [], visibility: {}, order: [], sizing: {},
      pinning: { left: [], right: [] }, grouping: [], search: '',
    };
    render(<DataTable data={data} columns={columns} state={state} onStateChange={onStateChange} />);
    await user.type(screen.getByLabelText('Buscar na tabela'), 'a');
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'a' }));
  });

  it('dispara onRowClick com a linha original', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<DataTable data={data} columns={columns} onRowClick={onRowClick} />);
    await user.click(screen.getByText('IFRS 18'));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('mostra estado vazio quando nao ha registros', () => {
    render(<DataTable data={[]} columns={columns} emptyTitle="Nenhum projeto" />);
    expect(screen.getByText('Nenhum projeto')).toBeInTheDocument();
  });
});
