import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { HealthBadge, CriticalityBadge, DecisionStatusBadge } from '@/components/ui/StatusBadges';
import { Progress } from '@/components/ui/Progress';
import { listProjectOverview } from '@/services/projects';
import { listRisks, listActionPlans } from '@/services/risks';
import { listTasks, listMilestones } from '@/services/tasks';
import { listCapacity, listDecisions, listAuditLog } from '@/services/governance';
import { portfolioKpis, currentMonthKey, areaCapacity } from '@/features/dashboard/selectors';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, daysBetween } from '@/utils/format';
import { auditActionLabel, projectStatusLabel } from '@/utils/domain-labels';
import { reports } from './reportDefinitions';
import { useReportExport } from './useReportExport';

export function ReportDetailPage() {
  const { reportKey = '' } = useParams();
  const definition = reports.find((r) => r.key === reportKey);
  useBreadcrumbs([
    { label: 'Governanca' },
    { label: 'Relatorios', to: '/relatorios' },
    { label: definition?.title ?? 'Relatorio' },
  ]);
  const { exportReport, isExporting, isBusy, canExport } = useReportExport();

  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });
  const risks = useQuery({
    queryKey: ['risks', 'all'], queryFn: () => listRisks(),
    enabled: ['riscos', 'steering-committee', 'status-report-executivo'].includes(reportKey),
  });
  const actions = useQuery({
    queryKey: ['actions', 'all'], queryFn: () => listActionPlans(),
    enabled: reportKey === 'entregas-vencidas',
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'all'], queryFn: () => listTasks(),
    enabled: reportKey === 'entregas-vencidas',
  });
  const milestones = useQuery({
    queryKey: ['milestones', 'all'], queryFn: () => listMilestones(),
    enabled: ['entregas-vencidas', 'steering-committee'].includes(reportKey),
  });
  const decisions = useQuery({
    queryKey: ['decisions', 'all'], queryFn: () => listDecisions(),
    enabled: ['decisoes-pendentes', 'steering-committee'].includes(reportKey),
  });
  const capacity = useQuery({
    queryKey: ['capacity'], queryFn: listCapacity,
    enabled: reportKey === 'capacidade',
  });
  const audit = useQuery({
    queryKey: ['audit', 'changes'], queryFn: () => listAuditLog({ limit: 300 }),
    enabled: reportKey === 'historico-mudancas',
  });

  const list = useMemo(() => projects.data ?? [], [projects.data]);
  const kpis = useMemo(() => portfolioKpis(list), [list]);

  if (!definition) return <EmptyState title="Relatorio nao encontrado" />;
  if (projects.isLoading) return <Spinner label="Montando relatorio" />;

  const header = () => (
    <PageHeader
      title={definition.title}
      description={definition.description}
      actions={canExport && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void exportReport(reportKey, 'pdf')}
            loading={isExporting(reportKey, 'pdf')}
            disabled={isBusy(reportKey)}
            icon={<FileText className="h-4 w-4" />}
          >
            {isExporting(reportKey, 'pdf') ? 'Gerando PDF...' : 'Exportar PDF'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void exportReport(reportKey, 'xlsx')}
            loading={isExporting(reportKey, 'xlsx')}
            disabled={isBusy(reportKey)}
            icon={<FileSpreadsheet className="h-4 w-4" />}
          >
            {isExporting(reportKey, 'xlsx') ? 'Gerando Excel...' : 'Exportar Excel'}
          </Button>
        </div>
      )}
    />
  );

  // ---- Portfolio Review / Status Report Executivo ---------------------------
  if (reportKey === 'portfolio-review' || reportKey === 'status-report-executivo') {
    return (
      <>
        {header()}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KpiCard label="Projetos ativos" value={kpis.active} />
          <KpiCard label="No prazo" value={kpis.onTrack} tone="ok" />
          <KpiCard label="Em atencao" value={kpis.attention} tone="warn" />
          <KpiCard label="Criticos" value={kpis.critical} tone="danger" />
          <KpiCard label="Avanco medio" value={formatPercent(kpis.avgProgress)} />
          <KpiCard label="Forecast x budget" value={formatPercent(kpis.forecastVariancePct)}
            tone={kpis.forecastVariancePct > 5 ? 'danger' : 'ok'} />
        </div>

        <div className="space-y-3">
          {list.map((p) => (
            <article key={p.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/projetos/${p.id}`} className="font-mono text-xs text-brand hover:underline">{p.code}</Link>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.category} · Owner: {p.owner_name ?? '—'} · Sponsor: {p.sponsor_name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <HealthBadge health={p.health} manual={p.health_is_manual} />
                  <Badge tone="neutral">{projectStatusLabel[p.status]}</Badge>
                </div>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="mb-1 text-xs text-muted">Avanco</p>
                  <Progress value={p.progress_actual} planned={p.progress_planned} />
                </div>
                <Metric label="Orcamento" value={formatCurrency(p.budget)} />
                <Metric label="Forecast" value={formatCurrency(p.forecast)}
                  tone={Number(p.forecast_variance_pct) > 5 ? 'danger' : undefined} />
                <Metric label="Proxima entrega"
                  value={p.next_milestone_name ? `${p.next_milestone_name} (${formatDate(p.next_milestone_date)})` : '—'} />
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {Number(p.critical_risks) > 0 && <Badge tone="danger">{p.critical_risks} risco(s) critico(s)</Badge>}
                {Number(p.overdue_tasks) > 0 && <Badge tone="warn">{p.overdue_tasks} tarefa(s) vencida(s)</Badge>}
                {Number(p.pending_decisions) > 0 && <Badge tone="strategic">{p.pending_decisions} decisao(oes) pendente(s)</Badge>}
                {Number(p.days_overdue) > 0 && <Badge tone="danger">{p.days_overdue} dias de atraso</Badge>}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  }

  // ---- Steering Committee ---------------------------------------------------
  if (reportKey === 'steering-committee') {
    const critical = list.filter((p) => p.health === 'vermelho' || Number(p.critical_risks) > 0);
    const pending = (decisions.data ?? []).filter((d) => d.status === 'aguardando_decisao');
    const topRisks = (risks.data ?? []).filter((r) => r.score >= 15 && r.status !== 'encerrado');
    const nextMilestones = (milestones.data ?? [])
      .filter((m) => !m.completed_at && (daysBetween(new Date(), m.due_date) ?? -1) >= 0)
      .slice(0, 12);

    return (
      <>
        {header()}
        <div className="space-y-4">
          <Panel title={`Projetos que exigem atencao do comite (${critical.length})`}>
            {critical.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link to={`/projetos/${p.id}`} className="font-mono text-xs text-brand hover:underline">{p.code}</Link>
                <span className="font-medium">{p.name}</span>
                <HealthBadge health={p.health} />
                {Number(p.critical_risks) > 0 && <Badge tone="danger">{p.critical_risks} risco(s) critico(s)</Badge>}
                <span className="ml-auto text-xs text-muted">Avanco {formatPercent(p.progress_actual)}</span>
              </li>
            ))}
          </Panel>

          <Panel title={`Decisoes aguardando deliberacao (${pending.length})`}>
            {pending.map((d) => (
              <li key={d.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{d.project?.code}</span>
                  <span className="font-medium">{d.subject}</span>
                  <DecisionStatusBadge status={d.status} />
                  <span className="ml-auto text-xs text-muted">Prazo: {formatDate(d.deadline)}</span>
                </div>
                {d.recommendation && <p className="mt-0.5 text-xs text-muted">Recomendacao: {d.recommendation}</p>}
              </li>
            ))}
          </Panel>

          <Panel title={`Riscos criticos (${topRisks.length})`}>
            {topRisks.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-mono text-xs text-muted">{r.project?.code}</span>
                <span className="font-medium">{r.title}</span>
                <CriticalityBadge score={r.score} />
                {!r.mitigation_plan && <Badge tone="danger">sem plano</Badge>}
                <span className="ml-auto text-xs text-muted">{r.owner?.full_name ?? 'sem responsavel'}</span>
              </li>
            ))}
          </Panel>

          <Panel title={`Proximos marcos (${nextMilestones.length})`}>
            {nextMilestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="font-mono text-xs text-muted">{m.project?.code}</span>
                <span className="font-medium">{m.name}</span>
                <span className="ml-auto text-xs text-muted">{formatDate(m.due_date)}</span>
              </li>
            ))}
          </Panel>
        </div>
      </>
    );
  }

  // ---- Riscos ---------------------------------------------------------------
  if (reportKey === 'riscos') {
    const all = (risks.data ?? []).filter((r) => r.status !== 'encerrado')
      .sort((a, b) => b.score - a.score);
    return (
      <>
        {header()}
        <SimpleTable
          headers={['Projeto', 'ID', 'Risco', 'Score', 'Estrategia', 'Responsavel', 'Prazo', 'Status']}
          rows={all.map((r) => [
            r.project?.code ?? '—', r.code, r.title,
            <CriticalityBadge key="s" score={r.score} />,
            r.strategy ?? <span className="text-danger text-xs">nao definida</span>,
            r.owner?.full_name ?? <span className="text-danger text-xs">sem owner</span>,
            formatDate(r.due_date), r.status,
          ])}
          loading={risks.isLoading}
        />
      </>
    );
  }

  // ---- Financeiro -----------------------------------------------------------
  if (reportKey === 'financeiro') {
    return (
      <>
        {header()}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Budget total" value={formatCurrency(kpis.budget)} />
          <KpiCard label="Realizado" value={formatCurrency(kpis.actual)} />
          <KpiCard label="Comprometido" value={formatCurrency(kpis.committed)} />
          <KpiCard label="Forecast" value={formatCurrency(kpis.forecast)} />
          <KpiCard label="Variacao" value={formatCurrency(kpis.forecastVariance)}
            delta={kpis.forecastVariancePct} invertColors
            tone={kpis.forecastVariancePct > 5 ? 'danger' : 'ok'} />
        </div>
        <SimpleTable
          headers={['Codigo', 'Projeto', 'Orcamento', 'Realizado', 'Comprometido', 'Forecast', 'Saldo', 'Variacao']}
          rows={list.map((p) => [
            p.code, p.name, formatCurrency(p.budget), formatCurrency(p.actual),
            formatCurrency(p.committed), formatCurrency(p.forecast), formatCurrency(p.remaining),
            <span key="v" className={Number(p.forecast_variance_pct) > 5 ? 'text-danger' : 'text-ok'}>
              {formatPercent(p.forecast_variance_pct)}
            </span>,
          ])}
        />
      </>
    );
  }

  // ---- Capacidade -----------------------------------------------------------
  if (reportKey === 'capacidade') {
    const month = currentMonthKey();
    const rowsRaw = (capacity.data ?? []).filter((r) => r.reference_month === month);
    const byArea = areaCapacity(capacity.data ?? [], month);
    return (
      <>
        {header()}
        <div className="mb-4">
          <SimpleTable
            headers={['Area', 'Gerencia', 'Capacidade (h)', 'Alocado (h)', 'Alocacao', 'Situacao']}
            rows={byArea.map((a) => [
              a.area, a.businessUnit ?? '—', formatNumber(a.capacity, 0), formatNumber(a.allocated, 0), formatPercent(a.pct),
              a.status === 'danger' ? <Badge key="b" tone="danger">Sobrecarga</Badge>
                : a.status === 'warn' ? <Badge key="b" tone="warn">Atencao</Badge>
                  : <Badge key="b" tone="ok">Adequada</Badge>,
            ])}
            loading={capacity.isLoading}
          />
        </div>
        <SimpleTable
          headers={['Colaborador', 'Area', 'Capacidade (h)', 'Alocado (h)', 'Alocacao', 'Projetos']}
          rows={rowsRaw.map((r) => [
            r.full_name, r.area_name ?? '—', formatNumber(r.capacity_hours, 0),
            formatNumber(r.allocated_hours, 0),
            <span key="p" className={r.allocation_pct > 100 ? 'font-medium text-danger' : ''}>
              {formatPercent(r.allocation_pct)}
            </span>,
            r.project_count,
          ])}
        />
      </>
    );
  }

  // ---- Entregas vencidas ----------------------------------------------------
  if (reportKey === 'entregas-vencidas') {
    const overdueTasks = (tasks.data ?? []).filter(
      (t) => t.due_date && !['concluida', 'cancelada'].includes(t.status)
        && (daysBetween(new Date(), t.due_date) ?? 0) < 0,
    );
    const overdueMilestones = (milestones.data ?? []).filter(
      (m) => !m.completed_at && (daysBetween(new Date(), m.due_date) ?? 0) < 0,
    );
    const overdueActions = (actions.data ?? []).filter(
      (a) => a.due_date && !['concluida', 'cancelada'].includes(a.status)
        && (daysBetween(new Date(), a.due_date) ?? 0) < 0,
    );

    const rows = [
      ...overdueTasks.map((t) => ({
        Tipo: 'Tarefa', Projeto: t.project?.code ?? '', Item: t.title,
        Responsavel: t.assignee?.full_name ?? '', Prazo: t.due_date ?? '',
        'Atraso (dias)': Math.abs(daysBetween(new Date(), t.due_date) ?? 0),
      })),
      ...overdueMilestones.map((m) => ({
        Tipo: 'Marco', Projeto: m.project?.code ?? '', Item: m.name, Responsavel: '',
        Prazo: m.due_date, 'Atraso (dias)': Math.abs(daysBetween(new Date(), m.due_date) ?? 0),
      })),
      ...overdueActions.map((a) => ({
        Tipo: 'Plano de acao', Projeto: a.project?.code ?? '', Item: a.title,
        Responsavel: a.owner?.full_name ?? '', Prazo: a.due_date ?? '',
        'Atraso (dias)': Math.abs(daysBetween(new Date(), a.due_date) ?? 0),
      })),
    ].sort((a, b) => Number(b['Atraso (dias)']) - Number(a['Atraso (dias)']));

    return (
      <>
        {header()}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Tarefas vencidas" value={overdueTasks.length} tone="danger" />
          <KpiCard label="Marcos vencidos" value={overdueMilestones.length} tone="danger" />
          <KpiCard label="Acoes vencidas" value={overdueActions.length} tone="warn" />
        </div>
        <SimpleTable
          headers={['Tipo', 'Projeto', 'Item', 'Responsavel', 'Prazo', 'Atraso']}
          rows={rows.map((r) => [
            r.Tipo, r.Projeto, r.Item, r.Responsavel || '—', formatDate(String(r.Prazo)),
            <Badge key="a" tone="danger">{String(r['Atraso (dias)'])} dias</Badge>,
          ])}
          loading={tasks.isLoading}
        />
      </>
    );
  }

  // ---- Decisoes pendentes ---------------------------------------------------
  if (reportKey === 'decisoes-pendentes') {
    const pending = (decisions.data ?? [])
      .filter((d) => d.status === 'aguardando_decisao' || d.status === 'em_preparacao')
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
    return (
      <>
        {header()}
        <SimpleTable
          headers={['Projeto', 'Codigo', 'Assunto', 'Decisor', 'Prazo', 'Status']}
          rows={pending.map((d) => {
            const days = d.deadline ? daysBetween(new Date(), d.deadline) : null;
            return [
              d.project?.code ?? '—', d.code, d.subject, d.decider?.full_name ?? '—',
              <span key="p" className={days != null && days < 0 ? 'font-medium text-danger' : ''}>
                {formatDate(d.deadline)}{days != null && days < 0 ? ` (${Math.abs(days)}d atraso)` : ''}
              </span>,
              <DecisionStatusBadge key="s" status={d.status} />,
            ];
          })}
          loading={decisions.isLoading}
        />
      </>
    );
  }

  // ---- Historico de mudancas ------------------------------------------------
  if (reportKey === 'historico-mudancas') {
    const relevant = (audit.data ?? []).filter((e) =>
      ['status_change', 'health_change', 'financial_change', 'schedule_change', 'ownership_change', 'permission_change'].includes(e.action));
    return (
      <>
        {header()}
        <SimpleTable
          headers={['Data/hora', 'Usuario', 'Acao', 'Entidade', 'Campos alterados']}
          rows={relevant.map((e) => [
            formatDateTime(e.occurred_at), e.user_name ?? 'Sistema',
            <Badge key="a" tone="info">{auditActionLabel[e.action]}</Badge>,
            e.entity,
            <span key="c" className="font-mono text-xs text-muted">{(e.changed_fields ?? []).join(', ') || '—'}</span>,
          ])}
          loading={audit.isLoading}
        />
      </>
    );
  }

  return <EmptyState title="Relatorio nao implementado" />;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`truncate text-sm font-medium ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {empty ? <p className="py-4 text-center text-xs text-muted">Nenhum item.</p> : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

function SimpleTable({
  headers, rows, loading,
}: { headers: string[]; rows: React.ReactNode[][]; loading?: boolean }) {
  if (loading) return <Spinner />;
  if (rows.length === 0) return <EmptyState title="Nenhum registro no escopo atual" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface-2">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-border">
              {cells.map((c, j) => <td key={j} className="px-3 py-2.5 align-middle">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
