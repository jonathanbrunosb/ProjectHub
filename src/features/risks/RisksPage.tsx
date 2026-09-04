import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { KpiCard } from '@/components/ui/KpiCard';
import { ErrorState } from '@/components/ui/Feedback';
import { useAuth } from '@/app/AuthProvider';
import { listActionPlans, listRisks } from '@/services/risks';
import { daysBetween } from '@/utils/format';
import { riskCriticality } from '@/utils/domain-labels';
import { RiskMatrix } from './RiskMatrix';
import { ActionPlanTable, RiskTable } from './RiskViews';

export function RisksPage() {
  useBreadcrumbs([{ label: 'Riscos & Planos de Acao' }]);
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'acoes' ? 'acoes' : 'riscos');
  const [cell, setCell] = useState<{ p: number; i: number } | null>(null);

  const risksQuery = useQuery({ queryKey: ['risks', 'all'], queryFn: () => listRisks() });
  const actionsQuery = useQuery({ queryKey: ['actions', 'all'], queryFn: () => listActionPlans() });

  const criticalityFilter = params.get('criticidade') ?? '';
  const onlyOverdueActions = params.get('vencidas') === '1';

  const risks = useMemo(() => {
    let list = risksQuery.data ?? [];
    if (criticalityFilter) list = list.filter((r) => riskCriticality(r.score) === criticalityFilter);
    if (cell) list = list.filter((r) => r.probability === cell.p && r.impact === cell.i);
    return list;
  }, [risksQuery.data, criticalityFilter, cell]);

  const actions = useMemo(() => {
    const list = actionsQuery.data ?? [];
    return onlyOverdueActions
      ? list.filter((a) => a.due_date && !['concluida', 'cancelada'].includes(a.status)
        && (daysBetween(new Date(), a.due_date) ?? 0) < 0)
      : list;
  }, [actionsQuery.data, onlyOverdueActions]);

  const stats = useMemo(() => {
    const all = risksQuery.data ?? [];
    const open = all.filter((r) => r.status === 'aberto' || r.status === 'em_tratamento');
    return {
      open: open.length,
      critical: open.filter((r) => r.score >= 15).length,
      noPlan: open.filter((r) => r.score >= 15 && (!r.mitigation_plan || !r.strategy)).length,
      noOwner: open.filter((r) => !r.owner_id).length,
      staleReview: open.filter((r) => {
        const d = r.last_review_at ? daysBetween(r.last_review_at, new Date()) : null;
        return d == null || d > 30;
      }).length,
      overdueActions: (actionsQuery.data ?? []).filter(
        (a) => a.due_date && !['concluida', 'cancelada'].includes(a.status)
          && (daysBetween(new Date(), a.due_date) ?? 0) < 0,
      ).length,
    };
  }, [risksQuery.data, actionsQuery.data]);

  if (risksQuery.isError) {
    return <ErrorState message={(risksQuery.error as Error).message} onRetry={() => risksQuery.refetch()} />;
  }

  const clearFilters = () => { setParams({}, { replace: true }); setCell(null); };

  return (
    <>
      <PageHeader
        title="Riscos & Planos de Acao"
        description="Visao corporativa de riscos, issues e acoes de mitigacao de todos os projetos autorizados."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard label="Riscos abertos" value={stats.open} />
        <KpiCard label="Criticos" value={stats.critical} tone="danger"
          onClick={() => setParams({ criticidade: 'critico' })} />
        <KpiCard label="Criticos sem plano" value={stats.noPlan} tone="danger"
          hint="Risco critico sem estrategia ou plano de mitigacao definido." />
        <KpiCard label="Sem responsavel" value={stats.noOwner} tone="warn" />
        <KpiCard label="Sem revisao ha 30d" value={stats.staleReview} tone="warn" />
        <KpiCard label="Acoes vencidas" value={stats.overdueActions} tone="danger"
          onClick={() => { setTab('acoes'); setParams({ tab: 'acoes', vencidas: '1' }); }} />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(k) => { setTab(k); setParams(k === 'acoes' ? { tab: 'acoes' } : {}); setCell(null); }}
        items={[
          { key: 'riscos', label: 'Riscos & Issues', count: risks.length },
          { key: 'acoes', label: 'Planos de acao', count: actions.length },
          { key: 'matriz', label: 'Matriz 5x5' },
        ]}
      />

      {(criticalityFilter || cell || onlyOverdueActions) && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-muted">
            Filtro ativo{cell ? `: probabilidade ${cell.p} x impacto ${cell.i}` : criticalityFilter ? `: criticidade ${criticalityFilter}` : ': acoes vencidas'}
          </span>
          <button onClick={clearFilters} className="text-brand hover:underline">Limpar</button>
        </div>
      )}

      {tab === 'riscos' && (
        <RiskTable risks={risks} loading={risksQuery.isLoading} canEdit={can('project.write')} showProject module="risks-corporate" />
      )}
      {tab === 'acoes' && (
        <ActionPlanTable actions={actions} loading={actionsQuery.isLoading} canEdit={can('project.write')} showProject module="actions-corporate" />
      )}
      {tab === 'matriz' && (
        <div className="card p-5">
          <RiskMatrix
            risks={risksQuery.data ?? []}
            onSelectCell={(p, i) => { setCell({ p, i }); setTab('riscos'); }}
          />
        </div>
      )}
    </>
  );
}
