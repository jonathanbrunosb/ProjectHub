import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import {
  createTask, deleteTask, listTaskCorresponsibles, nextTaskCode, replaceTaskCorresponsibles, updateTask,
  type TaskWithContext,
} from '@/services/tasks';
import { listProjectMembers } from '@/services/projects';
import { getProjectGoalSettings, listTaskGoalConfigs, upsertTaskGoalConfig } from '@/services/goalIndicators';
import { priorityLabel, taskStatusLabel } from '@/utils/domain-labels';
import type { Priority, TaskStatus } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  task: TaskWithContext | null;
  canEdit: boolean;
}

const blank = {
  code: '', title: '', description: '', assignee_id: '', priority: 'media' as Priority,
  status: 'nao_iniciada' as TaskStatus, start_date: '', due_date: '', completed_at: '',
  weight: '1', progress: '0', is_milestone: false, is_critical: false, estimated_hours: '',
  assignee_allocation_percent: '',
};

interface ResponsibleRow { profile_id: string; percent: string }

/**
 * 'empty'    = nenhum percentual informado - rateio igualitario (valido).
 * 'partial'  = alguns preenchidos, outros nao - invalido, precisa completar.
 * 'complete' = todos preenchidos - valido so' se a soma fechar em 100% (tolerancia 0.5pp).
 */
function percentSum(rows: ResponsibleRow[]): { state: 'empty' | 'partial' | 'complete'; sum: number; valid: boolean } {
  if (rows.length === 0) return { state: 'empty', sum: 0, valid: true };
  const filledCount = rows.filter((r) => r.percent.trim() !== '').length;
  if (filledCount === 0) return { state: 'empty', sum: 0, valid: true };
  if (filledCount !== rows.length) return { state: 'partial', sum: 0, valid: false };
  const sum = rows.reduce((acc, r) => acc + Number(r.percent), 0);
  return { state: 'complete', sum, valid: sum >= 99.5 && sum <= 100.5 };
}

const blankGoal = { included: false, goalWeight: '0' };

