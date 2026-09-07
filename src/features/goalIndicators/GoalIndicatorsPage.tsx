import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, Target, TrendingUp } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { ChartCard } from '@/components/charts/ChartCard';
import { GoalThermometerGauge } from '@/components/charts/GoalThermometerGauge';
import { ErrorState, Spinner, EmptyState } from '@/components/ui/Feedback';
import { useTableState } from '@/hooks/useTableState';
import { listProjectOverview } from '@/services/projects';
import { listAllTaskGoalScores } from '@/services/goalIndicators';
import { formatDate } from '@/utils/format';
import type { ProjectOverview } from '@/types/domain';

/** Faixas visuais do item 33/34: verde da Meta pra cima, ambar abaixo, vermelho so no minimo. */
function scoreTone(score: number | null): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 10) return 'ok';
  if (score > 1) return 'warn';
  return 'danger';
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'Pendente';
  if (score >= 15) return 'Desafio';
  if (score >= 10) return 'Meta atingida';
  if (score > 1) return 'Abaixo da Meta';
  return 'Racional minimo';
}

export function GoalIndicatorsPage() {
  useBreadcrumbs([{ label: 'Indicadores de Metas' }]);

  const projectsQuery = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });
  const scoresQuery = useQuery({ queryKey: ['goal-scores', 'all'], queryFn: listAllTaskGoalScores });
  const table = useTableState('indicadores-metas');

  const measured = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.goal_indicator_enabled),
    [projectsQuery.data],
  );

  const kpis = useMemo(() => {
    const withValue = measured
      .map((p) => p.goal_indicator_realized ?? p.goal_indicator_projected)
      .filter((v): v is number => v != null);
    const consolidated = withValue.length
      ? Math.round((withValue.reduce((s, v) => s + v, 0) / withValue.length) * 100) / 100
      : null;
    const aboveTarget = withValue.filter((v) => v >= 10).length;
    const belowTarget = withValue.filter((v) => v < 10).length;
    const pendingDeliveries = measured.reduce((s, p) => s + (p.goal_deliveries_pending ?? 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdueDeliveries = (scoresQuery.data ?? [])
      .filter((s) => s.actual_date == null && s.target_date && s.target_date < today).length;
    return { consolidated, aboveTarget, belowTarget, pendingDeliveries, overdueDeliveries };
  }, [measured, scoresQuery.data]);

  const columns = useMemo<ColumnDef<ProjectOverview, unknown>[]>(() => [
    {
      accessorKey: 'code', header: 'Projeto', meta: { label: 'Projeto' }, size: 260,
      cell: ({ row }) => (
        <Link to={`/projetos/${row.original.id}/meta-prazo`} className="min-w-0 block" onClick={(e) => e.stopPropagation()}>
          <p className="truncate text-sm font-medium text-brand hover:underline">{row.original.name}</p>
          <p className="font-mono text-xs text-muted">{row.original.code}</p>
        </Link>
      ),
    },
    { accessorKey: 'owner_name', header: 'Owner', meta: { label: 'Owner' }, size: 160,
      cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) ?? '—'}</span> },
    {
      accessorKey: 'goal_deliveries_pending', header: 'Entregas pendentes',
      meta: { label: 'Entregas pendentes', exportType: 'integer' }, size: 150,
      cell: ({ getValue }) => <span className="tabular-nums text-sm">{Number(getValue() ?? 0)}</span>,
    },
    {
      accessorKey: 'goal_indicator_realized', header: 'Nota realizada',
      meta: { label: 'Nota realizada', exportType: 'number' }, size: 140,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v == null
          ? <span className="text-xs text-muted">Pendente</span>
          : <span className="tabular-nums text-sm font-medium">{v.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: 'goal_indicator_projected', header: 'Nota projetada',
      meta: { label: 'Nota projetada', exportType: 'number' }, size: 140,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v == null
          ? <span className="text-xs text-muted">—</span>
          : <span className="tabular-nums text-sm text-muted">{v.toFixed(2)}</span>;
      },
    },
    {
      id: 'status_meta', header: 'Status da Meta', meta: { label: 'Status da Meta', exportable: false }, size: 160,
      accessorFn: (row) => row.goal_indicator_realized ?? row.goal_indicator_projected,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <Badge tone={scoreTone(v)}>{scoreLabel(v)}</Badge>;
      },
    },
    {
      accessorKey: 'next_milestone_date', header: 'Proxima entrega', meta: { label: 'Proxima entrega', exportType: 'date' }, size: 160,
      cell: ({ row }) => row.original.next_milestone_name ? (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.next_milestone_name}</p>
          <p className="text-xs text-muted">{formatDate(row.original.next_milestone_date)}</p>
        </div>
      ) : <span className="text-xs text-muted">—</span>,
    },
  ], []);

  if (projectsQuery.isError) {
    return <ErrorState message={(projectsQuery.error as Error).message} onRetry={() => projectsQuery.refetch()} />;
  }
  if (projectsQuery.isLoading) return <Spinner label="Carregando indicadores" />;

  return (
    <>
      <PageHeader
        title="Indicadores de Metas"
        description="Nota de aderencia a prazo das entregas (1 a 15), calculada automaticamente a partir do cronograma. Projetos sem o indicador habilitado nao aparecem aqui."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Indicador Consolidado"
          value={kpis.consolidated != null ? kpis.consolidated.toFixed(2) : '—'}
          icon={<Target className="h-4 w-4" />}
          tone={kpis.consolidated != null ? (kpis.consolidated >= 10 ? 'ok' : 'warn') : 'default'}
          hint="Media simples do indicador (realizado, ou projetado quando ainda nao ha entregas concluidas) entre os projetos mensurados."
        />
        <KpiCard label="Projetos Mensurados" value={measured.length} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Projetos ≥ Meta" value={kpis.aboveTarget} tone="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Projetos abaixo da Meta" value={kpis.belowTarget} tone={kpis.belowTarget > 0 ? 'warn' : 'default'} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Entregas Pendentes" value={kpis.pendingDeliveries} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Entregas Atrasadas" value={kpis.overdueDeliveries} tone={kpis.overdueDeliveries > 0 ? 'danger' : 'default'} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {measured.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhum projeto com Indicador de Metas ativo"
            description="Habilite o indicador na aba 'Indicador de Meta' de um projeto e marque quais entregas compoem a meta."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-1"
              title="Indicador consolidado do portfolio"
              description="Media da nota atual (realizada, ou projetada) entre os projetos mensurados"
              empty={kpis.consolidated == null}
            >
              <div className="flex h-[220px] flex-col justify-center px-1">
                <GoalThermometerGauge value={kpis.consolidated} target={10} challenge={15} />
              </div>
            </ChartCard>

            <div className="lg:col-span-2">
              <DataTable<ProjectOverview>
                data={measured}
                columns={columns}
                state={table.state}
                onStateChange={table.onStateChange}
                getRowId={(row) => row.id}
                exportFileName="indicadores-de-metas"
                emptyTitle="Nenhum projeto mensurado"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
