import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getGroupedRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnOrderState, type ColumnPinningState, type ColumnSizingState,
  type GroupingState, type SortingState, type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown,
  Columns3, Download, Pin, RotateCcw, Search,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './Button';
import { Input, Select } from './Input';
import { Popover, PopoverItem } from './Popover';
import { EmptyState, SkeletonTable } from './Feedback';
import { useEnvironment } from '@/app/EnvironmentProvider';

export interface DataTableState {
  sorting: SortingState;
  visibility: VisibilityState;
  order: ColumnOrderState;
  sizing: ColumnSizingState;
  pinning: ColumnPinningState;
  grouping: GroupingState;
  search: string;
}

export const emptyTableState: DataTableState = {
  sorting: [], visibility: {}, order: [], sizing: {}, pinning: { left: [], right: [] },
  grouping: [], search: '',
};

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  /** Estado controlado - permite persistir em saved_views / column_preferences. */
  state?: DataTableState;
  onStateChange?: (next: DataTableState) => void;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  groupableColumns?: { id: string; label: string }[];
  toolbarExtra?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  exportFileName?: string;
  onExport?: () => void;
  pageSize?: number;
  stickyHeader?: boolean;
}

export function DataTable<T extends object>({
  data, columns, loading, state, onStateChange, onRowClick, getRowId,
  groupableColumns = [], toolbarExtra, emptyTitle = 'Nenhum registro encontrado',
  emptyDescription, exportFileName = 'export', onExport, pageSize = 25, stickyHeader = true,
}: DataTableProps<T>) {
  const { environment } = useEnvironment();
  const [internal, setInternal] = useState<DataTableState>(emptyTableState);
  const current = state ?? internal;
  const setState = (patch: Partial<DataTableState>) => {
    const next = { ...current, ...patch };
    (onStateChange ?? setInternal)(next);
  };

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId as ((row: T, index: number) => string) | undefined,
    state: {
      sorting: current.sorting,
      columnVisibility: current.visibility,
      columnOrder: current.order,
      columnSizing: current.sizing,
      columnPinning: current.pinning,
      grouping: current.grouping,
      globalFilter: current.search,
    },
    onSortingChange: (u) => setState({ sorting: typeof u === 'function' ? u(current.sorting) : u }),
    onColumnVisibilityChange: (u) => setState({ visibility: typeof u === 'function' ? u(current.visibility) : u }),
    onColumnOrderChange: (u) => setState({ order: typeof u === 'function' ? u(current.order) : u }),
    onColumnSizingChange: (u) => setState({ sizing: typeof u === 'function' ? u(current.sizing) : u }),
    onColumnPinningChange: (u) => setState({ pinning: typeof u === 'function' ? u(current.pinning) : u }),
    onGroupingChange: (u) => setState({ grouping: typeof u === 'function' ? u(current.grouping) : u }),
    onGlobalFilterChange: (u) => setState({ search: typeof u === 'function' ? u(current.search) : u }),
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const totalRows = table.getFilteredRowModel().rows.length;

  const hideableColumns = useMemo(
    () => table.getAllLeafColumns().filter((c) => c.getCanHide()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, current.visibility, current.order],
  );

  const handleExport = () => {
    if (onExport) return onExport();
    exportRowsToCsv(table.getFilteredRowModel().rows.map((r) => r.original), columns, exportFileName, environment);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={current.search}
            onChange={(e) => setState({ search: e.target.value })}
            placeholder="Buscar..."
            className="pl-8"
            aria-label="Buscar na tabela"
          />
        </div>

        {toolbarExtra}

        {groupableColumns.length > 0 && (
          <Select
            className="w-auto"
            value={current.grouping[0] ?? ''}
            onChange={(e) => setState({ grouping: e.target.value ? [e.target.value] : [] })}
            aria-label="Agrupar por"
          >
            <option value="">Sem agrupamento</option>
            {groupableColumns.map((g) => (
              <option key={g.id} value={g.id}>Agrupar por {g.label}</option>
            ))}
          </Select>
        )}

        <Popover
          trigger={({ toggle }) => (
            <Button variant="secondary" size="md" onClick={toggle} icon={<Columns3 className="h-4 w-4" />}>
              Colunas
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          )}
          contentClassName="max-h-80 overflow-y-auto w-64"
        >
          <div className="px-2 py-1.5 text-xs font-medium text-muted">Exibir colunas</div>
          {hideableColumns.map((col) => (
            <label
              key={col.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2"
            >
              <input
                type="checkbox"
                className="accent-[rgb(var(--c-brand))]"
                checked={col.getIsVisible()}
                onChange={col.getToggleVisibilityHandler()}
              />
              <span className="flex-1 truncate">{columnLabel(col.columnDef as ColumnLike)}</span>
              <button
                type="button"
                title={col.getIsPinned() ? 'Desafixar' : 'Fixar a esquerda'}
                onClick={(e) => {
                  e.preventDefault();
                  col.pin(col.getIsPinned() ? false : 'left');
                }}
                className={cn('rounded p-0.5', col.getIsPinned() ? 'text-brand' : 'text-muted hover:text-fg')}
              >
                <Pin className="h-3 w-3" />
              </button>
            </label>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <PopoverItem onClick={() => setState({ visibility: {}, order: [], sizing: {}, pinning: { left: [], right: [] } })}>
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrao
            </PopoverItem>
          </div>
        </Popover>

        <Button variant="secondary" size="md" onClick={handleExport} icon={<Download className="h-4 w-4" />}>
          Exportar
        </Button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm" style={{ width: table.getTotalSize() }}>
            <thead className={cn('bg-surface-2', stickyHeader && 'sticky top-0 z-10')}>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const pinned = header.column.getIsPinned();
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className={cn(
                          'relative select-none border-b border-border px-3 py-2.5 text-left text-xs font-semibold text-muted',
                          pinned === 'left' && 'sticky left-0 z-20 bg-surface-2',
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className={cn('inline-flex items-center gap-1', canSort && 'hover:text-fg')}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            disabled={!canSort}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              sorted === 'asc' ? <ArrowUp className="h-3 w-3" />
                                : sorted === 'desc' ? <ArrowDown className="h-3 w-3" />
                                  : <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        )}
                        {header.column.getCanResize() && (
                          <span
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-brand/40"
                            aria-hidden
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={table.getVisibleLeafColumns().length} className="p-4">
                  <SkeletonTable rows={5} cols={Math.min(6, table.getVisibleLeafColumns().length)} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={table.getVisibleLeafColumns().length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td></tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => !row.getIsGrouped() && onRowClick?.(row.original)}
                    className={cn(
                      'border-b border-border/70 transition-colors last:border-0',
                      row.getIsGrouped() ? 'bg-surface-2 font-medium' : 'hover:bg-surface-2/60',
                      onRowClick && !row.getIsGrouped() && 'cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className={cn(
                          'px-3 py-2.5 align-middle',
                          cell.column.getIsPinned() === 'left' && 'sticky left-0 z-10 bg-surface',
                        )}
                      >
                        {cell.getIsGrouped() ? (
                          <button
                            onClick={row.getToggleExpandedHandler()}
                            className="inline-flex items-center gap-1.5 font-medium"
                          >
                            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', row.getIsExpanded() && 'rotate-90')} />
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            <span className="text-xs text-muted">({row.subRows.length})</span>
                          </button>
                        ) : cell.getIsAggregated() ? null : cell.getIsPlaceholder() ? null : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalRows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>
            {totalRows} registro{totalRows === 1 ? '' : 's'}
            {table.getPageCount() > 1 && ` · pagina ${table.getState().pagination.pageIndex + 1} de ${table.getPageCount()}`}
          </span>
          <div className="flex items-center gap-2">
            <Select
              className="h-8 w-auto py-0 text-xs"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              aria-label="Registros por pagina"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / pagina</option>)}
            </Select>
            <Button variant="ghost" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Pagina anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Proxima pagina">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rotulo legivel da coluna: meta.label, senao o header textual, senao o id. */
type ColumnLike = { meta?: unknown; header?: unknown; id?: string; accessorKey?: string };

function columnLabel(def: ColumnLike): string {
  const meta = def.meta as { label?: string } | undefined;
  if (meta?.label) return meta.label;
  if (typeof def.header === 'string') return def.header;
  return String(def.id ?? def.accessorKey ?? '');
}

/** Exportacao CSV client-side respeitando as linhas ja filtradas pelo usuario. */
/** O nome do arquivo carrega o ambiente: um export de QA nunca deve ser
 *  confundido com um relatorio oficial de Producao. */
export function exportRowsToCsv<T extends object>(
  rows: T[], columns: ColumnDef<T, unknown>[], fileName: string, environment?: string,
) {
  const cols = columns.filter((c) => (c.meta as { exportable?: boolean } | undefined)?.exportable !== false);
  const headers = cols.map((c) => columnLabel(c as ColumnLike));
  const keys = cols.map((c) => (c as ColumnLike).accessorKey ?? (c as ColumnLike).id ?? '');

  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",;\n]/.test(s) ? `"${s}"` : s;
  };

  const csv = [
    headers.join(';'),
    ...rows.map((row) => keys.map((k) => escape((row as Record<string, unknown>)[k])).join(';')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const envSuffix = environment ? `_${environment}` : '';
  a.download = `${fileName}${envSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
