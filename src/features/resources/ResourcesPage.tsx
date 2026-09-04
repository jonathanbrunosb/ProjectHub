import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { ErrorState, EmptyState, Spinner } from '@/components/ui/Feedback';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartColors } from '@/components/charts/chartTheme';
import { cn } from '@/utils/cn';
import { formatMonth, formatPercent, formatNumber } from '@/utils/format';
import { listAllocations, listCapacity } from '@/services/governance';
import { listTeams } from '@/services/projects';
import { currentMonthKey, teamCapacity } from '@/features/dashboard/selectors';

/**
 * Capacidade x alocacao. Alertas seguem a regra: acima de 100% = sobrecarga;
 * entre o limite da equipe e 100% = atencao.
 */
export function ResourcesPage() {
  useBreadcrumbs([{ label: 'Recursos & Capacidade' }]);
  const [tab, setTab] = useState('heatmap');
  const [teamFilter, setTeamFilter] = useState('');
  const colors = chartColors();

  const capacityQuery = useQuery({ queryKey: ['capacity'], queryFn: listCapacity });
  const allocationsQuery = useQuery({ queryKey: ['allocations'], queryFn: () => listAllocations() });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: listTeams });

  const rows = useMemo(
    () => (capacityQuery.data ?? []).filter((r) => !teamFilter || r.team_name === teamFilter),
    [capacityQuery.data, teamFilter],
  );

  const months = useMemo(
    () => [...new Set(rows.map((r) => r.reference_month))].sort(),
    [rows],
  );

  const people = useMemo(() => {
    const map = new Map<string, { name: string; team: string | null; byMonth: Map<string, typeof rows[number]> }>();
    for (const r of rows) {
      const entry = map.get(r.profile_id) ?? { name: r.full_name, team: r.team_name, byMonth: new Map() };
      entry.byMonth.set(r.reference_month, r);
      map.set(r.profile_id, entry);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const currentMonth = currentMonthKey();
  const byTeam = useMemo(() => teamCapacity(rows, currentMonth), [rows, currentMonth]);

  const alerts = useMemo(() => {
    const list: { severity: 'danger' | 'warn'; text: string }[] = [];
    const teams = teamsQuery.data ?? [];

    for (const r of rows.filter((x) => x.reference_month === currentMonth)) {
      if (r.allocation_pct > 100) {
        list.push({ severity: 'danger', text: `${r.full_name} esta alocado em ${formatPercent(r.allocation_pct)} da capacidade no mes corrente.` });
      } else if (r.project_count >= 3 && r.allocation_pct > 70) {
        list.push({ severity: 'warn', text: `${r.full_name} concentra ${r.project_count} projetos simultaneos com ${formatPercent(r.allocation_pct)} de alocacao.` });
      }
    }

    for (const t of byTeam) {
      const config = teams.find((x) => x.name === t.team);
      const limit = config?.max_allocation_pct ?? 100;
      if (t.pct > limit) {
        list.push({
          severity: t.pct > 100 ? 'danger' : 'warn',
          text: `Equipe ${t.team} em ${formatPercent(t.pct)} de alocacao (limite configurado: ${formatPercent(limit)}).`,
        });
      }
    }
    return list;
  }, [rows, byTeam, currentMonth, teamsQuery.data]);

  const totals = useMemo(() => {
    const current = rows.filter((r) => r.reference_month === currentMonth);
    const capacity = current.reduce((a, r) => a + Number(r.capacity_hours), 0);
    const allocated = current.reduce((a, r) => a + Number(r.allocated_hours), 0);
    return {
      capacity, allocated,
      available: Math.max(0, capacity - allocated),
      pct: capacity ? (allocated / capacity) * 100 : 0,
      overloaded: current.filter((r) => r.allocation_pct > 100).length,
    };
  }, [rows, currentMonth]);

  if (capacityQuery.isError) {
    return <ErrorState message={(capacityQuery.error as Error).message} onRetry={() => capacityQuery.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Recursos & Capacidade"
        description="Capacidade das equipes, alocacao por projeto e identificacao de sobrecarga."
        actions={
          <Select className="w-auto" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filtrar por equipe">
            <option value="">Todas as equipes</option>
            {(teamsQuery.data ?? []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </Select>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Capacidade do mes" value={`${formatNumber(totals.capacity, 0)} h`} />
        <KpiCard label="Horas alocadas" value={`${formatNumber(totals.allocated, 0)} h`} />
        <KpiCard label="Capacidade disponivel" value={`${formatNumber(totals.available, 0)} h`}
          tone={totals.available === 0 ? 'danger' : 'ok'} />
        <KpiCard label="Alocacao media" value={formatPercent(totals.pct)}
          tone={totals.pct > 100 ? 'danger' : totals.pct > 85 ? 'warn' : 'ok'} />
        <KpiCard label="Pessoas sobrecarregadas" value={totals.overloaded}
          tone={totals.overloaded > 0 ? 'danger' : 'ok'} />
      </div>

      {alerts.length > 0 && (
        <section className="card mb-4 border-warn/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-warn" /> Alertas de capacidade
          </h2>
          <ul className="space-y-1.5">
            {alerts.slice(0, 8).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge tone={a.severity === 'danger' ? 'danger' : 'warn'}>
                  {a.severity === 'danger' ? 'Sobrecarga' : 'Atencao'}
                </Badge>
                <span className="text-fg">{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'heatmap', label: 'Heatmap de alocacao' },
          { key: 'equipes', label: 'Por equipe' },
          { key: 'alocacoes', label: 'Alocacoes', count: (allocationsQuery.data ?? []).length },
        ]}
      />

      {capacityQuery.isLoading ? (
        <Spinner label="Calculando capacidade" />
      ) : tab === 'heatmap' ? (
        <div className="card overflow-x-auto p-4">
          {people.length === 0 ? (
            <EmptyState title="Sem colaboradores no filtro atual" />
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left text-xs font-semibold text-muted">Colaborador</th>
                  {months.map((m) => (
                    <th key={m} className="pb-2 text-center text-xs font-semibold text-muted">{formatMonth(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.team ?? 'Sem equipe'}</p>
                    </td>
                    {months.map((m) => {
                      const cell = p.byMonth.get(m);
                      const pct = Number(cell?.allocation_pct ?? 0);
                      return (
                        <td key={m} className="px-1 py-2 text-center">
                          <span
                            title={`${formatNumber(cell?.allocated_hours ?? 0, 0)}h de ${formatNumber(cell?.capacity_hours ?? 0, 0)}h · ${cell?.project_count ?? 0} projeto(s)`}
                            className={cn(
                              'inline-block w-full rounded px-1.5 py-1.5 text-xs font-medium tabular-nums',
                              pct === 0 ? 'bg-surface-2 text-muted'
                                : pct > 100 ? 'bg-danger/25 text-danger'
                                  : pct > 85 ? 'bg-warn/25 text-warn'
                                    : pct > 50 ? 'bg-ok/20 text-ok' : 'bg-info/15 text-info',
                            )}
                          >
                            {pct ? formatPercent(pct, 0) : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : tab === 'equipes' ? (
        <ChartCard title="Alocacao por equipe" description="Mes corrente" empty={byTeam.length === 0} height={320}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byTeam} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: colors.muted }} />
              <YAxis type="category" dataKey="team" width={160} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(v)} />} />
              <Bar dataKey="pct" name="Alocacao" radius={[0, 3, 3, 0]} maxBarSize={22}>
                {byTeam.map((t, i) => (
                  <Cell key={i} fill={t.pct > 100 ? colors.danger : t.pct > 85 ? colors.warn : colors.ok} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                {['Colaborador', 'Projeto', 'Funcao', 'Periodo', 'Horas', '% alocacao'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(allocationsQuery.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2.5">{a.profile?.full_name ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-brand">{a.project?.code ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted">{a.role_label ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {new Date(a.period_start).toLocaleDateString('pt-BR')} → {new Date(a.period_end).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatNumber(a.allocated_hours, 0)} h</td>
                  <td className="px-3 py-2.5 tabular-nums">{a.allocation_pct != null ? formatPercent(a.allocation_pct) : '—'}</td>
                </tr>
              ))}
              {(allocationsQuery.data ?? []).length === 0 && (
                <tr><td colSpan={6}><EmptyState title="Nenhuma alocacao registrada" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
