import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import { listRisks, nextActionCode, upsertActionPlan, type ActionPlanWithContext } from '@/services/risks';
import { listActiveProfiles } from '@/services/projects';
import { actionStatusLabel, priorityLabel } from '@/utils/domain-labels';

const blank = {
  code: '', title: '', description: '', origin: 'projeto', risk_id: '', owner_id: '',
  due_date: '', status: 'nao_iniciada', priority: 'media', evidence_url: '', comment: '',
};

export function ActionPlanModal({
  open, onClose, projectId, action, canEdit, defaultRiskId,
}: {
  open: boolean; onClose: () => void; projectId: string;
  action: ActionPlanWithContext | null; canEdit: boolean; defaultRiskId?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);

  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });
  const risks = useQuery({ queryKey: ['risks', projectId], queryFn: () => listRisks(projectId), enabled: open });

  useEffect(() => {
    if (!open) return;
    if (action) {
      setForm({
        code: action.code, title: action.title, description: action.description ?? '',
        origin: action.origin, risk_id: action.risk_id ?? '', owner_id: action.owner_id ?? '',
        due_date: action.due_date ?? '', status: action.status, priority: action.priority,
        evidence_url: action.evidence_url ?? '', comment: action.comment ?? '',
      });
    } else {
      setForm({ ...blank, risk_id: defaultRiskId ?? '', origin: defaultRiskId ? 'risco' : 'projeto' });
      void nextActionCode(projectId).then((code) => setForm((f) => ({ ...f, code })));
    }
  }, [open, action, projectId, defaultRiskId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Informe a acao.');
      await upsertActionPlan({
        id: action?.id,
        project_id: projectId,
        risk_id: form.risk_id || null,
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description || null,
        origin: form.origin,
        owner_id: form.owner_id || null,
        due_date: form.due_date || null,
        status: form.status as never,
        priority: form.priority as never,
        evidence_url: form.evidence_url || null,
        comment: form.comment || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(action ? 'Plano de acao atualizado' : 'Plano de acao criado');
      onClose();
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={action ? `${action.code} · ${action.title}` : 'Novo plano de acao'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          {canEdit && <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>}
        </>
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Codigo" required><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Origem">
          <Select value={form.origin} onChange={(e) => set('origin', e.target.value)}>
            <option value="projeto">Projeto</option>
            <option value="risco">Risco</option>
            <option value="issue">Issue</option>
            <option value="auditoria">Auditoria</option>
          </Select>
        </Field>

        <Field label="Acao" required className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Descricao" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <Field label="Risco vinculado" className="sm:col-span-2">
          <Select value={form.risk_id} onChange={(e) => set('risk_id', e.target.value)}>
            <option value="">Nenhum (acao direta do projeto)</option>
            {risks.data?.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
          </Select>
        </Field>

        <Field label="Responsavel">
          <Select value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
            <option value="">Sem responsavel</option>
            {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Prazo"><Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>

        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(actionStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>

        <Field label="Evidencia (URL)"><Input type="url" value={form.evidence_url} onChange={(e) => set('evidence_url', e.target.value)} /></Field>
        <Field label="Comentario"><Textarea value={form.comment} onChange={(e) => set('comment', e.target.value)} /></Field>
      </fieldset>
    </Drawer>
  );
}
