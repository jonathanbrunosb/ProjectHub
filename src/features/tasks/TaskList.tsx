import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, LayoutList, Columns, GanttChartSquare, CalendarRange } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Progress } from '@/components/ui/Progress';
import { TaskStatusBadge } from '@/components/ui/StatusBadges';
import { GanttChart, type GanttScale } from '@/components/gantt/GanttChart';
import { cn } from '@/utils/cn';
import { formatDate, daysBetween } from '@/utils/format';
import { priorityLabel, priorityTone, taskStatusLabel } from '@/utils/domain-labels';
import { listDependencies, type TaskWithContext } from '@/services/tasks';
import { useTableState } from '@/hooks/useTableState';
import { TaskBoard } from './TaskBoard';
import { TaskModal } from './TaskModal';

type Mode = 'lista' | 'kanban' | 'timeline' | 'gantt';

const modes: { key: Mode; label: string; icon: typeof LayoutList }[] = [
  { key: 'lista', label: 'Lista', icon: LayoutList },
  { key: 'kanban', label: 'Kanban', icon: Columns },
  { key: 'timeline', label: 'Timeline', icon: CalendarRange },
  { key: 'gantt', label: 'Gantt', icon: GanttChartSquare },
];

export function TaskList({
  tasks, loading, projectId, canEdit, showProjectColumn = false, module = 'tasks',
}: {
  tasks: TaskWithContext[];
  loading: boolean;
  projectId?: string;
  canEdit: boolean;
  showProjectColumn?: boolean;
  module?: string;
}) {
  const [mode, setMode] = useState<Mode>('lista');
  const [scale, setScale] = useState<GanttScale>('semana');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<TaskWithContext | null>(null);
  const [creating, setCreating] = useState(false);
  const table = useTableState(module);

  const { data: dependencies = [] } = useQuery({
    queryKey: ['dependencies', projectId],
    queryFn: () => listDependencies(projectId!),
    enabled: Boolean(projectId) && (mode === 'gantt' || mode === 'timeline'),
  });

  const filtered = useMemo(
    () => (statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks),
    [tasks, statusFilter],
  );

  const columns = useMemo<ColumnDef<TaskWithContext, unknown>[]>(() => {
    const base: ColumnDef<TaskWithContext, unknown>[] = [
      { accessorKey: 'code', header: 'Codigo', meta: { label: 'Codigo' }, size: 90,
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted">{getValue() as string}</span> },
      { accessorKey: 'title', header: 'Tarefa', meta: { label: 'Tarefa' }, size: 320,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {row.original.is_milestone && <Badge tone="strategic">Marco</Badge>}
              {row.original.is_critical && <Badge tone="danger">Critica</Badge>}
            </div>
          </div>
        ) },
      { id: 'assignee', accessorFn: (r) => r.assignee?.full_name ?? '', header: 'Responsavel', meta: { label: 'Responsavel' }, size: 180,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <Avatar name={row.original.assignee?.full_name} size="xs" />
            <span className="truncate text-sm">{row.original.assignee?.full_name ?? '—'}</span>
          </span>
        ) },
      { accessorKey: 'status', header: 'Status', meta: { label: 'Status' }, size: 130,
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} /> },
      { accessorKey: 'priority', header: 'Prioridade', meta: { label: 'Prioridade' }, size: 110,
        cell: ({ row }) => <Badge tone={priorityTone[row.original.priority]}>{priorityLabel[row.original.priority]}</Badge> },
      { accessorKey: 'start_date', header: 'Inicio', meta: { label: 'Inicio' }, size: 100,
        cell: ({ getValue }) => formatDate(getValue() as string) },
      { accessorKey: 'due_date', header: 'Termino', meta: { label: 'Termino' }, size: 120,
        cell: ({ row }) => {
          const overdue = row.original.due_date
            && !['concluida', 'cancelada'].includes(row.original.status)
            && (daysBetween(new Date(), row.original.due_date) ?? 0) < 0;
          return <span className={overdue ? 'font-medium text-danger' : ''}>{formatDate(row.original.due_date)}</span>;
        } },
      { id: 'atraso', accessorFn: (r) => {
          if (!r.due_date || ['concluida', 'cancelada'].includes(r.status)) return 0;
          const d = daysBetween(new Date(), r.due_date) ?? 0;
          return d < 0 ? Math.abs(d) : 0;
        }, header: 'Atraso (dias)', meta: { label: 'Atraso (dias)' }, size: 110,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0);
          return v > 0 ? <Badge tone="danger">{v}</Badge> : <span className="text-xs text-muted">—</span>;
        } },
      { accessorKey: 'weight', header: 'Peso', meta: { label: 'Peso' }, size: 80,
        cell: ({ getValue }) => <span className="tabular-nums text-sm">{Number(getValue()).toFixed(1)}</span> },
      { accessorKey: 'progress', header: 'Progresso', meta: { label: 'Progresso' }, size: 140,
        cell: ({ row }) => <Progress value={row.original.progress} size="sm" /> },
    ];
    if (showProjectColumn) {
      base.splice(1, 0, {
        id: 'project', accessorFn: (r) => r.project?.code ?? '', header: 'Projeto', meta: { label: 'Projeto' }, size: 130,
        cell: ({ row }) => <span className="font-mono text-xs text-brand">{row.original.project?.code ?? '—'}</span>,
      });
    }
    return base;
  }, [showProjectColumn]);

  const ganttItems = useMemo(
    () => filtered
      .filter((t) => t.start_date || t.due_date)
      .map((t) => ({
        id: t.id,
        label: `${t.code} · ${t.title}`,
        start: t.start_date ?? t.due_date,
        end: t.due_date ?? t.start_date,
        baselineEnd: t.baseline_due_date,
        baselineStart: t.start_date,
        progress: Number(t.progress),
        isMilestone: t.is_milestone,
        isCritical: t.is_critical,
        tone: t.status === 'bloqueada' ? ('danger' as const)
          : t.status === 'concluida' ? ('ok' as const)
            : t.status === 'em_andamento' ? ('info' as const) : ('neutral' as const),
      })),
    [filtered],
  );

  const ganttDeps = useMemo(
    () => dependencies.map((d) => {
      const pred = filtered.find((t) => t.id === d.predecessor_id);
      const succ = filtered.find((t) => t.id === d.successor_id);
      // Dependencia em risco: predecessora atrasada/bloqueada com sucessora ja iniciando.
      const atRisk = Boolean(
        pred && succ && pred.status !== 'concluida' && pred.due_date && succ.start_date
        && pred.due_date > succ.start_date,
      );
      return { from: d.predecessor_id, to: d.successor_id, atRisk };
    }),
    [dependencies, filtered],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring',
                mode === m.key ? 'bg-brand text-brand-fg' : 'text-muted hover:text-fg',
              )}
            >
              <m.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {Object.entries(taskStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>

        {(mode === 'gantt' || mode === 'timeline') && (
          <Select className="w-auto" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)} aria-label="Escala">
            {(['dia', 'semana', 'mes', 'trimestre', 'ano'] as GanttScale[]).map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
        )}

        {canEdit && projectId && (
          <Button className="ml-auto" onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Nova tarefa</Button>
        )}
      </div>

      {mode === 'lista' ? (
        <DataTable<TaskWithContext>
          data={filtered}
          columns={columns}
          loading={loading}
          state={table.state}
          onStateChange={table.onStateChange}
          onRowClick={(t) => setEditing(t)}
          getRowId={(t) => t.id}
          groupableColumns={[
            { id: 'status', label: 'Status' },
            { id: 'assignee', label: 'Responsavel' },
            ...(showProjectColumn ? [{ id: 'project', label: 'Projeto' }] : []),
          ]}
          exportFileName="tarefas"
          emptyTitle="Nenhuma tarefa encontrada"
        />
      ) : mode === 'kanban' ? (
        <TaskBoard tasks={filtered} onOpen={setEditing} canEdit={canEdit} />
      ) : (
        <div className="card p-2">
          <GanttChart
            items={ganttItems}
            dependencies={mode === 'gantt' ? ganttDeps : []}
            scale={scale}
            onSelect={(id) => setEditing(filtered.find((t) => t.id === id) ?? null)}
          />
        </div>
      )}

      {projectId && (
        <TaskModal
          open={creating || Boolean(editing)}
          onClose={() => { setCreating(false); setEditing(null); }}
          projectId={editing?.project_id ?? projectId}
          task={editing}
          canEdit={canEdit}
        />
      )}
      {!projectId && editing && (
        <TaskModal
          open
          onClose={() => setEditing(null)}
          projectId={editing.project_id}
          task={editing}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