export function TaskModal({ open, onClose, projectId, task, canEdit }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState(blank);
  const [goalForm, setGoalForm] = useState(blankGoal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => listProjectMembers(projectId), enabled: open });
  const assignees = useMemo(() => {
    const options = (members.data ?? [])
      .filter((member) => member.status === 'ativo' && member.profile?.active)
      .map((member) => ({ id: member.profile_id, name: member.profile?.full_name ?? 'Colaborador' }));
    if (task?.assignee_id && task.assignee && !options.some((person) => person.id === task.assignee_id)) {
      options.push({ id: task.assignee_id, name: `${task.assignee.full_name} (vinculo historico)` });
    }
    return options;
  }, [members.data, task]);
  const goalSettings = useQuery({
    queryKey: ['goal-settings', projectId], queryFn: () => getProjectGoalSettings(projectId), enabled: open,
  });
  // Sem `id` ainda (tarefa nova) nao ha como vincular task_goal_config - so'
  // carrega/oferece o campo ao editar uma tarefa ja existente.
  const goalConfigs = useQuery({
    queryKey: ['goal-config', task?.id], queryFn: () => listTaskGoalConfigs([task!.id]), enabled: open && Boolean(task),
  });
  const canManageGoal = can('goal_indicator.manage');
  const showGoalField = Boolean(task) && canManageGoal && goalSettings.data?.enabled;

  // Rateio de horas planejadas entre responsaveis - so' faz sentido para uma
  // tarefa ja salva (task_corresponsibles referencia task_id).
  const corresponsibles = useQuery({
    queryKey: ['task-corresponsibles', task?.id], queryFn: () => listTaskCorresponsibles(task!.id), enabled: open && Boolean(task),
  });
  const [responsibleRows, setResponsibleRows] = useState<ResponsibleRow[]>([]);
  const candidateResponsibles = useMemo(() => {
    const used = new Set([form.assignee_id, ...responsibleRows.map((r) => r.profile_id)]);
    return assignees.filter((person) => !used.has(person.id));
  }, [assignees, form.assignee_id, responsibleRows]);
  const rateio = percentSum(responsibleRows.length > 0 ? [{ profile_id: 'assignee', percent: form.assignee_allocation_percent }, ...responsibleRows] : []);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        code: task.code,
        title: task.title,
        description: task.description ?? '',
        assignee_id: task.assignee_id ?? '',
        priority: task.priority,
        status: task.status,
        start_date: task.start_date ?? '',
        due_date: task.due_date ?? '',
        completed_at: task.completed_at ?? '',
        weight: String(task.weight),
        progress: String(task.progress),
        is_milestone: task.is_milestone,
        is_critical: task.is_critical,
        estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : '',
        assignee_allocation_percent: task.assignee_allocation_percent != null ? String(task.assignee_allocation_percent) : '',
      });
    } else {
      setForm(blank);
      setGoalForm(blankGoal);
      setResponsibleRows([]);
      void nextTaskCode(projectId).then((code) => setForm((f) => ({ ...f, code })));
    }
  }, [open, task, projectId]);

  useEffect(() => {
    if (!open || !task) return;
    const cfg = goalConfigs.data?.[0];
    setGoalForm({ included: cfg?.included ?? false, goalWeight: String(cfg?.weight ?? 0) });
  }, [open, task, goalConfigs.data]);

  useEffect(() => {
    if (!open || !task) return;
    setResponsibleRows((corresponsibles.data ?? []).map((c) => ({
      profile_id: c.profile_id, percent: c.allocation_percent != null ? String(c.allocation_percent) : '',
    })));
  }, [open, task, corresponsibles.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['milestones'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        project_id: projectId,
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description || null,
        assignee_id: form.assignee_id || null,
        priority: form.priority,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        // Concluida carrega a data de conclusao (editavel - o gatilho do banco so'
        // preenche current_date automaticamente quando o campo vem vazio); qualquer
        // outro status limpa a data - uma tarefa reaberta nao deve continuar "concluida"
        // para efeito do Indicador de Metas (nota realizada e' removida ate' concluir de novo).
        completed_at: form.status === 'concluida' ? (form.completed_at || null) : null,
        weight: Number(form.weight) || 1,
        progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
        is_milestone: form.is_milestone,
        is_critical: form.is_critical,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        // So' grava o percentual do assignee quando ha co-responsaveis com
        // rateio valido - com um unico responsavel a participacao e' sempre
        // 100% e o campo fica sem sentido.
        assignee_allocation_percent: rateio.state === 'complete' ? Number(form.assignee_allocation_percent) : null,
      };
      if (!payload.title) throw new Error('Informe o titulo da tarefa.');
      if (payload.start_date && payload.due_date && payload.due_date < payload.start_date) {
        throw new Error('A data de termino deve ser posterior a data de inicio.');
      }
      if (!rateio.valid) {
        throw new Error('O rateio deve ser preenchido para todos os responsaveis e somar 100%, ou deixado em branco para dividir igualmente.');
      }
      if (task) await updateTask(task.id, payload);
      else await createTask(payload);

      if (task) {
        await replaceTaskCorresponsibles(task.id, responsibleRows.map((row) => ({
          profile_id: row.profile_id,
          allocation_percent: rateio.state === 'complete' ? Number(row.percent) : null,
        })));
      }

      if (task && showGoalField) {
        await upsertTaskGoalConfig({
          task_id: task.id, included: goalForm.included, weight: Number(goalForm.goalWeight) || 0,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['goal-scores'] });
      queryClient.invalidateQueries({ queryKey: ['goal-indicator'] });
      queryClient.invalidateQueries({ queryKey: ['task-corresponsibles'] });
      queryClient.invalidateQueries({ queryKey: ['task-planned-allocation'] });
      // Faltava isto: sem invalidar, reabrir o mesmo drawer mostrava o valor
      // antigo em cache do checkbox/peso, dando a impressao de que nao salvou.
      queryClient.invalidateQueries({ queryKey: ['goal-config'] });
      toast.success(task ? 'Tarefa atualizada' : 'Tarefa criada');
      onClose();
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteTask(task!.id),
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa excluida');
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error('Nao foi possivel excluir', describeError(e)),
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={task ? `${task.code} · ${task.title}` : 'Nova tarefa'}
        description={task ? 'Alteracoes de prazo geram registro de reprogramacao no historico.' : undefined}
        footer={
          <>
            {task && canEdit && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-3.5 w-3.5" />}>
                Excluir
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            {canEdit && <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>}
          </>
        }
      >
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Codigo" required>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
          </Field>
          <Field label="Responsavel">
            <Select value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
              <option value="">Nao atribuido</option>
              {assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>
          </Field>

          <Field label="Titulo" required className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(taskStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>

          <Field label="Inicio">
            <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </Field>
          <Field label="Termino">
            <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </Field>

          {form.status === 'concluida' && (
            <Field
              label="Data de conclusao"
              hint="Preenchida com a data de hoje automaticamente. Ajuste aqui se a conclusao real foi em outra data - usada no Indicador de Metas."
            >
              <Input type="date" value={form.completed_at} onChange={(e) => set('completed_at', e.target.value)} />
            </Field>
          )}

          <Field label="Peso" hint="Usado no calculo ponderado do avanco do projeto.">
            <Input type="number" min="0.1" step="0.5" value={form.weight} onChange={(e) => set('weight', e.target.value)} />
          </Field>
          <Field label="Progresso (%)" hint="Status 'Concluida' fixa o progresso em 100%.">
            <Input type="number" min="0" max="100" value={form.progress} onChange={(e) => set('progress', e.target.value)} />
          </Field>

          <Field
            label="Horas estimadas"
            hint={task && task.baseline_estimated_hours != null && Number(form.estimated_hours) !== task.baseline_estimated_hours
              ? `Baseline original: ${task.baseline_estimated_hours}h` : undefined}
          >
            <Input type="number" min="0" step="1" value={form.estimated_hours} onChange={(e) => set('estimated_hours', e.target.value)} />
          </Field>

          {task && (
            <div className="sm:col-span-2 rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Responsaveis e rateio da alocacao planejada</p>
                {candidateResponsibles.length > 0 && (
                  <Button
                    type="button" size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setResponsibleRows((rows) => [...rows, { profile_id: candidateResponsibles[0].id, percent: '' }])}
                  >
                    Adicionar responsavel
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{assignees.find((a) => a.id === form.assignee_id)?.name ?? 'Sem responsavel principal'}</span>
                {responsibleRows.length > 0 ? (
                  <Input
                    aria-label="Participacao do responsavel principal (%)" type="number" min="0" max="100" step="0.1" className="w-20"
                    value={form.assignee_allocation_percent} onChange={(e) => set('assignee_allocation_percent', e.target.value)}
                  />
                ) : <span className="text-xs text-muted">100%</span>}
                <span />
                {responsibleRows.map((row, index) => (
                  <div key={`${row.profile_id}-${index}`} className="contents">
                    <Select
                      aria-label="Co-responsavel"
                      className="min-w-0"
                      value={row.profile_id}
                      onChange={(e) => setResponsibleRows((rows) => rows.map((r, i) => (i === index ? { ...r, profile_id: e.target.value } : r)))}
                    >
                      <option value={row.profile_id}>{assignees.find((a) => a.id === row.profile_id)?.name ?? 'Colaborador'}</option>
                      {candidateResponsibles.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </Select>
                    <Input
                      aria-label="Participacao (%)" type="number" min="0" max="100" step="0.1" className="w-20"
                      value={row.percent} onChange={(e) => setResponsibleRows((rows) => rows.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)))}
                    />
                    <Button
                      type="button" size="icon" variant="ghost" aria-label="Remover responsavel"
                      onClick={() => setResponsibleRows((rows) => rows.filter((_, i) => i !== index))}
                    ><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
              <p className={`mt-2 text-xs ${rateio.valid ? 'text-muted' : 'text-danger'}`}>
                {responsibleRows.length === 0 && 'Sem co-responsaveis: 100% das horas planejadas vao para o responsavel principal.'}
                {rateio.state === 'empty' && responsibleRows.length > 0 && 'Deixe os percentuais em branco para ratear as horas planejadas igualmente entre os responsaveis.'}
                {rateio.state === 'partial' && 'Preencha o percentual de todos os responsaveis (ou deixe todos em branco).'}
                {rateio.state === 'complete' && `Total: ${rateio.sum.toFixed(1)}%${rateio.valid ? '' : ' - deve somar 100%'}`}
              </p>
            </div>
          )}

          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[rgb(var(--c-brand))]" checked={form.is_milestone} onChange={(e) => set('is_milestone', e.target.checked)} />
              Marco
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[rgb(var(--c-brand))]" checked={form.is_critical} onChange={(e) => set('is_critical', e.target.checked)} />
              Critica
            </label>
          </div>

          {showGoalField && (
            <>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" className="accent-[rgb(var(--c-brand))]"
                    checked={goalForm.included}
                    onChange={(e) => setGoalForm((f) => ({ ...f, included: e.target.checked }))}
                  />
                  Compoe Indicador de Meta?
                </label>
              </div>
              {goalForm.included && goalSettings.data?.weight_mode === 'manual' && (
                <Field label="Peso no indicador (%)">
                  <Input
                    type="number" min="0" step="1" value={goalForm.goalWeight}
                    onChange={(e) => setGoalForm((f) => ({ ...f, goalWeight: e.target.value }))}
                  />
                </Field>
              )}
            </>
          )}
        </fieldset>

        {task && (
          <div className="mt-4 border-t border-border pt-4">
            <AttachmentsPanel projectId={projectId} entity="task" entityId={task.id} canEdit={canEdit} compact />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Excluir tarefa"
        confirmLabel="Excluir"
        confirmText={task?.code}
        description={
          <>A exclusao remove a tarefa, suas dependencias e o checklist. O evento fica registrado na trilha de auditoria.</>
        }
      />
    </>
  );
}
