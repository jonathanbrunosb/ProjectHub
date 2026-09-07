import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, EmptyState, Spinner } from '@/components/ui/Feedback';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartColors } from '@/components/charts/chartTheme';
import { cn } from '@/utils/cn';
import { formatMonth, formatPercent, formatNumber } from '@/utils/format';
import { listAllocations, listCapacity, type AllocationRow } from '@/services/governance';
import { listProfiles, listTeams } from '@/services/projects';
import { listAreas } from '@/services/areas';
import { areaCapacity, currentMonthKey, teamCapacity, type AreaCapacity } from '@/features/dashboard/selectors';

/**
 * Capacidade x alocacao. Alertas seguem a regra: acima de 100% = sobrecarga;
 * entre o limite da equipe e 100% = atencao.
 */
export function ResourcesPage() {
  useBreadcrumbs([{ label: 'Recursos & Capacidade' }]);
  const [tab, setTab] = useState('heatmap');
  const [teamFilter, setTeamFilter] = useState('');
  const [areaMonth, setAreaMonth] = useState<string | null>(null);
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [areaDrillDown, setAreaDrillDown] = useState<AreaCapacity | null>(null);
  const colors = chartColors();

  const capacityQuery = useQuery({ queryKey: ['capacity'], queryFn: listCapacity });
  const allocationsQuery = useQuery({ queryKey: ['allocations'], queryFn: () => listAllocations() });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: listTeams });
  const areasQuery = useQuery({ queryKey: ['areas'], queryFn: listAreas, enabled: tab === 'areas' });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'all'], queryFn: listProfiles, enabled: tab === 'areas' });

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

  const selectedAreaMonth = areaMonth ?? currentMonth;
  const areaManagerByAreaId = useMemo(
    () => new Map((areasQuery.data ?? []).map((a) => [a.id, a.manager?.full_name ?? null])),
    [areasQuery.data],
  );
  const byArea = useMemo(() => {
    let result = areaCapacity(capacityQuery.data ?? [], selectedAreaMonth);
    if (businessUnitFilter) result = result.filter((a) => a.businessUnit === businessUnitFilter);
    if (statusFilter) result = result.filter((a) => a.status === statusFilter);
    return result;
  }, [capacityQuery.data, selectedAreaMonth, businessUnitFilter, statusFilter]);

  const businessUnitOptions = useMemo(
    () => [...new Set((capacityQuery.data ?? []).map((r) => r.business_unit_name).filter((v): v is string => Boolean(v)))],
    [capacityQuery.data],
  );

  /** Colaboradores da area no mes selecionado, com as alocacoes que compoem a sobrecarga (item 13). */
  const areaDrillDownPeople = useMemo(() => {
    if (!areaDrillDown) return [];
    const rowsOfArea = (capacityQuery.data ?? []).filter(
      (r) => r.reference_month === selectedAreaMonth && (r.area_id ?? null) === areaDrillDown.areaId,
    );
    const allocationsByProfile = new Map<string, AllocationRow[]>();
    for (const a of allocationsQuery.data ?? []) {
      const list = allocationsByProfile.get(a.profile_id) ?? [];
      list.push(a);
      allocationsByProfile.set(a.profile_id, list);
    }
    return rowsOfArea
      .map((r) => ({ ...r, allocations: allocationsByProfile.get(r.profile_id) ?? [] }))
      .sort((a, b) => b.allocation_pct - a.allocation_pct);
  }, [areaDrillDown, capacityQuery.data, selectedAreaMonth, allocationsQuery.data]);

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
          { key: 'areas', label: 'Por area' },
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
      ) : tab === 'areas' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select className="w-auto" value={selectedAreaMonth} onChange={(e) => setAreaMonth(e.target.value)} aria-label="Filtrar por periodo">
              {months.length === 0
                ? <option value={currentMonth}>{formatMonth(currentMonth)}</option>
                : months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </Select>
            <Select className="w-auto" value={businessUnitFilter} onChange={(e) => setBusinessUnitFilter(e.target.value)} aria-label="Filtrar por gerencia">
              <option value="">Todas as gerencias</option>
              {businessUnitOptions.map((bu) => <option key={bu} value={bu}>{bu}</option>)}
            </Select>
            <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status de capacidade">
              <option value="">Todos os status</option>
              <option value="ok">Dentro do previsto</option>
              <option value="warn">Atencao</option>
              <option value="danger">Sobrecarga</option>
            </Select>
          </div>

          {capacityQuery.isLoading || profilesQuery.isLoading || areasQuery.isLoading ? (
            <Spinner label="Calculando capacidade por area" />
          ) : byArea.length === 0 ? (
            <EmptyState title="Nenhuma area com colaboradores no filtro atual" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    {['Area', 'Gerencia', 'Gestor', 'Colaboradores', 'Capacidade', 'Alocado', 'Disponivel', 'Utilizacao', 'Status', ''].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byArea.map((a) => (
                    <tr key={a.areaId ?? '__sem_area__'} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{a.area}</td>
                      <td className="px-3 py-2.5 text-muted">{a.businessUnit ?? '—'}</td>
                      <td className="px-3 py-2.5 text-muted">{(a.areaId && areaManagerByAreaId.get(a.areaId)) ?? '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {a.collaborators}
                        {a.overloadedCollaborators > 0 && (
                          <span className="ml-1.5 text-xs text-danger">({a.overloadedCollaborators} sobrecarregado{a.overloadedCollaborators === 1 ? '' : 's'})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{formatNumber(a.capacity, 0)} h</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatNumber(a.allocated, 0)} h</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatNumber(a.available, 0)} h</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatPercent(a.pct)}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={a.status === 'danger' ? 'danger' : a.status === 'warn' ? 'warn' : 'ok'}>
                          {a.status === 'danger' ? 'Sobrecarga' : a.status === 'warn' ? 'Atencao' : 'Dentro do previsto'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Button variant="ghost" size="sm" onClick={() => setAreaDrillDown(a)}>Ver colaboradores</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Modal
            open={Boolean(areaDrillDown)}
            onClose={() => setAreaDrillDown(null)}
            title={`Colaboradores de ${areaDrillDown?.area ?? ''}`}
            description={`${formatMonth(selectedAreaMonth)} - clique em um colaborador para ver as alocacoes por projeto que compoem a utilizacao.`}
            size="lg"
          >
            {areaDrillDownPeople.length === 0 ? (
              <EmptyState title="Nenhum colaborador nesta area no periodo" />
            ) : (
              <div className="space-y-3">
                {areaDrillDownPeople.map((p) => (
                  <div key={p.profile_id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{p.full_name}</p>
                      <Badge tone={p.allocation_pct > 100 ? 'danger' : p.allocation_pct > 85 ? 'warn' : 'ok'}>
                        {formatPercent(p.allocation_pct)} · {formatNumber(p.allocated_hours, 0)}h de {formatNumber(p.capacity_hours, 0)}h
                      </Badge>
                    </div>
                    {p.allocations.length > 0 && (
                      <ul className="mt-2 divide-y divide-border text-xs text-muted">
                        {p.allocations.map((al) => (
                          <li key={al.id} className="flex items-center justify-between gap-2 py-1.5">
                            <span className="font-mono text-brand">{al.project?.code ?? '—'}</span>
                            <span className="truncate">{al.project?.name ?? '—'}</span>
                            <span className="tabular-nums">{formatNumber(al.allocated_hours, 0)} h</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Modal>
        </>
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
