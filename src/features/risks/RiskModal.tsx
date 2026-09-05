import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import { nextRiskCode, upsertRisk, type RiskWithContext } from '@/services/risks';
import { listActiveProfiles } from '@/services/projects';
import { criticalityLabel, criticalityTone, riskCriticality, riskStatusLabel, riskStrategyLabel } from '@/utils/domain-labels';

const blank = {
  code: '', kind: 'risco', category: '', title: '', description: '', cause: '', consequence: '',
  probability: '3', impact: '3', owner_id: '', strategy: '', mitigation_plan: '',
  due_date: '', status: 'aberto', residual_probability: '', residual_impact: '',
  identified_at: new Date().toISOString().slice(0, 10), last_review_at: '', evidence_url: '',
};

export function RiskModal({
  open, onClose, projectId, risk, canEdit,
}: { open: boolean; onClose: () => void; projectId: string; risk: RiskWithContext | null; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });

  useEffect(() => {
    if (!open) return;
    if (risk) {
      setForm({
        code: risk.code, kind: risk.kind, category: risk.category ?? '', title: risk.title,
        description: risk.description ?? '', cause: risk.cause ?? '', consequence: risk.consequence ?? '',
        probability: String(risk.probability), impact: String(risk.impact), owner_id: risk.owner_id ?? '',
        strategy: risk.strategy ?? '', mitigation_plan: risk.mitigation_plan ?? '',
        due_date: risk.due_date ?? '', status: risk.status,
        residual_probability: risk.residual_probability != null ? String(risk.residual_probability) : '',
        residual_impact: risk.residual_impact != null ? String(risk.residual_impact) : '',
        identified_at: risk.identified_at, last_review_at: risk.last_review_at ?? '',
        evidence_url: risk.evidence_url ?? '',
      });
    } else {
      setForm(blank);
      void nextRiskCode(projectId).then((code) => setForm((f) => ({ ...f, code })));
    }
  }, [open, risk, projectId]);

  const score = Number(form.probability) * Number(form.impact);
  const level = riskCriticality(score);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Informe o titulo do risco.');
      await upsertRisk({
        id: risk?.id,
        project_id: projectId,
        code: form.code.trim(),
        kind: form.kind as 'risco' | 'issue',
        category: form.category || null,
        title: form.title.trim(),
        description: form.description || null,
        cause: form.cause || null,
        consequence: form.consequence || null,
        probability: Number(form.probability),
        impact: Number(form.impact),
        owner_id: form.owner_id || null,
        strategy: (form.strategy || null) as never,
        mitigation_plan: form.mitigation_plan || null,
        due_date: form.due_date || null,
        status: form.status as never,
        residual_probability: form.residual_probability ? Number(form.residual_probability) : null,
        residual_impact: form.residual_impact ? Number(form.residual_impact) : null,
        identified_at: form.identified_at,
        last_review_at: form.last_review_at || null,
        evidence_url: form.evidence_url || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(risk ? 'Risco atualizado' : 'Risco registrado');
      onClose();
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={risk ? `${risk.code} · ${risk.title}` : 'Novo risco ou issue'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          {canEdit && <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>}
        </>
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Codigo" required><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Tipo">
          <Select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="risco">Risco (potencial)</option>
            <option value="issue">Issue (materializado)</option>
          </Select>
        </Field>

        <Field label="Titulo" required className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Categoria"><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Prazo, Regulatorio, Sistemas..." /></Field>
        <Field label="Responsavel">
          <Select value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
            <option value="">Sem responsavel</option>
            {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>

        <Field label="Descricao" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Causa"><Textarea value={form.cause} onChange={(e) => set('cause', e.target.value)} /></Field>
        <Field label="Consequencia"><Textarea value={form.consequence} onChange={(e) => set('consequence', e.target.value)} /></Field>

        <Field label="Probabilidade (1-5)">
          <Select value={form.probability} onChange={(e) => set('probability', e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Impacto (1-5)">
          <Select value={form.impact} onChange={(e) => set('impact', e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>

        <div className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">Score calculado:</span>
          <span className="font-semibold tabular-nums">{score}</span>
          <Badge tone={criticalityTone[level]}>{criticalityLabel[level]}</Badge>
        </div>

        <Field label="Estrategia">
          <Select value={form.strategy} onChange={(e) => set('strategy', e.target.value)}>
            <option value="">Nao definida</option>
            {Object.entries(riskStrategyLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(riskStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>

        <Field label="Plano de mitigacao" className="sm:col-span-2"
          hint={score >= 15 && !form.mitigation_plan ? 'Risco critico sem plano gera alerta automatico.' : undefined}>
          <Textarea value={form.mitigation_plan} onChange={(e) => set('mitigation_plan', e.target.value)} />
        </Field>

        <Field label="Prazo do plano"><Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
        <Field label="Ultima revisao"><Input type="date" value={form.last_review_at} onChange={(e) => set('last_review_at', e.target.value)} /></Field>

        <Field label="Risco residual - probabilidade">
          <Select value={form.residual_probability} onChange={(e) => set('residual_probability', e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Risco residual - impacto">
          <Select value={form.residual_impact} onChange={(e) => set('residual_impact', e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>

        <Field label="Data de identificacao"><Input type="date" value={form.identified_at} onChange={(e) => set('identified_at', e.target.value)} /></Field>
        <Field label="Evidencia (URL)"><Input type="url" value={form.evidence_url} onChange={(e) => set('evidence_url', e.target.value)} placeholder="https://..." /></Field>
      </fieldset>
    </Drawer>
  );
}
