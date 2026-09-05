import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import { createTask, deleteTask, nextTaskCode, updateTask, type TaskWithContext } from '@/services/tasks';
import { listActiveProfiles } from '@/services/projects';
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
};

const blankGoal = { included: false, goalWeight: '0' };

export function TaskModal({ open, onClose, projectId, task, canEdit }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState(blank);
  const [goalForm, setGoalForm] = useState(blankGoal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });
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
      });
    } else {
      setForm(blank);
      setGoalForm(blankGoal);
      void nextTaskCode(projectId).then((code) => setForm((f) => ({ ...f, code })));
    }
  }, [open, task, projectId]);

  useEffect(() => {
    if (!open || !task) return;
    const cfg = goalConfigs.data?.[0];
    setGoalForm({ included: cfg?.included ?? false, goalWeight: String(cfg?.weight ?? 0) });
  }, [open, task, goalConfigs.data]);

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
      };
      if (!payload.title) throw new Error('Informe o titulo da tarefa.');
      if (payload.start_date && payload.due_date && payload.due_date < payload.start_date) {
        throw new Error('A data de termino deve ser posterior a data de inicio.');
      }
      if (task) await updateTask(task.id, payload);
      else await createTask(payload);

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
              {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
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

          <Field label="Horas estimadas">
            <Input type="number" min="0" step="1" value={form.estimated_hours} onChange={(e) => set('estimated_hours', e.target.value)} />
          </Field>

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
