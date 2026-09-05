import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, exportRowsToXlsx } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/Feedback';
import { useTableState } from '@/hooks/useTableState';
import { useToast } from '@/components/ui/Toast';
import { logAppEvent } from '@/lib/supabase/audit';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { useAuth } from '@/app/AuthProvider';
import { listAuditLog } from '@/services/governance';
import { listProfiles, listProjectOverview } from '@/services/projects';
import { formatDateTime } from '@/utils/format';
import { auditActionLabel, auditActionTone, entityLabel } from '@/utils/domain-labels';
import type { AuditLogEntry } from '@/types/domain';

/**
 * Trilha de auditoria: somente leitura, mesmo para Admin. A imutabilidade e'
 * garantida por gatilho no PostgreSQL, nao pela interface.
 */
export function AuditPage() {
  useBreadcrumbs([{ label: 'Governanca' }, { label: 'Trilha de Auditoria' }]);
  const toast = useToast();
  const { environment } = useEnvironment();
  const table = useTableState('audit');
  const { profile } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);
  const [filters, setFilters] = useState({ userId: '', projectId: '', entity: '', action: '', from: '', to: '' });

  const profiles = useQuery({ queryKey: ['profiles', 'all'], queryFn: listProfiles });
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => listAuditLog({
      userId: filters.userId || undefined,
      projectId: filters.projectId || undefined,
      entity: filters.entity || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      limit: 500,
    }),
  });

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(() => [
    { accessorKey: 'occurred_at', header: 'Data/hora (UTC)', meta: { label: 'Data/hora', exportType: 'datetime' }, size: 160,
      cell: ({ getValue }) => <span className="tabular-nums text-xs">{formatDateTime(getValue() as string)}</span> },
    { accessorKey: 'user_name', header: 'Usuario', meta: { label: 'Usuario' }, size: 160,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.user_name ?? 'Sistema'}</p>
          <p className="truncate text-xs text-muted">{row.original.user_email ?? '—'}</p>
        </div>
      ) },
    { accessorKey: 'action', header: 'Acao', meta: { label: 'Acao' }, size: 150,
      cell: ({ row }) => <Badge tone={auditActionTone[row.original.action]}>{auditActionLabel[row.original.action]}</Badge> },
    { accessorKey: 'entity', header: 'Entidade', meta: { label: 'Entidade' }, size: 150,
      cell: ({ getValue }) => entityLabel[getValue() as string] ?? (getValue() as string) },
    { id: 'changed', accessorFn: (r) => (r.changed_fields ?? []).join(', '), header: 'Campos alterados',
      meta: { label: 'Campos alterados' }, size: 240,
      cell: ({ getValue }) => (
        <span className="line-clamp-1 font-mono text-xs text-muted">{(getValue() as string) || '—'}</span>
      ) },
    { accessorKey: 'ip_address', header: 'IP', meta: { label: 'IP' }, size: 120,
      cell: ({ getValue }) => <span className="font-mono text-xs text-muted">{(getValue() as string) ?? '—'}</span> },
    { accessorKey: 'origin', header: 'Origem', meta: { label: 'Origem' }, size: 90 },
  ], []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportRowsToXlsx(data, columns, 'trilha-auditoria', {
        environment,
        title: 'Auditoria',
        userEmail: profile?.email,
        filters: exportedFilters(filters),
      });
      await logAppEvent('export', 'application_audit_log', {
        data: { rows: data.length, format: 'XLSX', filters, environment },
      });
      toast.success('Exportacao registrada', 'O evento de exportacao foi gravado na propria trilha.');
    } catch (err) {
      toast.error(
        'Nao foi possivel gerar o arquivo Excel',
        err instanceof Error ? err.message : 'Tente novamente.',
      );
    } finally {
      setExporting(false);
    }
  };

  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Trilha de Auditoria"
        description="Registro imutavel de operacoes criticas. Alteracoes de dados sao capturadas por gatilho no banco; login, logout e exportacao carregam contexto de sessao."
        actions={
          <Button
            variant="secondary"
            onClick={() => void handleExport()}
            loading={exporting}
            disabled={exporting}
            icon={<FileSpreadsheet className="h-4 w-4" />}
          >
            {exporting ? 'Gerando Excel...' : 'Exportar Excel'}
          </Button>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Usuario">
          <Select value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}>
            <option value="">Todos</option>
            {(profiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Projeto">
          <Select value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">Todos</option>
            {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </Select>
        </Field>
        <Field label="Entidade">
          <Select value={filters.entity} onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))}>
            <option value="">Todas</option>
            {Object.entries(entityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Tipo de evento">
          <Select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
            <option value="">Todos</option>
            {Object.entries(auditActionLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="De">
          <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </Field>
        <Field label="Ate">
          <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </Field>
      </div>

      <DataTable<AuditLogEntry>
        data={data}
        columns={columns}
        loading={isLoading}
        state={table.state}
        onStateChange={table.onStateChange}
        onRowClick={setDetail}
        getRowId={(r) => String(r.id)}
        groupableColumns={[{ id: 'entity', label: 'Entidade' }, { id: 'action', label: 'Acao' }]}
        onExport={handleExport}
        emptyTitle="Nenhum evento no filtro atual"
        pageSize={50}
      />

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Detalhe do evento"
        description={detail ? `${auditActionLabel[detail.action]} · ${entityLabel[detail.entity] ?? detail.entity}` : undefined}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Data/hora (UTC)" value={formatDateTime(detail.occurred_at)} />
              <Info label="Usuario" value={detail.user_name ?? 'Sistema'} />
              <Info label="E-mail" value={detail.user_email ?? '—'} />
              <Info label="Origem" value={detail.origin} />
              <Info label="Entidade" value={entityLabel[detail.entity] ?? detail.entity} />
              <Info label="ID do registro" value={detail.entity_id ?? '—'} mono />
              <Info label="IP" value={detail.ip_address ?? '—'} mono />
              <Info label="User agent" value={detail.user_agent ?? '—'} />
            </dl>

            {detail.changed_fields?.length ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Campos alterados</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left font-medium text-muted">Campo</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-muted">Antes</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-muted">Depois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.changed_fields.map((field) => (
                        <tr key={field} className="border-t border-border">
                          <td className="px-2.5 py-1.5 font-mono">{field}</td>
                          <td className="px-2.5 py-1.5 text-muted">{renderValue(detail.old_data?.[field])}</td>
                          <td className="px-2.5 py-1.5 font-medium">{renderValue(detail.new_data?.[field])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted">Payload completo</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 text-[10px] leading-relaxed">
                {JSON.stringify({ old: detail.old_data, new: detail.new_data }, null, 2)}
              </pre>
            </details>

            <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
              Este registro nao pode ser alterado nem excluido por nenhum perfil, incluindo Administrador.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Rotula os filtros ativos para a aba de informacoes da planilha. */
function exportedFilters(filters: Record<string, string>): Record<string, string> {
  const labels: Record<string, string> = {
    userId: 'Usuario', projectId: 'Projeto', entity: 'Entidade',
    action: 'Acao', from: 'De', to: 'Ate',
  };
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [labels[k] ?? k, v]),
  );
}
