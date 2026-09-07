import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Table2, LayoutGrid, Columns, GanttChartSquare, Map } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { SavedViewsBar } from '@/components/ui/SavedViewsBar';
import { ErrorState, Spinner } from '@/components/ui/Feedback';
import { GanttChart, type GanttScale } from '@/components/gantt/GanttChart';
import { cn } from '@/utils/cn';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { useTableState } from '@/hooks/useTableState';
import { listProjectOverview } from '@/services/projects';
import { listCalendarEvents, listAllocations } from '@/services/governance';
import { financialColumnKeys, portfolioColumns, portfolioDefaultHidden } from './columns';
import { PortfolioCards, PortfolioKanban } from './PortfolioViews';
import { NewProjectModal } from '@/features/projects/NewProjectModal';
import type { ProjectOverview } from '@/types/domain';
import { healthLabel, projectStatusLabel } from '@/utils/domain-labels';

type ViewMode = 'tabela' | 'kanban' | 'cards' | 'gantt' | 'roadmap';

const modes: { key: ViewMode; label: string; icon: typeof Table2 }[] = [
  { key: 'tabela', label: 'Tabela', icon: Table2 },
  { key: 'kanban', label: 'Kanban', icon: Columns },
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  { key: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { key: 'roadmap', label: 'Roadmap', icon: Map },
];

export function PortfolioPage() {
  useBreadcrumbs([{ label: 'Portfolio de Projetos' }]);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { isPRD } = useEnvironment();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<ViewMode>('tabela');
  const [scale, setScale] = useState<GanttScale>('mes');
  const [creating, setCreating] = useState(false);

  const table = useTableState('portfolio', { visibility: portfolioDefaultHidden });

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', 'overview'],
    queryFn: listProjectOverview,
  });

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: listCalendarEvents,
    enabled: mode === 'gantt' || mode === 'roadmap',
  });

  // Um projeto pode envolver recursos de varias areas - a area nao e' um campo
  // do projeto, e' derivada de quem esta alocado nele (resource_allocations).
  const allocationsQuery = useQuery({ queryKey: ['allocations'], queryFn: () => listAllocations() });

  const statusFilter = params.get('status') ?? '';
  const healthFilter = params.get('health') ?? '';
  const categoryFilter = params.get('categoria') ?? '';
  const areaFilter = params.get('area') ?? '';

  const categories = useMemo(
    () => [...new Set(data.map((p) => p.category))].sort(),
    [data],
  );

  /** Areas participantes de cada projeto: uniao das areas de quem esta alocado nele. */
  const projectAreaNames = useMemo(() => {
    const map = new globalThis.Map<string, Set<string>>();
    for (const a of allocationsQuery.data ?? []) {
      const name = a.profile?.area?.name;
      if (!name) continue;
      const set = map.get(a.project_id) ?? new Set<string>();
      set.add(name);
      map.set(a.project_id, set);
    }
    return map;
  }, [allocationsQuery.data]);

  const areaOptions = useMemo(
    () => [...new Set([...projectAreaNames.values()].flatMap((s) => [...s]))].sort(),
    [projectAreaNames],
  );

  // Sem nenhum projeto usando gestao financeira no escopo carregado, as colunas
  // financeiras (incl. o status "Financeiro") apenas poluiriam a leitura - a
  // pessoa que precisar delas ainda pode ligar o modulo em algum projeto.
  const anyFinancial = useMemo(() => data.some((p) => p.financial_effective_enabled), [data]);
  const areaColumn = useMemo<ColumnDef<ProjectOverview, unknown>>(() => ({
    id: 'area_names', header: 'Areas participantes', meta: { label: 'Areas participantes' }, size: 200,
    accessorFn: (row) => [...(projectAreaNames.get(row.id) ?? [])].sort().join(', '),
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return v ? <span className="text-sm">{v}</span> : <span className="text-xs text-muted">—</span>;
    },
  }), [projectAreaNames]);

  const columns = useMemo(
    () => [
      ...(anyFinancial ? portfolioColumns : portfolioColumns.filter(
        (c) => !financialColumnKeys.includes(String((c as { accessorKey?: string }).accessorKey)),
      )),
      areaColumn,
    ],
    [anyFinancial, areaColumn],
  );

  const projects = useMemo(() => {
    const viewFilters = table.viewFilters as { status?: string[]; health?: string[]; category?: string[] };
    return data.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (healthFilter && p.health !== healthFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (areaFilter && !(projectAreaNames.get(p.id)?.has(areaFilter))) return false;
      if (viewFilters.status?.length && !viewFilters.status.includes(p.status)) return false;
      if (viewFilters.health?.length && !viewFilters.health.includes(p.health)) return false;
      if (viewFilters.category?.length && !viewFilters.category.includes(p.category)) return false;
      return true;
    });
  }, [data, statusFilter, healthFilter, categoryFilter, areaFilter, projectAreaNames, table.viewFilters]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const ganttItems = useMemo(
    () => projects
      .filter((p) => p.start_date)
      .map((p) => ({
        id: p.id,
        label: p.code,
        sublabel: p.name.length > 34 ? `${p.name.slice(0, 34)}…` : p.name,
        start: p.start_date,
        end: p.target_date ?? p.start_date,
        progress: Number(p.progress_actual),
        tone: p.health === 'verde' ? ('ok' as const)
          : p.health === 'amarelo' ? ('warn' as const)
            : p.health === 'vermelho' ? ('danger' as const) : ('neutral' as const),
        isCritical: p.priority === 'critica',
      })),
    [projects],
  );

  const bands = useMemo(
    () => calendarEvents
      .filter((e) => e.is_freeze || e.severity === 'critica')
      .map((e) => ({ start: e.start_date, end: e.end_date, label: e.name, tone: e.is_freeze ? ('danger' as const) : ('warn' as const) })),
    [calendarEvents],
  );

  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Portfolio de Projetos"
        description={`${projects.length} de ${data.length} projeto(s) no escopo autorizado.`}
        actions={
          can('project.create') && (
            <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo projeto</Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

        <Select className="w-auto" value={statusFilter} onChange={(e) => setFilter('status', e.target.value)} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {Object.entries(projectStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>

        <Select className="w-auto" value={healthFilter} onChange={(e) => setFilter('health', e.target.value)} aria-label="Filtrar por saude">
          <option value="">Toda a saude</option>
          {Object.entries(healthLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>

        <Select className="w-auto" value={categoryFilter} onChange={(e) => setFilter('categoria', e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>

        <Select
          className="w-auto" value={areaFilter} onChange={(e) => setFilter('area', e.target.value)}
          aria-label="Filtrar por area"
        >
          <option value="">Todas as areas</option>
          {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>

        <SavedViewsBar
          views={table.views}
          activeView={table.activeView}
          onApply={table.applyView}
          onSave={(name, scope) => table.saveView.mutate({ name, scope })}
          onUpdate={(id) => table.updateView.mutate(id)}
          onDelete={(id) => table.removeView.mutate(id)}
        />

        {(mode === 'gantt' || mode === 'roadmap') && (
          <Select className="w-auto" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)} aria-label="Escala do cronograma">
            {(['dia', 'semana', 'mes', 'trimestre', 'ano'] as GanttScale[]).map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
        )}
      </div>

      {isLoading ? (
        <Spinner label="Carregando portfolio" />
      ) : mode === 'tabela' ? (
        <DataTable<ProjectOverview>
          data={projects}
          columns={columns}
          state={table.state}
          onStateChange={table.onStateChange}
          onRowClick={(row) => navigate(`/projetos/${row.id}`)}
          getRowId={(row) => row.id}
          groupableColumns={[
            { id: 'category', label: 'Categoria' },
            { id: 'status', label: 'Status' },
            { id: 'health', label: 'Saude' },
            { id: 'owner_name', label: 'Owner' },
            { id: 'company_name', label: 'Empresa' },
          ]}
          exportFileName="portfolio-projetos"
          emptyTitle={
            isPRD && data.length === 0
              ? 'Nenhum projeto cadastrado em Produção'
              : 'Nenhum projeto encontrado'
          }
          emptyDescription={
            isPRD && data.length === 0
              ? 'Comece cadastrando o primeiro projeto oficial do portfólio. Dados de QA não são replicados para Produção.'
              : 'Ajuste os filtros ou crie um novo projeto.'
          }
        />
      ) : mode === 'kanban' ? (
        <PortfolioKanban projects={projects} />
      ) : mode === 'cards' ? (
        <PortfolioCards projects={projects} />
      ) : (
        <div className="card p-2">
          <GanttChart
            items={mode === 'roadmap' ? ganttItems.map((i) => ({ ...i, sublabel: undefined })) : ganttItems}
            bands={bands}
            scale={mode === 'roadmap' ? 'trimestre' : scale}
            onSelect={(id) => navigate(`/projetos/${id}`)}
            emptyText="Nenhum projeto com data de inicio definida."
          />
        </div>
      )}

      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
