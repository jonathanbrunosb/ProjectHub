import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CriticalityBadge, RiskStatusBadge, ActionStatusBadge } from '@/components/ui/StatusBadges';
import { useTableState } from '@/hooks/useTableState';
import { formatDate, daysBetween } from '@/utils/format';
import { criticalityLabel, riskCriticality, riskStrategyLabel } from '@/utils/domain-labels';
import type { RiskWithContext, ActionPlanWithContext } from '@/services/risks';
import { RiskModal } from './RiskModal';
import { ActionPlanModal } from './ActionPlanModal';

export function RiskTable({
  risks, loading, projectId, canEdit, showProject, module = 'risks',
}: {
  risks: RiskWithContext[]; loading: boolean; projectId?: string;
  canEdit: boolean; showProject?: boolean; module?: string;
}) {
  const table = useTableState(module);
  const [editing, setEditing] = useState<RiskWithContext | null>(null);
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<RiskWithContext, unknown>[]>(() => {
    const cols: ColumnDef<RiskWithContext, unknown>[] = [
      { accessorKey: 'code', header: 'ID', meta: { label: 'ID' }, size: 80,
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted">{getValue() as string}</span> },
      { accessorKey: 'kind', header: 'Tipo', meta: { label: 'Tipo' }, size: 90,
        cell: ({ getValue }) => (
          <Badge tone={getValue() === 'issue' ? 'danger' : 'info'}>
            {getValue() === 'issue' ? 'Issue' : 'Risco'}
          </Badge>
        ) },
      { accessorKey: 'title', header: 'Descricao', meta: { label: 'Descricao' }, size: 320,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            {!row.original.mitigation_plan && row.original.score >= 15 && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-danger">
                <AlertTriangle className="h-3 w-3" /> risco critico sem plano
              </span>
            )}
          </div>
        ) },
      { accessorKey: 'category', header: 'Categoria', meta: { label: 'Categoria' }, size: 130,
        cell: ({ getValue }) => (getValue() as string) ?? '—' },
      { accessorKey: 'probability', header: 'Prob.', meta: { label: 'Probabilidade', exportType: 'integer' }, size: 70 },
      { accessorKey: 'impact', header: 'Impacto', meta: { label: 'Impacto', exportType: 'integer' }, size: 80 },
      { accessorKey: 'score', header: 'Score', meta: { label: 'Score', exportType: 'integer' }, size: 130,
        cell: ({ row }) => <CriticalityBadge score={row.original.score} /> },
      { id: 'criticidade', accessorFn: (r) => criticalityLabel[riskCriticality(r.score)],
        header: 'Criticidade', meta: { label: 'Criticidade' }, size: 110 },
      { id: 'owner', accessorFn: (r) => r.owner?.full_name ?? '', header: 'Responsavel', meta: { label: 'Responsavel' }, size: 160,
        cell: ({ row }) => row.original.owner?.full_name ?? <span className="text-danger text-xs">sem owner</span> },
      { accessorKey: 'strategy', header: 'Estrategia', meta: { label: 'Estrategia' }, size: 110,
        cell: ({ getValue }) => {
          const v = getValue() as keyof typeof riskStrategyLabel | null;
          return v ? riskStrategyLabel[v] : <span className="text-xs text-muted">—</span>;
        } },
      { accessorKey: 'status', header: 'Status', meta: { label: 'Status' }, size: 130,
        cell: ({ row }) => <RiskStatusBadge status={row.original.status} /> },
      { accessorKey: 'due_date', header: 'Prazo', meta: { label: 'Prazo', exportType: 'date' }, size: 120,
        cell: ({ row }) => {
          const overdue = row.original.due_date && row.original.status !== 'encerrado'
            && (daysBetween(new Date(), row.original.due_date) ?? 0) < 0;
          return <span className={overdue ? 'font-medium text-danger' : ''}>{formatDate(row.original.due_date)}</span>;
        } },
      { accessorKey: 'last_review_at', header: 'Ultima revisao', meta: { label: 'Ultima revisao', exportType: 'date' }, size: 120,
        cell: ({ getValue }) => formatDate(getValue() as string) },
    ];
    if (showProject) {
      cols.splice(1, 0, {
        id: 'project', accessorFn: (r) => r.project?.code ?? '', header: 'Projeto', meta: { label: 'Projeto' }, size: 130,
        cell: ({ row }) => (
          <Link to={`/projetos/${row.original.project_id}/riscos`} className="font-mono text-xs text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.project?.code ?? '—'}
          </Link>
        ),
      });
    }
    return cols;
  }, [showProject]);

  return (
    <>
      {canEdit && projectId && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo risco</Button>
        </div>
      )}
      <DataTable<RiskWithContext>
        data={risks}
        columns={columns}
        loading={loading}
        state={table.state}
        onStateChange={table.onStateChange}
        onRowClick={(r) => setEditing(r)}
        getRowId={(r) => r.id}
        groupableColumns={[
          { id: 'criticidade', label: 'Criticidade' },
          { id: 'status', label: 'Status' },
          { id: 'category', label: 'Categoria' },
          ...(showProject ? [{ id: 'project', label: 'Projeto' }] : []),
        ]}
        exportFileName="riscos"
        emptyTitle="Nenhum risco registrado"
        emptyDescription="Registrar riscos cedo e o que permite agir antes do impacto."
      />

      {(creating || editing) && (
        <RiskModal
          open
          onClose={() => { setCreating(false); setEditing(null); }}
          projectId={editing?.project_id ?? projectId!}
          risk={editing}
          canEdit={canEdit}
        />
      )}
    </>
  );
}

