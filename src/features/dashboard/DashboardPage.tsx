import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FolderKanban, Gavel,
  ShieldAlert, TrendingUp, Activity,
} from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { CriticalityBadge } from '@/components/ui/StatusBadges';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartColors, categoricalColor } from '@/components/charts/chartTheme';
import {
  formatCurrencyCompact, formatCurrency, formatDate, formatMonth, formatPercent,
  relativeFromNow, daysBetween,
} from '@/utils/format';
import { auditActionLabel, entityLabel } from '@/utils/domain-labels';
import { listProjectOverview } from '@/services/projects';
import { getFinancialCurve } from '@/services/financial';
import { listRisks } from '@/services/risks';
import { listUpcomingMilestones } from '@/services/tasks';
import { listCapacity, listDecisions, listRecentActivity, listCalendarConflicts } from '@/services/governance';
import {
  areaCapacity, consolidateCurve, currentMonthKey, financialByProject, groupCount, healthDistribution,
  portfolioKpis, progressByProject, teamCapacity,
} from './selectors';

const healthColorKey: Record<string, keyof ReturnType<typeof chartColors>> = {
  verde: 'ok', amarelo: 'warn', vermelho: 'danger', cinza: 'muted',
};

export function DashboardPage() {
  useBreadcrumbs([{ label: 'Visao Executiva' }]);
  const navigate = useNavigate();
  const colors = chartColors();

  const projectsQuery = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });
  const curveQuery = useQuery({ queryKey: ['financial', 'curve'], queryFn: () => getFinancialCurve() });
  const risksQuery = useQuery({ queryKey: ['risks', 'all'], queryFn: () => listRisks() });
  const milestonesQuery = useQuery({ queryKey: ['milestones', 'upcoming', 30], queryFn: () => listUpcomingMilestones(30) });
  const capacityQuery = useQuery({ queryKey: ['capacity'], queryFn: listCapacity });
  const decisionsQuery = useQuery({ queryKey: ['decisions', 'all'], queryFn: () => listDecisions() });
  const activityQuery = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => listRecentActivity(10) });
  const conflictsQuery = useQuery({ queryKey: ['calendar', 'conflicts'], queryFn: listCalendarConflicts });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const kpis = useMemo(() => portfolioKpis(projects), [projects]);
  const health = useMemo(() => healthDistribution(projects), [projects]);
  const byCategory = useMemo(() => groupCount(projects, (p) => p.category), [projects]);
  const byOwner = useMemo(() => groupCount(projects, (p) => p.owner_name).slice(0, 6), [projects]);
  const progressBars = useMemo(() => progressByProject(projects, 8), [projects]);
  const anyFinancial = useMemo(() => projects.some((p) => p.financial_effective_enabled), [projects]);
  const enabledProjectIds = useMemo(
    () => new Set(projects.filter((p) => p.financial_effective_enabled).map((p) => p.id)),
    [projects],
  );
  const financialBars = useMemo(() => financialByProject(projects, 6), [projects]);
  const curve = useMemo(
    () => consolidateCurve(curveQuery.data ?? [], enabledProjectIds),
    [curveQuery.data, enabledProjectIds],
  );
  const capacity = useMemo(
    () => teamCapacity(capacityQuery.data ?? [], currentMonthKey()),
    [capacityQuery.data],
  );
  const capacityByArea = useMemo(
    () => areaCapacity(capacityQuery.data ?? [], currentMonthKey()),
    [capacityQuery.data],
  );

  const topRisks = useMemo(
    () => (risksQuery.data ?? [])
      .filter((r) => r.status === 'aberto' || r.status === 'em_tratamento')
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
    [risksQuery.data],
  );

  const pendingDecisions = useMemo(
    () => (decisionsQuery.data ?? [])
      .filter((d) => d.status === 'aguardando_decisao')
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')),
    [decisionsQuery.data],
  );

  const milestoneBuckets = useMemo(() => {
    const list = milestonesQuery.data ?? [];
    const inDays = (n: number) => list.filter((m) => {
      const d = daysBetween(new Date(), m.due_date);
      return d != null && d >= 0 && d <= n;
    });
    return { d7: inDays(7), d15: inDays(15), d30: inDays(30) };
  }, [milestonesQuery.data]);

  if (projectsQuery.isError) {
    return <ErrorState message={(projectsQuery.error as Error).message} onRetry={() => projectsQuery.refetch()} />;
  }

  const loading = projectsQuery.isLoading;

  return (
    <>
      <PageHeader
        title="Visao Executiva"
        description="Leitura consolidada do portfolio da Contabilidade. Clique nos indicadores para abrir os registros que os compoem."
        actions={
          kpis.lastUpdateAt && (
            <span className="text-xs text-muted">
              Ultima atualizacao do portfolio: {relativeFromNow(kpis.lastUpdateAt)}
            </span>
          )
        }
      />

      {/* KPIs de execucao */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          label="Projetos ativos" value={loading ? '—' : kpis.active}
          icon={<FolderKanban className="h-4 w-4" />}
          deltaLabel={`${kpis.total} no portfolio`}
          onClick={() => navigate('/portfolio?status=em_andamento')}
          hint="Projetos em planejamento ou em andamento."
        />
        <KpiCard
          label="No prazo" value={loading ? '—' : kpis.onTrack} tone="ok"
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => navigate('/portfolio?health=verde')}
        />
        <KpiCard
          label="Em atencao" value={loading ? '—' : kpis.attention} tone="warn"
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={() => navigate('/portfolio?health=amarelo')}
        />
        <KpiCard
          label="Criticos" value={loading ? '—' : kpis.critical} tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
          onClick={() => navigate('/portfolio?health=vermelho')}
        />
        <KpiCard
          label="Avanco medio" value={loading ? '—' : formatPercent(kpis.avgProgress)}
          delta={kpis.progressDeviation}
          deltaLabel={`plan. ${formatPercent(kpis.avgPlanned)}`}
          tone={kpis.progressDeviation < -5 ? 'warn' : 'default'}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="Avanco realizado medio dos projetos ativos, comparado ao planejado."
        />
      </div>

      {/* KPIs financeiros (so quando ha projeto com o modulo ativo no escopo) e de governanca */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        {(loading || anyFinancial) && (
          <>
            <KpiCard label="Orcamento" value={loading ? '—' : formatCurrencyCompact(kpis.budget)}
              hint={formatCurrency(kpis.budget)} />
            <KpiCard label="Realizado" value={loading ? '—' : formatCurrencyCompact(kpis.actual)}
              hint={formatCurrency(kpis.actual)} />
            <KpiCard label="Comprometido" value={loading ? '—' : formatCurrencyCompact(kpis.committed)}
              hint={formatCurrency(kpis.committed)} />
            <KpiCard
              label="Forecast" value={loading ? '—' : formatCurrencyCompact(kpis.forecast)}
              delta={kpis.forecastVariancePct} invertColors
              deltaLabel="vs orcamento"
              tone={kpis.forecastVariancePct > 5 ? 'danger' : 'default'}
              hint={`Variacao: ${formatCurrency(kpis.forecastVariance)}`}
            />
          </>
        )}
        <KpiCard
          label="Concluidos" value={loading ? '—' : kpis.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => navigate('/portfolio?status=concluido')}
        />
        <KpiCard
          label="Riscos criticos" value={loading ? '—' : kpis.criticalRisks} tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
          onClick={() => navigate('/riscos?criticidade=critico')}
        />
        <KpiCard
          label="Decisoes pendentes" value={loading ? '—' : kpis.pendingDecisions} tone="strategic"
          icon={<Gavel className="h-4 w-4" />}
          onClick={() => navigate('/relatorios/decisoes-pendentes')}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Tarefas vencidas" value={loading ? '—' : kpis.overdueTasks} tone="danger"
          icon={<Clock className="h-4 w-4" />} onClick={() => navigate('/tarefas?vencidas=1')} />
        <KpiCard label="Acoes vencidas" value={loading ? '—' : kpis.overdueActions} tone="warn"
          icon={<Clock className="h-4 w-4" />} onClick={() => navigate('/riscos?tab=acoes&vencidas=1')} />
        <KpiCard label="Marcos em 7 dias" value={loading ? '—' : milestoneBuckets.d7.length}
          icon={<CalendarClock className="h-4 w-4" />} deltaLabel={`${milestoneBuckets.d30.length} em 30 dias`}
          onClick={() => navigate('/cronograma')} />
        <KpiCard
          label="Conflitos com fechamento"
          value={loading ? '—' : (conflictsQuery.data ?? []).length}
          tone={(conflictsQuery.data ?? []).length > 0 ? 'warn' : 'default'}
          icon={<CalendarClock className="h-4 w-4" />}
          hint="Marcos que caem dentro de janelas criticas da Contabilidade."
          onClick={() => navigate('/calendario')}
        />
      </div>

      {/* Graficos */}
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <ChartCard title="Saude do portfolio" description="Distribuicao por status de saude" loading={loading} empty={health.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={health} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {health.map((slice) => (
                  <Cell key={slice.key} fill={colors[healthColorKey[slice.key] ?? 'muted'] as string} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8}
                formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Avanco por projeto: planejado x realizado"
          description="Projetos ordenados pelo maior desvio negativo"
          loading={loading}
          empty={progressBars.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={progressBars} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="code" width={92} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(v)} />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
              <Bar dataKey="planned" name="Planejado" fill={colors.muted} radius={[0, 3, 3, 0]} maxBarSize={9} />
              <Bar dataKey="actual" name="Realizado" fill={colors.brand} radius={[0, 3, 3, 0]} maxBarSize={9} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {(loading || anyFinancial) && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Evolucao financeira do portfolio"
            description="Planejado x realizado x forecast por competencia"
            loading={curveQuery.isLoading}
            empty={curve.length === 0}
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={curve} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: colors.muted }} />
                <YAxis tickFormatter={(v) => formatCurrencyCompact(v).replace('R$ ', '')} tick={{ fontSize: 11, fill: colors.muted }} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} labelFormatter={formatMonth} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
                <Bar dataKey="planned" name="Planejado" fill={colors.muted} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="actual" name="Realizado" fill={colors.brand} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line dataKey="forecast" name="Forecast" stroke={colors.strategic} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Orcamento x realizado x forecast por projeto"
            description="Seis maiores orcamentos da carteira"
            loading={loading}
            empty={financialBars.length === 0}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={financialBars} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis dataKey="code" tick={{ fontSize: 10, fill: colors.muted }} interval={0} angle={-12} textAnchor="end" height={44} />
                <YAxis tickFormatter={(v) => formatCurrencyCompact(v).replace('R$ ', '')} tick={{ fontSize: 11, fill: colors.muted }} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
                <Bar dataKey="budget" name="Orcamento" fill={colors.muted} radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="actual" name="Realizado" fill={colors.brand} radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="forecast" name="Forecast" fill={colors.strategic} radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <ChartCard title="Projetos por categoria" loading={loading} empty={byCategory.length === 0} height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="label" width={128} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Projetos" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {byCategory.map((_, i) => <Cell key={i} fill={categoricalColor(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Projetos por responsavel" loading={loading} empty={byOwner.length === 0} height={220}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byOwner} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="label" width={128} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Projetos" fill={colors.info} radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Capacidade das equipes"
          description="Alocacao sobre a capacidade do mes corrente"
          loading={capacityQuery.isLoading}
          empty={capacity.length === 0}
          height={220}
          action={<Link to="/recursos" className="text-xs text-brand hover:underline">Detalhar</Link>}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={capacity} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="team" width={128} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(v)} />} />
              <Bar dataKey="pct" name="Alocacao" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {capacity.map((c, i) => (
                  <Cell key={i} fill={c.pct > 100 ? colors.danger : c.pct > 85 ? colors.warn : colors.ok} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-1">
        <ChartCard
          title="Capacidade por area"
          description="Utilizacao consolidada por area organizacional no mes corrente"
          loading={capacityQuery.isLoading}
          empty={capacityByArea.length === 0}
          height={220}
          action={<Link to="/recursos" className="text-xs text-brand hover:underline">Detalhar</Link>}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={capacityByArea} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="area" width={160} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(v)} />} />
              <Bar dataKey="pct" name="Utilizacao" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {capacityByArea.map((c, i) => (
                  <Cell key={i} fill={c.pct > 100 ? colors.danger : c.pct > 85 ? colors.warn : colors.ok} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Listas operacionais */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <PanelList
          title="Riscos prioritarios"
          action={<Link to="/riscos" className="text-xs text-brand hover:underline">Ver todos</Link>}
          loading={risksQuery.isLoading}
          empty={topRisks.length === 0}
          emptyText="Nenhum risco aberto no portfolio."
        >
          {topRisks.map((r) => (
            <li key={r.id} className="py-2.5">
              <Link to={`/projetos/${r.project_id}/riscos`} className="group block">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm text-fg group-hover:text-brand">{r.title}</p>
                  <CriticalityBadge score={r.score} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {r.project?.code} · {r.owner?.full_name ?? 'Sem responsavel'}
                  {!r.mitigation_plan && <span className="ml-1 text-danger">· sem plano</span>}
                </p>
              </Link>
            </li>
          ))}
        </PanelList>

        <PanelList
          title="Proximos marcos"
          action={<span className="text-xs text-muted">{milestoneBuckets.d30.length} em 30 dias</span>}
          loading={milestonesQuery.isLoading}
          empty={milestoneBuckets.d30.length === 0}
          emptyText="Nenhum marco nos proximos 30 dias."
        >
          {milestoneBuckets.d30.slice(0, 6).map((m) => {
            const days = daysBetween(new Date(), m.due_date) ?? 0;
            return (
              <li key={m.id} className="py-2.5">
                <Link to={`/projetos/${m.project_id}/cronograma`} className="group block">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm text-fg group-hover:text-brand">{m.name}</p>
                    <Badge tone={days <= 7 ? 'danger' : days <= 15 ? 'warn' : 'info'}>
                      {days === 0 ? 'hoje' : `${days}d`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{m.project?.code} · {formatDate(m.due_date)}</p>
                </Link>
              </li>
            );
          })}
        </PanelList>

        <PanelList
          title="Decisoes pendentes"
          action={<Link to="/relatorios/decisoes-pendentes" className="text-xs text-brand hover:underline">Ver todas</Link>}
          loading={decisionsQuery.isLoading}
          empty={pendingDecisions.length === 0}
          emptyText="Nenhuma decisao aguardando deliberacao."
        >
          {pendingDecisions.slice(0, 6).map((d) => {
            const days = d.deadline ? daysBetween(new Date(), d.deadline) : null;
            return (
              <li key={d.id} className="py-2.5">
                <Link to={`/projetos/${d.project_id}/decisoes`} className="group block">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm text-fg group-hover:text-brand">{d.subject}</p>
                    {days != null && (
                      <Badge tone={days < 0 ? 'danger' : days <= 5 ? 'warn' : 'neutral'}>
                        {days < 0 ? `${Math.abs(days)}d atraso` : `${days}d`}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {d.project?.code} · decisor: {d.decider?.full_name ?? '—'}
                  </p>
                </Link>
              </li>
            );
          })}
        </PanelList>

        <PanelList
          title="Atividade recente"
          action={<Link to="/auditoria" className="text-xs text-brand hover:underline">Trilha completa</Link>}
          loading={activityQuery.isLoading}
          empty={(activityQuery.data ?? []).length === 0}
          emptyText="Sem movimentacao registrada."
        >
          {(activityQuery.data ?? []).map((a) => (
            <li key={a.id} className="flex items-start gap-2 py-2.5">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="text-sm text-fg">
                  <span className="font-medium">{a.user_name ?? 'Sistema'}</span>{' '}
                  <span className="text-muted">
                    {auditActionLabel[a.action].toLowerCase()} em {entityLabel[a.entity] ?? a.entity}
                  </span>
                </p>
                <p className="text-xs text-muted">{relativeFromNow(a.occurred_at)}</p>
              </div>
            </li>
          ))}
        </PanelList>
      </div>

      {/* Alerta de conflito com o calendario contabil */}
      {(conflictsQuery.data ?? []).length > 0 && (
        <section className="mt-3 card border-warn/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warn" />
            <h2 className="text-sm font-semibold">Entregas em janela critica da Contabilidade</h2>
          </div>
          <ul className="divide-y divide-border">
            {(conflictsQuery.data ?? []).slice(0, 5).map((c) => (
              <li key={`${c.milestone_id}-${c.event_id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link to={`/projetos/${c.project_id}`} className="font-medium text-brand hover:underline">{c.project_code}</Link>
                <span className="text-fg">{c.milestone_name}</span>
                <span className="text-muted">em {formatDate(c.due_date)}</span>
                <Badge tone={c.is_freeze ? 'danger' : 'warn'}>{c.event_name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PanelList({
  title, action, loading, empty, emptyText, children,
}: {
  title: string; action?: React.ReactNode; loading?: boolean;
  empty?: boolean; emptyText: string; children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <header className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {loading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : empty ? (
        <p className="py-6 text-center text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

