import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, Pencil, Target } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { GoalThermometerGauge } from '@/components/charts/GoalThermometerGauge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import { validateWeightSum } from '@/lib/goalScore';
import {
  clearTaskBaseline, clearTaskScoreOverride, closeGoalPeriod, freezeTaskBaseline,
  getProjectGoalIndicator, getProjectGoalSettings, listGoalPeriods, listTaskGoalScores,
  overrideTaskScore, reopenGoalPeriod, upsertProjectGoalSettings, upsertTaskGoalConfig,
} from '@/services/goalIndicators';
import { formatDate, toISODate } from '@/utils/format';
import { goalClassificationLabel, goalClassificationTone, goalDayBasisLabel, goalWeightModeLabel } from '@/utils/domain-labels';
import type { GoalDayBasis, GoalWeightMode, ProjectGoalSettings, TaskGoalScore } from '@/types/domain';

const defaultSettings = (projectId: string): ProjectGoalSettings => ({
  project_id: projectId, enabled: false, day_basis: 'uteis', challenge_days: 2, minimum_days: 5,
  challenge_score: 15, target_score: 10, minimum_score: 1, weight_mode: 'igual',
});

function classify(score: number | null, challengeScore: number, targetScore: number, minimumScore: number) {
  if (score == null) return null;
  if (score >= challengeScore) return 'desafio' as const;
  if (score >= targetScore) return 'meta' as const;
  if (score <= minimumScore) return 'racional_minimo' as const;
  return 'abaixo_da_meta' as const;
}

