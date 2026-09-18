import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Send, FileText, Gavel, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, type Tone } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { DecisionStatusBadge, HealthBadge } from '@/components/ui/StatusBadges';
import { KpiCard, type KpiCardProps } from '@/components/ui/KpiCard';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartColors } from '@/components/charts/chartTheme';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import { cn } from '@/utils/cn';
import {
  createStatusReport, deleteEvmSnapshot, listDecisions, listEvmSnapshots, listIndicators,
  listMeasurements, listStatusReports, nextDecisionCode, publishStatusReport, upsertDecision,
  upsertEvmSnapshot, upsertIndicator, updateStatusReport,
} from '@/services/governance';
import { listActiveProfiles } from '@/services/projects';
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime, formatNumber, formatPercent, toISODate } from '@/utils/format';
import { decisionStatusLabel, statusReportStateLabel, statusReportStateTone } from '@/utils/domain-labels';
import type { Decision, EvmSnapshot, Indicator, StatusReport } from '@/types/domain';

// ---------------------------------------------------------------------------
// Decisoes & Aprovacoes
// ---------------------------------------------------------------------------
export function DecisionsTab({ projectId, canEdit, canDecide }: { projectId: string; canEdit: boolean; canDecide: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Decision | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', subject: '', context: '', alternatives: '', recommendation: '',
    decider_id: '', deadline: '', status: 'em_preparacao', decision: '', rationale: '',
  });

  const decisions = useQuery({ queryKey: ['decisions', projectId], queryFn: () => listDecisions(projectId) });
  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.subject.trim()) throw new Error('Informe o assunto da decisao.');
      if (['aprovado', 'rejeitado'].includes(form.status) && !form.decision.trim()) {
        throw new Error('Registre a decisao tomada antes de aprovar ou rejeitar.');
      }
      await upsertDecision({
        id: editing?.id,
        project_id: projectId,
        code: form.code.trim(),
        subject: form.subject.trim(),
        context: form.context || null,
        alternatives: form.alternatives || null,
        recommendation: form.recommendation || null,
        decider_id: form.decider_id || null,
        deadline: form.deadline || null,
        status: form.status as never,
        decision: form.decision || null,
        rationale: form.rationale || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(editing ? 'Decisao atualizada' : 'Decisao registrada');
      setOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const openEditor = async (decision: Decision | null) => {
    setEditing(decision);
    if (decision) {
      setForm({
        code: decision.code, subject: decision.subject, context: decision.context ?? '',
        alternatives: decision.alternatives ?? '', recommendation: decision.recommendation ?? '',
        decider_id: decision.decider_id ?? '', deadline: decision.deadline ?? '',
        status: decision.status, decision: decision.decision ?? '', rationale: decision.rationale ?? '',
      });
    } else {
      const code = await nextDecisionCode(projectId);
      setForm({
        code, subject: '', context: '', alternatives: '', recommendation: '',
        decider_id: '', deadline: '', status: 'em_preparacao', decision: '', rationale: '',
      });
    }
    setOpen(true);
  };

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (decisions.isLoading) return <Spinner />;

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => void openEditor(null)} icon={<Plus className="h-4 w-4" />}>Nova decisao</Button>
        </div>
      )}

      {(decisions.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Gavel className="h-6 w-6" />}
          title="Nenhuma decisao registrada"
          description="Registrar decisoes, alternativas avaliadas e justificativa e o que sustenta a governanca do projeto em auditoria."
        />
      ) : (
        <ul className="space-y-2">
          {(decisions.data ?? []).map((d) => (
            <li key={d.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted">{d.code}</span>
                  <h3 className="text-sm font-semibold">{d.subject}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <DecisionStatusBadge status={d.status} />
                  {d.deadline && <Badge tone="neutral">Prazo: {formatDate(d.deadline)}</Badge>}
                </div>
              </div>
              {d.recommendation && (
                <p className="mt-2 text-sm text-muted"><b className="text-fg">Recomendacao:</b> {d.recommendation}</p>
              )}
              {d.decision && (
                <p className="mt-1.5 rounded-lg bg-surface-2 p-2.5 text-sm">
                  <b>Decisao:</b> {d.decision}
                  {d.rationale && <><br /><span className="text-muted">Justificativa: {d.rationale}</span></>}
                  {d.decided_at && <><br /><span className="text-xs text-muted">Registrada em {formatDateTime(d.decided_at)}</span></>}
                </p>
              )}
              <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
                <span>Decisor: {d.decider?.full_name ?? '—'}</span>
                {(canEdit || (canDecide && d.status === 'aguardando_decisao')) && (
                  <button onClick={() => void openEditor(d)} className="text-brand hover:underline">
                    {canDecide && d.status === 'aguardando_decisao' ? 'Registrar decisao' : 'Editar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? `${editing.code} · ${editing.subject}` : 'Nova decisao'}
        description="Contexto, alternativas e justificativa ficam registrados na trilha de auditoria."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>Fechar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Codigo" required><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(decisionStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Assunto" required><Input value={form.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
          <Field label="Contexto"><Textarea value={form.context} onChange={(e) => set('context', e.target.value)} /></Field>
          <Field label="Alternativas avaliadas" hint="Liste as opcoes consideradas e seus trade-offs.">
            <Textarea value={form.alternatives} onChange={(e) => set('alternatives', e.target.value)} />
          </Field>
          <Field label="Recomendacao"><Textarea value={form.recommendation} onChange={(e) => set('recommendation', e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Decisor">
              <Select value={form.decider_id} onChange={(e) => set('decider_id', e.target.value)}>
                <option value="">Nao definido</option>
                {(profiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Data limite"><Input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
          </div>
          <Field label="Decisao tomada" hint="Obrigatorio para aprovar ou rejeitar.">
            <Textarea value={form.decision} onChange={(e) => set('decision', e.target.value)} />
          </Field>
          <Field label="Justificativa da decisao">
            <Textarea value={form.rationale} onChange={(e) => set('rationale', e.target.value)} />
          </Field>
        </div>
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------
export function IndicatorsTab({ projectId, canEdit, evmEnabled }: { projectId: string; canEdit: boolean; evmEnabled: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const colors = chartColors();
  const [selected, setSelected] = useState<Indicator | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', category: '', unit: 'numero', target_value: '',
    current_value: '', direction: 'maior_melhor', frequency: 'mensal', source: '', formula: '',
  });

  const indicators = useQuery({ queryKey: ['indicators', projectId], queryFn: () => listIndicators(projectId) });
  const measurements = useQuery({
    queryKey: ['measurements', selected?.id],
    queryFn: () => listMeasurements(selected!.id),
    enabled: Boolean(selected),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome do indicador.');
      await upsertIndicator({
        project_id: projectId,
        name: form.name.trim(),
        description: form.description || null,
        category: form.category || null,
        unit: form.unit as never,
        target_value: form.target_value ? Number(form.target_value) : null,
        current_value: form.current_value ? Number(form.current_value) : null,
        direction: form.direction as never,
        frequency: form.frequency as never,
        source: form.source || null,
        formula: form.formula || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indicators'] });
      toast.success('Indicador salvo');
      setOpen(false);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const formatValue = (indicator: Indicator, value: number | null) => {
    if (value == null) return '—';
    if (indicator.unit === 'percentual') return formatPercent(value);
    if (indicator.unit === 'prazo') return `D+${formatNumber(value, 0)}`;
    return formatNumber(value, 2);
  };

  if (indicators.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Novo indicador</Button>
        </div>
      )}

      {evmEnabled && <EvmPanel projectId={projectId} canEdit={canEdit} />}

      {(indicators.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum indicador cadastrado" description="Indicadores customizaveis permitem acompanhar meta, realizado, tendencia e semaforo por projeto." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(indicators.data ?? []).map((i) => {
            const target = Number(i.target_value ?? 0);
            const current = Number(i.current_value ?? 0);
            const good = i.direction === 'maior_melhor' ? current >= target : current <= target;
            return (
              <button
                key={i.id}
                onClick={() => setSelected(i)}
                className="card p-4 text-left transition-shadow hover:shadow-pop focus-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{i.name}</p>
                  <Badge tone={good ? 'ok' : 'danger'} dot>{good ? 'Na meta' : 'Fora da meta'}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatValue(i, i.current_value)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Meta: {formatValue(i, i.target_value)} · {i.frequency}
                  {i.trend && ` · tendencia ${i.trend}`}
                </p>
                {i.description && <p className="mt-2 line-clamp-2 text-xs text-muted">{i.description}</p>}
              </button>
            );
          })}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        description={selected?.description ?? undefined}
      >
        {measurements.isLoading ? <Spinner /> : (measurements.data ?? []).length === 0 ? (
          <EmptyState title="Sem medicoes registradas" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={measurements.data ?? []} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="reference_date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 10, fill: colors.muted }} />
              <YAxis tick={{ fontSize: 11, fill: colors.muted }} width={48} />
              <Tooltip content={<ChartTooltip />} labelFormatter={(v) => formatDate(String(v))} />
              <Line dataKey="value" name="Realizado" stroke={colors.brand} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="target_value" name="Meta" stroke={colors.muted} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Drawer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo indicador"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Categoria">
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </Field>
          <Field label="Unidade">
            <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {['numero', 'moeda', 'percentual', 'quantidade', 'prazo', 'score'].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Meta">
            <Input type="number" step="0.01" value={form.target_value} onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))} />
          </Field>
          <Field label="Realizado">
            <Input type="number" step="0.01" value={form.current_value} onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))} />
          </Field>
          <Field label="Direcao" hint="Define o semaforo do indicador.">
            <Select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
              <option value="maior_melhor">Maior e melhor</option>
              <option value="menor_melhor">Menor e melhor</option>
            </Select>
          </Field>
          <Field label="Periodicidade">
            <Select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
              {['diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'anual'].map((f2) => (
                <option key={f2} value={f2}>{f2}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fonte">
            <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
          </Field>
          <Field label="Formula" className="sm:col-span-2">
            <Input value={form.formula} onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))} placeholder="Ex.: conciliacoes automatizadas / total de conciliacoes" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** Abaixo de 1: atrasado (SPI) ou acima do custo (CPI) - entre 0.9 e 1: atencao. Convencao usual de EVM. */
function evmIndexTone(v: number | null): 'ok' | 'warn' | 'danger' | null {
  if (v == null) return null;
  if (v < 0.9) return 'danger';
  if (v < 1) return 'warn';
  return 'ok';
}

const blankEvmForm = { reference_date: toISODate(new Date()), pv: '', ev: '', ac: '' };

function EvmPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const colors = chartColors();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EvmSnapshot | null>(null);
  const [removing, setRemoving] = useState<EvmSnapshot | null>(null);
  const [form, setForm] = useState(blankEvmForm);

  const snapshots = useQuery({ queryKey: ['evm', projectId], queryFn: () => listEvmSnapshots(projectId) });
  const list = snapshots.data ?? [];
  const latest = list[list.length - 1] ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.reference_date) throw new Error('Informe a data de referencia.');
      await upsertEvmSnapshot({
        project_id: projectId,
        reference_date: form.reference_date,
        pv: Number(form.pv) || 0,
        ev: Number(form.ev) || 0,
        ac: Number(form.ac) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evm', projectId] });
      toast.success('Snapshot de EVM salvo');
      setOpen(false);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: (s: EvmSnapshot) => deleteEvmSnapshot(s.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evm', projectId] });
      setRemoving(null);
      toast.success('Snapshot excluido');
    },
    onError: (e) => toast.error('Nao foi possivel excluir', describeError(e)),
  });

  function openNew() {
    setEditing(null);
    setForm(blankEvmForm);
    setOpen(true);
  }
  function openEdit(s: EvmSnapshot) {
    setEditing(s);
    setForm({ reference_date: s.reference_date, pv: String(s.pv), ev: String(s.ev), ac: String(s.ac) });
    setOpen(true);
  }

  function kpiTone(v: number | null): KpiCardProps['tone'] {
    return evmIndexTone(v) ?? 'default';
  }
  function badgeTone(v: number | null): Tone {
    return evmIndexTone(v) ?? 'neutral';
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Earned Value Management</h3>
          <p className="text-xs text-muted">
            Snapshots de PV, EV e AC por data de referencia - SPI e CPI sao calculados automaticamente.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew} icon={<Plus className="h-3.5 w-3.5" />}>Novo snapshot</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="PV - Planejado" value={formatCurrencyCompact(latest?.pv)} hint={formatCurrency(latest?.pv)} />
        <KpiCard label="EV - Agregado" value={formatCurrencyCompact(latest?.ev)} hint={formatCurrency(latest?.ev)} />
        <KpiCard label="AC - Custo real" value={formatCurrencyCompact(latest?.ac)} hint={formatCurrency(latest?.ac)} />
        <KpiCard
          label="SPI" value={latest?.spi != null ? formatNumber(latest.spi, 2) : '—'}
          tone={kpiTone(latest?.spi ?? null)}
          hint="Schedule Performance Index (EV/PV). Abaixo de 1: cronograma atrasado."
        />
        <KpiCard
          label="CPI" value={latest?.cpi != null ? formatNumber(latest.cpi, 2) : '—'}
          tone={kpiTone(latest?.cpi ?? null)}
          hint="Cost Performance Index (EV/AC). Abaixo de 1: acima do custo planejado."
        />
      </div>

      <ChartCard
        title="Curva de Earned Value"
        description="PV, EV e AC por data de referencia"
        loading={snapshots.isLoading}
        empty={list.length === 0}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={list} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="reference_date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 10, fill: colors.muted }} />
            <YAxis tickFormatter={(v) => formatCurrencyCompact(v).replace('R$ ', '')} tick={{ fontSize: 11, fill: colors.muted }} width={56} />
            <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} labelFormatter={(v) => formatDate(String(v))} />
            <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
            <Line dataKey="pv" name="PV" stroke={colors.muted} strokeWidth={2} dot={{ r: 2 }} />
            <Line dataKey="ev" name="EV" stroke={colors.brand} strokeWidth={2} dot={{ r: 2 }} />
            <Line dataKey="ac" name="AC" stroke={colors.danger} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2">
            <tr>
              {['Data', 'PV', 'EV', 'AC', 'SPI', 'CPI', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr
                key={s.id}
                className={cn('border-t border-border', canEdit && 'cursor-pointer hover:bg-surface-2')}
                onClick={() => canEdit && openEdit(s)}
              >
                <td className="px-3 py-2">{formatDate(s.reference_date)}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrency(s.pv)}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrency(s.ev)}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrency(s.ac)}</td>
                <td className="px-3 py-2"><Badge tone={badgeTone(s.spi)}>{s.spi != null ? formatNumber(s.spi, 2) : '—'}</Badge></td>
                <td className="px-3 py-2"><Badge tone={badgeTone(s.cpi)}>{s.cpi != null ? formatNumber(s.cpi, 2) : '—'}</Badge></td>
                <td className="px-3 py-2 text-right">
                  {canEdit && (
                    <Button
                      variant="ghost" size="icon" aria-label="Excluir snapshot"
                      onClick={(e) => { e.stopPropagation(); setRemoving(s); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="Nenhum snapshot de EVM registrado"
                    description={canEdit ? 'Registre PV, EV e AC para uma data de referencia.' : undefined}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar snapshot de EVM' : 'Novo snapshot de EVM'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Data de referencia" required
            hint={editing ? 'A data nao e editavel - exclua e crie um novo snapshot para mudar a data.' : 'Reenviar a mesma data corrige o snapshot existente.'}
          >
            <Input
              type="date" value={form.reference_date} disabled={Boolean(editing)}
              onChange={(e) => setForm((f) => ({ ...f, reference_date: e.target.value }))}
            />
          </Field>
          <Field label="PV - Planned Value (R$)" required hint="Valor planejado ate a data de referencia.">
            <Input type="number" min="0" step="0.01" value={form.pv} onChange={(e) => setForm((f) => ({ ...f, pv: e.target.value }))} />
          </Field>
          <Field label="EV - Earned Value (R$)" required hint="Valor agregado (fisico) ate a data de referencia.">
            <Input type="number" min="0" step="0.01" value={form.ev} onChange={(e) => setForm((f) => ({ ...f, ev: e.target.value }))} />
          </Field>
          <Field label="AC - Actual Cost (R$)" required hint="Custo real incorrido ate a data de referencia.">
            <Input type="number" min="0" step="0.01" value={form.ac} onChange={(e) => setForm((f) => ({ ...f, ac: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        title="Excluir snapshot de EVM"
        confirmLabel="Excluir"
        description={<>O snapshot de <b>{removing && formatDate(removing.reference_date)}</b> sera removido permanentemente.</>}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status Reports
// ---------------------------------------------------------------------------
export function StatusReportsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StatusReport | null>(null);
  const [form, setForm] = useState({
    period_start: toISODate(new Date(Date.now() - 7 * 86_400_000)),
    period_end: toISODate(new Date()),
    executive_summary: '', main_deliveries: '', next_steps: '',
    risks_summary: '', issues_summary: '', financial_summary: '', required_decisions: '',
  });

  const reports = useQuery({ queryKey: ['status-reports', projectId], queryFn: () => listStatusReports(projectId) });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.executive_summary.trim()) throw new Error('O resumo executivo e obrigatorio.');
      return createStatusReport({
        project_id: projectId,
        period_start: form.period_start,
        period_end: form.period_end,
        health: 'cinza',
        executive_summary: form.executive_summary,
        main_deliveries: form.main_deliveries || null,
        next_steps: form.next_steps || null,
        risks_summary: form.risks_summary || null,
        issues_summary: form.issues_summary || null,
        financial_summary: form.financial_summary || null,
        required_decisions: form.required_decisions || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-reports'] });
      toast.success('Status Report criado como rascunho');
      setOpen(false);
    },
    onError: (e) => toast.error('Nao foi possivel criar', describeError(e)),
  });

  const publish = useMutation({
    mutationFn: (id: string) => publishStatusReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-reports'] });
      toast.success('Status Report publicado', 'O snapshot foi congelado e o report nao pode mais ser alterado.');
    },
    onError: (e) => toast.error('Nao foi possivel publicar', describeError(e)),
  });

  const saveDraft = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<StatusReport> }) => updateStatusReport(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-reports'] });
      toast.success('Rascunho salvo');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const published = useMemo(
    () => (reports.data ?? []).filter((r) => r.state !== 'rascunho'),
    [reports.data],
  );

  const comparison = useMemo(() => {
    if (published.length < 2) return null;
    const [current, previous] = published;
    return {
      current, previous,
      progressDelta: Number(current.progress_actual) - Number(previous.progress_actual),
    };
  }, [published]);

  if (reports.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Novo Status Report</Button>
        </div>
      )}

      {comparison && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Comparacao com o periodo anterior</h3>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted">Avanco no periodo</p>
              <p className={`text-lg font-semibold tabular-nums ${comparison.progressDelta >= 0 ? 'text-ok' : 'text-danger'}`}>
                {comparison.progressDelta >= 0 ? '+' : ''}{formatNumber(comparison.progressDelta, 1)} p.p.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Saude anterior</p>
              <div className="mt-1"><HealthBadge health={comparison.previous.health} /></div>
            </div>
            <div>
              <p className="text-xs text-muted">Saude atual</p>
              <div className="mt-1"><HealthBadge health={comparison.current.health} /></div>
            </div>
          </div>
        </div>
      )}

      {(reports.data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Nenhum Status Report emitido"
          description="Ao publicar, o sistema congela um snapshot do projeto. Correcoes exigem nova versao - o report publicado nunca e alterado silenciosamente."
        />
      ) : (
        <ul className="space-y-2">
          {(reports.data ?? []).map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">v{r.version}</span>
                    <Badge tone={statusReportStateTone[r.state]}>{statusReportStateLabel[r.state]}</Badge>
                    <HealthBadge health={r.health} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Periodo: {formatDate(r.period_start)} a {formatDate(r.period_end)}
                    {r.published_at && ` · publicado em ${formatDateTime(r.published_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(r)} className="text-xs text-brand hover:underline">Ver</button>
                  {canManage && r.state === 'rascunho' && (
                    <Button size="sm" onClick={() => publish.mutate(r.id)} loading={publish.isPending} icon={<Send className="h-3.5 w-3.5" />}>
                      Publicar
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{r.executive_summary}</p>
              <p className="mt-1 text-xs text-muted tabular-nums">
                Avanco: {formatPercent(r.progress_actual)} (planejado {formatPercent(r.progress_planned)})
              </p>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Status Report v${selected.version}` : ''}
        description={selected ? `${formatDate(selected.period_start)} a ${formatDate(selected.period_end)}` : undefined}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            {selected.state === 'publicado' && (
              <p className="rounded-lg border border-ok/30 bg-ok/10 p-2.5 text-xs text-ok">
                Report publicado e imutavel. Correcoes exigem uma nova versao.
              </p>
            )}
            <Section title="Resumo executivo" body={selected.executive_summary} />
            <Section title="Principais entregas" body={selected.main_deliveries} />
            <Section title="Proximos passos" body={selected.next_steps} />
            <Section title="Riscos" body={selected.risks_summary} />
            <Section title="Issues" body={selected.issues_summary} />
            <Section title="Financeiro" body={selected.financial_summary} />
            <Section title="Decisoes necessarias" body={selected.required_decisions} />

            {canManage && selected.state === 'rascunho' && (
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button
                  variant="secondary"
                  onClick={() => saveDraft.mutate({ id: selected.id, patch: { executive_summary: selected.executive_summary } })}
                  loading={saveDraft.isPending}
                >
                  Salvar rascunho
                </Button>
                <Button onClick={() => publish.mutate(selected.id)} loading={publish.isPending}>Publicar</Button>
              </div>
            )}

            {Object.keys(selected.snapshot ?? {}).length > 0 && (
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted">Snapshot congelado</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 text-[10px]">
                  {JSON.stringify(selected.snapshot, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo Status Report"
        description="O report nasce como rascunho. Ao publicar, um snapshot do projeto e congelado."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending}>Criar rascunho</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inicio do periodo" required>
              <Input type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} />
            </Field>
            <Field label="Fim do periodo" required>
              <Input type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} />
            </Field>
          </div>
          <Field label="Resumo executivo" required>
            <Textarea value={form.executive_summary} onChange={(e) => setForm((f) => ({ ...f, executive_summary: e.target.value }))} />
          </Field>
          <Field label="Principais entregas">
            <Textarea value={form.main_deliveries} onChange={(e) => setForm((f) => ({ ...f, main_deliveries: e.target.value }))} />
          </Field>
          <Field label="Proximos passos">
            <Textarea value={form.next_steps} onChange={(e) => setForm((f) => ({ ...f, next_steps: e.target.value }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Riscos"><Textarea value={form.risks_summary} onChange={(e) => setForm((f) => ({ ...f, risks_summary: e.target.value }))} /></Field>
            <Field label="Issues"><Textarea value={form.issues_summary} onChange={(e) => setForm((f) => ({ ...f, issues_summary: e.target.value }))} /></Field>
          </div>
          <Field label="Financeiro"><Textarea value={form.financial_summary} onChange={(e) => setForm((f) => ({ ...f, financial_summary: e.target.value }))} /></Field>
          <Field label="Decisoes necessarias"><Textarea value={form.required_decisions} onChange={(e) => setForm((f) => ({ ...f, required_decisions: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}