export function ActionPlanTable({
  actions, loading, projectId, canEdit, showProject, module = 'actions',
}: {
  actions: ActionPlanWithContext[]; loading: boolean; projectId?: string;
  canEdit: boolean; showProject?: boolean; module?: string;
}) {
  const table = useTableState(module);
  const [editing, setEditing] = useState<ActionPlanWithContext | null>(null);
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<ActionPlanWithContext, unknown>[]>(() => {
    const cols: ColumnDef<ActionPlanWithContext, unknown>[] = [
      { accessorKey: 'code', header: 'ID', meta: { label: 'ID' }, size: 80,
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted">{getValue() as string}</span> },
      { accessorKey: 'title', header: 'Acao', meta: { label: 'Acao' }, size: 320,
        cell: ({ row }) => <p className="truncate font-medium">{row.original.title}</p> },
      { id: 'origem', accessorFn: (r) => r.risk?.code ?? r.origin, header: 'Origem', meta: { label: 'Origem' }, size: 130,
        cell: ({ row }) => row.original.risk
          ? <Badge tone="warn">{row.original.risk.code}</Badge>
          : <Badge tone="neutral">{row.original.origin}</Badge> },
      { id: 'owner', accessorFn: (r) => r.owner?.full_name ?? '', header: 'Responsavel', meta: { label: 'Responsavel' }, size: 160,
        cell: ({ row }) => row.original.owner?.full_name ?? '—' },
      { accessorKey: 'due_date', header: 'Prazo', meta: { label: 'Prazo', exportType: 'date' }, size: 110,
        cell: ({ getValue }) => formatDate(getValue() as string) },
      { id: 'atraso', accessorFn: (r) => {
          if (!r.due_date || ['concluida', 'cancelada'].includes(r.status)) return 0;
          const d = daysBetween(new Date(), r.due_date) ?? 0;
          return d < 0 ? Math.abs(d) : 0;
        }, header: 'Atraso (dias)', meta: { label: 'Atraso (dias)' }, size: 110,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0);
          return v > 0 ? <Badge tone="danger">{v}</Badge> : <span className="text-xs text-muted">—</span>;
        } },
      { accessorKey: 'status', header: 'Status', meta: { label: 'Status' }, size: 130,
        cell: ({ row }) => <ActionStatusBadge status={row.original.status} /> },
      { accessorKey: 'priority', header: 'Prioridade', meta: { label: 'Prioridade' }, size: 110 },
      { accessorKey: 'completed_at', header: 'Conclusao', meta: { label: 'Conclusao', exportType: 'date' }, size: 110,
        cell: ({ getValue }) => formatDate(getValue() as string) },
    ];
    if (showProject) {
      cols.splice(1, 0, {
        id: 'project', accessorFn: (r) => r.project?.code ?? '', header: 'Projeto', meta: { label: 'Projeto' }, size: 130,
        cell: ({ row }) => (
          <Link to={`/projetos/${row.original.project_id}/acoes`} className="font-mono text-xs text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.project?.code ?? '—'}
          </Link>
        ),
      });
    }
    return cols;
  }, [showProject]);

  return (
    <>
      {canEdit && projectId && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo plano de acao</Button>
        </div>
      )}
      <DataTable<ActionPlanWithContext>
        data={actions}
        columns={columns}
        loading={loading}
        state={table.state}
        onStateChange={table.onStateChange}
        onRowClick={(a) => setEditing(a)}
        getRowId={(a) => a.id}
        groupableColumns={[
          { id: 'status', label: 'Status' },
          { id: 'owner', label: 'Responsavel' },
          ...(showProject ? [{ id: 'project', label: 'Projeto' }] : []),
        ]}
        exportFileName="planos-de-acao"
        emptyTitle="Nenhum plano de acao registrado"
      />

      {(creating || editing) && (
        <ActionPlanModal
          open
          onClose={() => { setCreating(false); setEditing(null); }}
          projectId={editing?.project_id ?? projectId!}
          action={editing}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
