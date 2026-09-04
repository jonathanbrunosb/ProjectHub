import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, History } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartColors } from '@/components/charts/chartTheme';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import {
  createBudgetRevision, getFinancialCurve, getFinancialSummary, listBudgets,
  listCostCenters, listFinancialEntries, upsertFinancialEntry,
} from '@/services/financial';
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonth, formatPercent, toISODate } from '@/utils/format';

const natureLabel = {
  orcado: 'Orcado', realizado: 'Realizado', comprometido: 'Comprometido', forecast: 'Forecast',
} as const;

export function FinancialTab({ projectId, canManage, canEdit }: { projectId: string; canManage: boolean; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const colors = chartColors();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [revision, setRevision] = useState({ amount: '', justification: '', effective_from: toISODate(new Date()) });
  const [entry, setEntry] = useState({
    nature: 'realizado', reference_month: `${toISODate(new Date()).slice(0, 7)}-01`,
    amount: '', category: '', supplier: '', cost_center_id: '', account: '', description: '',
  });

  const summary = useQuery({ queryKey: ['financial', 'summary', projectId], queryFn: () => getFinancialSummary(projectId) });
  const curve = useQuery({ queryKey: ['financial', 'curve', projectId], queryFn: () => getFinancialCurve(projectId) });
  const budgets = useQuery({ queryKey: ['financial', 'budgets', projectId], queryFn: () => listBudgets(projectId) });
  const entries = useQuery({ queryKey: ['financial', 'entries', projectId], queryFn: () => listFinancialEntries(projectId) });
  const costCenters = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters, enabled: entryOpen });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['financial'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const saveRevision = useMutation({
    mutationFn: async () => {
      const amount = Number(revision.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe um valor valido.');
      if (revision.justification.trim().length < 10) throw new Error('A justificativa da revisao e obrigatoria (minimo 10 caracteres).');
      await createBudgetRevision(projectId, amount, revision.justification.trim(), revision.effective_from);
    },
    onSuccess: () => {
      invalidate();
      setRevisionOpen(false);
      setRevision({ amount: '', justification: '', effective_from: toISODate(new Date()) });
      toast.success('Revisao de orcamento registrada', 'A revisao anterior foi preservada no historico.');
    },
    onError: (e) => toast.error('Nao foi possivel revisar o orcamento', describeError(e)),
  });

  const saveEntry = useMutation({
    mutationFn: async () => {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe um valor valido.');
      await upsertFinancialEntry({
        project_id: projectId,
        nature: entry.nature as never,
        reference_month: entry.reference_month,
        amount,
        category: entry.category || null,
        supplier: entry.supplier || null,
        cost_center_id: entry.cost_center_id || null,
        account: entry.account || null,
        description: entry.description || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setEntryOpen(false);
      setEntry((e) => ({ ...e, amount: '', description: '' }));
      toast.success('Lancamento registrado');
    },
    onError: (e) => toast.error('Nao foi possivel lancar', describeError(e)),
  });

  const chartData = useMemo(
    () => (curve.data ?? []).map((p) => ({
      month: p.reference_month,
      planned: Number(p.planned ?? 0),
      actual: Number(p.actual ?? 0),
      committed: Number(p.committed ?? 0),
      forecast: Number(p.forecast ?? 0),
    })),
    [curve.data],
  );

  const s = summary.data;
  const executionPct = s && s.budget ? (s.actual / s.budget) * 100 : 0;

  if (summary.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard label="Budget" value={formatCurrencyCompact(s?.budget)} hint={formatCurrency(s?.budget)} />
        <KpiCard label="Realizado" value={formatCurrencyCompact(s?.actual)}
          deltaLabel={`${formatPercent(executionPct, 0)} do budget`} hint={formatCurrency(s?.actual)} />
        <KpiCard label="Comprometido" value={formatCurrencyCompact(s?.committed)} hint={formatCurrency(s?.committed)} />
        <KpiCard label="Forecast" value={formatCurrencyCompact(s?.forecast)} hint={formatCurrency(s?.forecast)}
          tone={Number(s?.forecast_variance_pct ?? 0) > 5 ? 'danger' : 'default'} />
        <KpiCard label="Budget remaining" value={formatCurrencyCompact(s?.remaining)}
          tone={Number(s?.remaining ?? 0) < 0 ? 'danger' : 'ok'} hint={formatCurrency(s?.remaining)} />
        <KpiCard
          label="Forecast variance"
          value={formatCurrencyCompact(s?.forecast_variance)}
          delta={Number(s?.forecast_variance_pct ?? 0)}
          invertColors
          tone={Number(s?.forecast_variance_pct ?? 0) > 5 ? 'danger' : 'default'}
          hint="Forecast menos orcamento vigente."
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {canManage && (
          <Button variant="secondary" onClick={() => setRevisionOpen(true)} icon={<History className="h-4 w-4" />}>
            Revisar orcamento
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => setEntryOpen(true)} icon={<Plus className="h-4 w-4" />}>Novo lancamento</Button>
        )}
      </div>

      <ChartCard
        title="Curva mensal: planejado x realizado x forecast"
        description="Competencia contabil"
        loading={curve.isLoading}
        empty={chartData.length === 0}
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: colors.muted }} />
            <YAxis tickFormatter={(v) => formatCurrencyCompact(v).replace('R$ ', '')} tick={{ fontSize: 11, fill: colors.muted }} width={56} />
            <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} labelFormatter={formatMonth} />
            <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
            <Bar dataKey="planned" name="Planejado" fill={colors.muted} radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Bar dataKey="actual" name="Realizado" fill={colors.brand} radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Bar dataKey="committed" name="Comprometido" fill={colors.info} radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Line dataKey="forecast" name="Forecast" stroke={colors.strategic} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">Revisoes de orcamento</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                {['Revisao', 'Valor', 'Vigencia', 'Situacao', 'Justificativa'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(budgets.data ?? []).map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">R{b.revision}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{formatCurrency(b.amount)}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(b.effective_from)}</td>
                  <td className="px-3 py-2">
                    {b.is_current ? <Badge tone="ok">Vigente</Badge> : <Badge tone="neutral">Historico</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted">{b.justification ?? '—'}</td>
                </tr>
              ))}
              {(budgets.data ?? []).length === 0 && (
                <tr><td colSpan={5}><EmptyState title="Nenhum orcamento cadastrado" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">Lancamentos</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                {['Competencia', 'Natureza', 'Valor', 'Categoria', 'Fornecedor', 'Centro de custo', 'Conta', 'Descricao'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(entries.data ?? []).slice(0, 60).map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatMonth(e.reference_month)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={e.nature === 'realizado' ? 'brand' : e.nature === 'forecast' ? 'strategic' : e.nature === 'comprometido' ? 'info' : 'neutral'}>
                      {natureLabel[e.nature]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(e.amount)}</td>
                  <td className="px-3 py-2 text-muted">{e.category ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{e.supplier ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{e.cost_center?.code ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{e.account ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{e.description ?? '—'}</td>
                </tr>
              ))}
              {(entries.data ?? []).length === 0 && (
                <tr><td colSpan={8}><EmptyState title="Nenhum lancamento registrado" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Revisar orcamento"
        description="A revisao cria uma nova versao vigente e preserva o historico, exigido para rastreabilidade."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevisionOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveRevision.mutate()} loading={saveRevision.isPending}>Registrar revisao</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Novo valor (R$)" required>
            <Input type="number" min="0" step="1000" value={revision.amount}
              onChange={(e) => setRevision((r) => ({ ...r, amount: e.target.value }))} />
          </Field>
          <Field label="Vigencia a partir de" required>
            <Input type="date" value={revision.effective_from}
              onChange={(e) => setRevision((r) => ({ ...r, effective_from: e.target.value }))} />
          </Field>
          <Field label="Justificativa" required hint="Minimo de 10 caracteres. Registrada na trilha de auditoria.">
            <Textarea value={revision.justification}
              onChange={(e) => setRevision((r) => ({ ...r, justification: e.target.value }))}
              placeholder="Ex.: Ampliacao de escopo para duas entidades adicionais aprovada em Steering." />
          </Field>
        </div>
      </Modal>

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Novo lancamento financeiro"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEntryOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveEntry.mutate()} loading={saveEntry.isPending}>Lancar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Natureza" required>
            <Select value={entry.nature} onChange={(e) => setEntry((s2) => ({ ...s2, nature: e.target.value }))}>
              {Object.entries(natureLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Competencia" required hint="Sempre o primeiro dia do mes.">
            <Input type="month" value={entry.reference_month.slice(0, 7)}
              onChange={(e) => setEntry((s2) => ({ ...s2, reference_month: `${e.target.value}-01` }))} />
          </Field>
          <Field label="Valor (R$)" required>
            <Input type="number" min="0" step="0.01" value={entry.amount}
              onChange={(e) => setEntry((s2) => ({ ...s2, amount: e.target.value }))} />
          </Field>
          <Field label="Categoria">
            <Input value={entry.category} onChange={(e) => setEntry((s2) => ({ ...s2, category: e.target.value }))} />
          </Field>
          <Field label="Fornecedor">
            <Input value={entry.supplier} onChange={(e) => setEntry((s2) => ({ ...s2, supplier: e.target.value }))} />
          </Field>
          <Field label="Centro de custo">
            <Select value={entry.cost_center_id} onChange={(e) => setEntry((s2) => ({ ...s2, cost_center_id: e.target.value }))}>
              <option value="">Nao informado</option>
              {(costCenters.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Conta contabil">
            <Input value={entry.account} onChange={(e) => setEntry((s2) => ({ ...s2, account: e.target.value }))} />
          </Field>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea value={entry.description} onChange={(e) => setEntry((s2) => ({ ...s2, description: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