export function GoalIndicatorTab({ projectId }: { projectId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('goal_indicator.manage');

  const settingsQuery = useQuery({
    queryKey: ['goal-settings', projectId], queryFn: () => getProjectGoalSettings(projectId),
  });
  const indicatorQuery = useQuery({
    queryKey: ['goal-indicator', projectId], queryFn: () => getProjectGoalIndicator(projectId),
  });
  const scoresQuery = useQuery({
    queryKey: ['goal-scores', projectId], queryFn: () => listTaskGoalScores(projectId),
  });
  const periodsQuery = useQuery({
    queryKey: ['goal-periods', projectId], queryFn: () => listGoalPeriods(projectId),
  });

  const [form, setForm] = useState<ProjectGoalSettings | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<TaskGoalScore | null>(null);
  const [overrideForm, setOverrideForm] = useState({ score: '', reason: '' });
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<{ competencia: string } | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const settings = form ?? settingsQuery.data ?? defaultSettings(projectId);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['goal-settings', projectId] });
    queryClient.invalidateQueries({ queryKey: ['goal-indicator', projectId] });
    queryClient.invalidateQueries({ queryKey: ['goal-scores', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const saveSettings = useMutation({
    mutationFn: () => upsertProjectGoalSettings(settings),
    onSuccess: () => {
      invalidateAll();
      setForm(null);
      toast.success('Configuracao do indicador atualizada', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const changeWeight = useMutation({
    mutationFn: ({ taskId, weight }: { taskId: string; weight: number }) =>
      upsertTaskGoalConfig({ task_id: taskId, included: true, weight }),
    onSuccess: () => invalidateAll(),
    onError: (e) => toast.error('Nao foi possivel salvar o peso', describeError(e)),
  });

  const toggleBaseline = useMutation({
    mutationFn: ({ taskId, freeze, dueDate }: { taskId: string; freeze: boolean; dueDate: string | null }) =>
      freeze ? freezeTaskBaseline(taskId, dueDate!) : clearTaskBaseline(taskId),
    onSuccess: (_d, { freeze }) => {
      invalidateAll();
      toast.success(freeze ? 'Baseline congelada' : 'Baseline liberada', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const saveOverride = useMutation({
    mutationFn: async () => {
      const score = Number(overrideForm.score);
      if (!Number.isFinite(score)) throw new Error('Informe uma nota valida.');
      if (overrideForm.reason.trim().length < 10) throw new Error('Justificativa obrigatoria (minimo 10 caracteres).');
      await overrideTaskScore(overrideTarget!.task_id, score, overrideForm.reason.trim());
    },
    onSuccess: () => {
      invalidateAll();
      setOverrideTarget(null);
      setOverrideForm({ score: '', reason: '' });
      toast.success('Nota ajustada manualmente', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel ajustar', describeError(e)),
  });

  const clearOverride = useMutation({
    mutationFn: (taskId: string) => clearTaskScoreOverride(taskId),
    onSuccess: () => { invalidateAll(); toast.success('Override removido'); },
    onError: (e) => toast.error('Nao foi possivel remover o ajuste', describeError(e)),
  });

  const closePeriod = useMutation({
    mutationFn: () => closeGoalPeriod(projectId, `${toISODate(new Date()).slice(0, 7)}-01`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal-periods', projectId] });
      setClosingPeriod(false);
      toast.success('Competencia fechada', 'O resultado deste mes foi congelado em um snapshot imutavel.');
    },
    onError: (e) => toast.error('Nao foi possivel fechar', describeError(e)),
  });

  const reopenPeriod = useMutation({
    mutationFn: () => reopenGoalPeriod(projectId, reopenTarget!.competencia, reopenReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal-periods', projectId] });
      setReopenTarget(null);
      setReopenReason('');
      toast.success('Competencia reaberta', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel reabrir', describeError(e)),
  });

  const weightCheck = useMemo(() => {
    if (settings.weight_mode !== 'manual') return { sum: 100, valid: true };
    return validateWeightSum((scoresQuery.data ?? []).map((s) => Number(s.weight)));
  }, [scoresQuery.data, settings.weight_mode]);

  const indicator = indicatorQuery.data;
  const scores = scoresQuery.data ?? [];

  if (settingsQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      {canManage && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4" /> Configuracao do Indicador de Meta</h2>
            {form && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancelar</Button>
                <Button size="sm" onClick={() => saveSettings.mutate()} loading={saveSettings.isPending}>Salvar</Button>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox" className="accent-[rgb(var(--c-brand))]"
                checked={settings.enabled}
                onChange={(e) => setForm({ ...settings, enabled: e.target.checked })}
              />
              Indicador ativo neste projeto
            </label>
            <Field label="Base de dias">
              <Select value={settings.day_basis} onChange={(e) => setForm({ ...settings, day_basis: e.target.value as GoalDayBasis })}>
                {Object.entries(goalDayBasisLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Desafio (dias antes da Meta)">
              <Input type="number" min="1" value={settings.challenge_days}
                onChange={(e) => setForm({ ...settings, challenge_days: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Racional minimo (dias apos a Meta)">
              <Input type="number" min="1" value={settings.minimum_days}
                onChange={(e) => setForm({ ...settings, minimum_days: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Distribuicao de pesos">
              <Select value={settings.weight_mode} onChange={(e) => setForm({ ...settings, weight_mode: e.target.value as GoalWeightMode })}>
                {Object.entries(goalWeightModeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Nota Desafio" hint="Padrao: 15"><Input type="number" step="0.5" value={settings.challenge_score}
              onChange={(e) => setForm({ ...settings, challenge_score: Number(e.target.value) || 15 })} /></Field>
            <Field label="Nota Meta" hint="Padrao: 10"><Input type="number" step="0.5" value={settings.target_score}
              onChange={(e) => setForm({ ...settings, target_score: Number(e.target.value) || 10 })} /></Field>
            <Field label="Nota minima" hint="Padrao: 1"><Input type="number" step="0.5" value={settings.minimum_score}
              onChange={(e) => setForm({ ...settings, minimum_score: Number(e.target.value) || 1 })} /></Field>
          </div>
        </section>
      )}

      {!settings.enabled ? (
        <EmptyState
          title="Indicador de Metas desativado neste projeto"
          description={canManage
            ? 'Ative acima para comecar a marcar entregas que compoem a meta de prazo.'
            : 'Fale com o Admin, PMO ou Sponsor do projeto para habilitar o indicador.'}
        />
      ) : scores.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega foi configurada para compor este indicador"
          description="Selecione as entregas do projeto que deverao ser consideradas, na aba Tarefas &amp; Entregas de cada tarefa."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Indicador Realizado"
              value={indicator?.indicator_realized != null ? indicator.indicator_realized.toFixed(2) : 'Pendente'}
              tone={indicator?.indicator_realized != null ? (indicator.indicator_realized >= 10 ? 'ok' : 'warn') : 'default'}
              hint="Media ponderada apenas das entregas ja concluidas."
            />
            <KpiCard
              label="Indicador Projetado"
              value={indicator?.indicator_projected != null ? indicator.indicator_projected.toFixed(2) : '—'}
              tone={indicator?.indicator_projected != null ? (indicator.indicator_projected >= 10 ? 'ok' : 'warn') : 'default'}
              hint="Considera as entregas pendentes como se fossem concluidas hoje - permite atuacao preventiva."
            />
            <KpiCard label="Entregas concluidas" value={indicator?.deliveries_done ?? 0} />
            <KpiCard label="Entregas pendentes" value={indicator?.deliveries_pending ?? 0} />
          </div>

          <div className="card grid gap-4 p-4 sm:grid-cols-2">
            <GoalThermometerGauge
              label="Indicador Realizado"
              value={indicator?.indicator_realized ?? null}
              target={settings.target_score}
              challenge={settings.challenge_score}
              min={0}
            />
            <GoalThermometerGauge
              label="Indicador Projetado"
              value={indicator?.indicator_projected ?? null}
              target={settings.target_score}
              challenge={settings.challenge_score}
              min={0}
            />
          </div>

          {settings.weight_mode === 'manual' && !weightCheck.valid && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
              A soma atual dos pesos e {weightCheck.sum.toFixed(0)}%. Distribua os {(100 - weightCheck.sum).toFixed(0)}%
              restantes entre as entregas antes de fechar a apuracao.
            </div>
          )}

          <section className="card overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-surface-2">
                <tr>
                  {['Entrega', 'Peso', 'Data Meta', 'Realizada', 'Nota', 'Nota Projetada', 'Status', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => {
                  const status = classify(
                    s.score_realized ?? s.score_projected, s.challenge_score, s.target_score, s.minimum_score,
                  );
                  const diffLabel = s.actual_date
                    ? `entregue ${formatDate(s.actual_date)}`
                    : 'ainda nao concluida';
                  return (
                    <tr key={s.task_id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{s.code} · {s.title}</p>
                        {s.baseline_frozen && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Lock className="h-3 w-3" /> baseline protegida (prazo atual: {formatDate(s.current_due_date)})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {settings.weight_mode === 'manual' && canManage ? (
                          <Input
                            type="number" min="0" step="1" className="h-8 w-20 py-0"
                            defaultValue={s.weight}
                            onBlur={(e) => {
                              const w = Number(e.target.value) || 0;
                              if (w !== s.weight) changeWeight.mutate({ taskId: s.task_id, weight: w });
                            }}
                          />
                        ) : `${s.weight}%`}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{formatDate(s.target_date)}</td>
                      <td className="px-3 py-2.5 text-muted">{s.actual_date ? formatDate(s.actual_date) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <Tooltip content={
                          <div>
                            <p>Meta: {formatDate(s.target_date)}</p>
                            <p>{diffLabel}</p>
                            {s.is_override && <p>Ajustada manualmente: {s.override_reason}</p>}
                          </div>
                        }>
                          <span className="tabular-nums font-medium underline decoration-dotted">
                            {s.score_realized != null ? s.score_realized.toFixed(2) : 'Pendente'}
                          </span>
                        </Tooltip>
                        {s.is_override && <Badge tone="strategic" className="ml-1.5">Ajustada</Badge>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">
                        {s.score_projected != null ? s.score_projected.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {status && <Badge tone={goalClassificationTone[status]}>{goalClassificationLabel[status]}</Badge>}
                      </td>
                      <td className="px-3 py-2.5">
                        {canManage && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              icon={<Pencil className="h-3.5 w-3.5" />}
                              onClick={() => { setOverrideTarget(s); setOverrideForm({ score: String(s.score_realized ?? ''), reason: '' }); }}
                            >
                              Ajustar
                            </Button>
                            {s.is_override && (
                              <Button variant="ghost" size="sm" onClick={() => clearOverride.mutate(s.task_id)}>Remover ajuste</Button>
                            )}
                            <Button
                              variant="ghost" size="sm"
                              icon={s.baseline_frozen ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                              onClick={() => toggleBaseline.mutate({
                                taskId: s.task_id, freeze: !s.baseline_frozen, dueDate: s.current_due_date,
                              })}
                            >
                              {s.baseline_frozen ? 'Liberar baseline' : 'Congelar baseline'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {canManage && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Fechamento de apuracao</h2>
              <p className="mb-3 text-xs text-muted">
                Fechar a competencia congela o resultado atual num snapshot - reprogramacoes futuras no cronograma
                nao alteram mais silenciosamente esse resultado historico.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setClosingPeriod(true)}>
                Fechar competencia atual
              </Button>
              {(periodsQuery.data ?? []).length > 0 && (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {(periodsQuery.data ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span>{formatDate(p.competencia)} · Realizado {p.indicator_realized?.toFixed(2) ?? '—'}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone={p.status === 'fechado' ? 'ok' : 'neutral'}>{p.status === 'fechado' ? 'Fechado' : 'Em apuracao'}</Badge>
                        {p.status === 'fechado' && (
                          <Button variant="ghost" size="sm" onClick={() => setReopenTarget({ competencia: p.competencia })}>Reabrir</Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={Boolean(overrideTarget)}
        onClose={() => setOverrideTarget(null)}
        title="Ajustar nota manualmente"
        description="Override restrito a Admin, PMO e Gerencia. Fica identificado como 'Nota ajustada manualmente' e registrado na auditoria."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideTarget(null)}>Cancelar</Button>
            <Button onClick={() => saveOverride.mutate()} loading={saveOverride.isPending}>Confirmar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nova nota" required>
            <Input type="number" step="0.01" value={overrideForm.score}
              onChange={(e) => setOverrideForm((f) => ({ ...f, score: e.target.value }))} />
          </Field>
          <Field label="Justificativa" required hint="Minimo de 10 caracteres.">
            <Textarea value={overrideForm.reason}
              onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ex.: Entrega aceita formalmente antes da data por decisao do Steering." />
          </Field>
        </div>
      </Modal>

      <Modal
        open={closingPeriod}
        onClose={() => setClosingPeriod(false)}
        title="Fechar competencia atual"
        description="O resultado corrente (realizado e projetado, por entrega) sera gravado como snapshot imutavel."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosingPeriod(false)}>Cancelar</Button>
            <Button onClick={() => closePeriod.mutate()} loading={closePeriod.isPending}>Fechar</Button>
          </>
        }
      >
        Confirma o fechamento de {formatDate(`${toISODate(new Date()).slice(0, 7)}-01`)}?
      </Modal>

      <Modal
        open={Boolean(reopenTarget)}
        onClose={() => setReopenTarget(null)}
        title="Reabrir apuracao"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenTarget(null)}>Cancelar</Button>
            <Button onClick={() => reopenPeriod.mutate()} loading={reopenPeriod.isPending} disabled={reopenReason.trim().length < 10}>
              Reabrir
            </Button>
          </>
        }
      >
        <Field label="Justificativa" required hint="Minimo de 10 caracteres. Fica registrada na auditoria.">
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
