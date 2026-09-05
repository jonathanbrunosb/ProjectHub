import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { ProjectOverview } from '@/types/domain';
import { HealthBadge, PriorityBadge, ProjectStatusBadge } from '@/components/ui/StatusBadges';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, formatPercent, relativeFromNow } from '@/utils/format';

/** Chaves financeiras: filtradas do portfolio inteiro quando nenhum projeto do
 * escopo usa gestao financeira (ver PortfolioPage), para nao poluir a tabela
 * com colunas irrelevantes ao contexto. */
export const financialColumnKeys = ['financial_effective_enabled', 'budget', 'actual', 'committed', 'forecast', 'forecast_variance_pct'];

/**
 * Colunas padrao do Portfolio. `meta.label` alimenta o seletor de colunas e a
 * exportacao; `meta.exportable: false` remove colunas puramente visuais e
 * `meta.exportType` faz o Excel receber moeda, percentual e data como valores
 * de verdade - sem isso tudo chegaria na planilha como texto.
 */
export const portfolioColumns: ColumnDef<ProjectOverview, unknown>[] = [
  {
    accessorKey: 'code',
    header: 'Codigo',
    meta: { label: 'Codigo' },
    size: 120,
    cell: ({ row }) => (
      <Link
        to={`/projetos/${row.original.id}`}
        className="font-mono text-xs font-medium text-brand hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.code}
      </Link>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Projeto',
    meta: { label: 'Projeto' },
    size: 300,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{row.original.name}</p>
        {row.original.phase && <p className="truncate text-xs text-muted">Fase: {row.original.phase}</p>}
      </div>
    ),
  },
  { accessorKey: 'category', header: 'Categoria', meta: { label: 'Categoria' }, size: 150 },
  { accessorKey: 'sponsor_name', header: 'Sponsor', meta: { label: 'Sponsor' }, size: 160,
    cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'owner_name', header: 'Owner', meta: { label: 'Owner' }, size: 160,
    cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'team_name', header: 'Equipe', meta: { label: 'Equipe' }, size: 160,
    cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'company_name', header: 'Empresa', meta: { label: 'Empresa/unidade' }, size: 170,
    cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) ?? '—'}</span> },
  {
    accessorKey: 'priority', header: 'Prioridade', meta: { label: 'Prioridade' }, size: 120,
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'status', header: 'Status', meta: { label: 'Status' }, size: 140,
    cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'health', header: 'Saude', meta: { label: 'Saude' }, size: 130,
    cell: ({ row }) => <HealthBadge health={row.original.health} manual={row.original.health_is_manual} />,
  },
  { accessorKey: 'start_date', header: 'Inicio', meta: { label: 'Data inicio', exportType: 'date' }, size: 110,
    cell: ({ getValue }) => formatDate(getValue() as string) },
  { accessorKey: 'target_date', header: 'Data-alvo', meta: { label: 'Data-alvo', exportType: 'date' }, size: 110,
    cell: ({ getValue }) => formatDate(getValue() as string) },
  {
    accessorKey: 'progress_planned', header: 'Avanco planejado', meta: { label: 'Avanco planejado', exportType: 'percent' }, size: 130,
    cell: ({ getValue }) => <span className="tabular-nums text-sm">{formatPercent(getValue() as number)}</span>,
  },
  {
    accessorKey: 'progress_actual', header: 'Avanco realizado', meta: { label: 'Avanco realizado', exportType: 'percent' }, size: 170,
    cell: ({ row }) => (
      <Progress value={row.original.progress_actual} planned={row.original.progress_planned} size="sm" />
    ),
  },
  {
    accessorKey: 'days_overdue', header: 'Desvio de prazo', meta: { label: 'Desvio de prazo', exportType: 'integer' }, size: 130,
    cell: ({ row }) => {
      const d = Number(row.original.days_overdue ?? 0);
      return d > 0
        ? <Badge tone="danger">{d} dias em atraso</Badge>
        : <span className="text-xs text-muted">No prazo</span>;
    },
  },
  {
    accessorKey: 'financial_effective_enabled', header: 'Financeiro', meta: { label: 'Financeiro' }, size: 110,
    cell: ({ getValue }) => (
      <Badge tone={getValue() ? 'strategic' : 'neutral'}>{getValue() ? 'Ativo' : 'Inativo'}</Badge>
    ),
  },
  { accessorKey: 'budget', header: 'Orcamento', meta: { label: 'Orcamento', exportType: 'currency' }, size: 140,
    cell: ({ getValue }) => <span className="tabular-nums text-sm">{formatCurrency(getValue() as number)}</span> },
  { accessorKey: 'actual', header: 'Realizado', meta: { label: 'Realizado', exportType: 'currency' }, size: 140,
    cell: ({ getValue }) => <span className="tabular-nums text-sm">{formatCurrency(getValue() as number)}</span> },
  { accessorKey: 'committed', header: 'Comprometido', meta: { label: 'Comprometido', exportType: 'currency' }, size: 140,
    cell: ({ getValue }) => <span className="tabular-nums text-sm">{formatCurrency(getValue() as number)}</span> },
  { accessorKey: 'forecast', header: 'Forecast', meta: { label: 'Forecast', exportType: 'currency' }, size: 140,
    cell: ({ getValue }) => <span className="tabular-nums text-sm">{formatCurrency(getValue() as number)}</span> },
  {
    accessorKey: 'forecast_variance_pct', header: 'Desvio financeiro', meta: { label: 'Desvio financeiro', exportType: 'percent' }, size: 140,
    cell: ({ getValue }) => {
      const v = Number(getValue() ?? 0);
      return (
        <span className={`tabular-nums text-sm ${v > 5 ? 'text-danger' : v > 0 ? 'text-warn' : 'text-ok'}`}>
          {v > 0 ? '+' : ''}{formatPercent(v)}
        </span>
      );
    },
  },
  {
    accessorKey: 'critical_risks', header: 'Riscos criticos', meta: { label: 'Riscos criticos', exportType: 'integer' }, size: 120,
    cell: ({ getValue }) => {
      const n = Number(getValue() ?? 0);
      return n > 0 ? <Badge tone="danger">{n}</Badge> : <span className="text-xs text-muted">0</span>;
    },
  },
  {
    accessorKey: 'goal_indicator_realized', header: 'Indicador Realizado', meta: { label: 'Indicador Realizado', exportType: 'number' }, size: 150,
    cell: ({ row }) => row.original.goal_indicator_enabled
      ? <span className="tabular-nums text-sm">{row.original.goal_indicator_realized?.toFixed(2) ?? 'Pendente'}</span>
      : <span className="text-xs text-muted">—</span>,
  },
  {
    accessorKey: 'goal_indicator_projected', header: 'Indicador Projetado', meta: { label: 'Indicador Projetado', exportType: 'number' }, size: 150,
    cell: ({ row }) => row.original.goal_indicator_enabled && row.original.goal_indicator_projected != null
      ? <span className="tabular-nums text-sm text-muted">{row.original.goal_indicator_projected.toFixed(2)}</span>
      : <span className="text-xs text-muted">—</span>,
  },
  {
    id: 'goal_status', header: 'Status da Meta', meta: { label: 'Status da Meta', exportable: false }, size: 150,
    accessorFn: (row) => row.goal_indicator_realized ?? row.goal_indicator_projected,
    cell: ({ row }) => {
      if (!row.original.goal_indicator_enabled) return <span className="text-xs text-muted">—</span>;
      const v = row.original.goal_indicator_realized ?? row.original.goal_indicator_projected;
      if (v == null) return <Badge tone="neutral">Pendente</Badge>;
      return <Badge tone={v >= 10 ? 'ok' : v > 1 ? 'warn' : 'danger'}>{v >= 10 ? 'Acima da Meta' : v > 1 ? 'Abaixo da Meta' : 'Racional minimo'}</Badge>;
    },
  },
  {
    accessorKey: 'next_milestone_date', header: 'Proxima entrega', meta: { label: 'Proxima entrega', exportType: 'date' }, size: 190,
    cell: ({ row }) => row.original.next_milestone_name ? (
      <div className="min-w-0">
        <p className="truncate text-sm">{row.original.next_milestone_name}</p>
        <p className="text-xs text-muted">{formatDate(row.original.next_milestone_date)}</p>
      </div>
    ) : <span className="text-xs text-muted">—</span>,
  },
  {
    accessorKey: 'last_update_at', header: 'Ultima atualizacao', meta: { label: 'Ultima atualizacao', exportType: 'datetime' }, size: 150,
    cell: ({ getValue }) => <span className="text-xs text-muted">{relativeFromNow(getValue() as string)}</span>,
  },
];

/** Colunas ocultas por padrao para nao poluir a leitura inicial da tabela. */
export const portfolioDefaultHidden = {
  company_name: false,
  committed: false,
  actual: false,
  progress_planned: false,
  start_date: false,
  goal_indicator_realized: false,
  goal_indicator_projected: false,
  goal_status: false,
};
