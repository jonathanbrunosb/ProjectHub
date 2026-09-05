import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import {
  createProject, listActiveProfiles, listCompanies, listTeams, listTemplates,
} from '@/services/projects';
import { toISODate } from '@/utils/format';
import { financialModeLabel, priorityLabel } from '@/utils/domain-labels';
import type { FinancialModuleMode, Priority } from '@/types/domain';

const schema = z.object({
  code: z.string().regex(/^[A-Z0-9][A-Z0-9._-]{1,29}$/, 'Use letras maiusculas, numeros, ponto, hifen ou underscore (2 a 30 caracteres).'),
  name: z.string().min(4, 'Informe um nome com pelo menos 4 caracteres.'),
  category: z.string().min(2, 'Informe a categoria.'),
  start_date: z.string().min(10, 'Informe a data de inicio.'),
  target_date: z.string().optional().nullable(),
  budget: z.number().nonnegative('Orcamento nao pode ser negativo.').nullable(),
}).refine(
  (v) => !v.target_date || v.target_date >= v.start_date,
  { path: ['target_date'], message: 'A data-alvo deve ser posterior a data de inicio.' },
);

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManageFinancial = can('financial_module.manage');

  const [form, setForm] = useState({
    code: '', name: '', template_id: '', category: '', priority: 'media' as Priority,
    owner_id: '', sponsor_id: '', company_id: '', team_id: '',
    start_date: toISODate(new Date()), target_date: '', budget: '', objective: '',
    financial_module_mode: 'inherit' as FinancialModuleMode,
    financialModeTouched: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates, enabled: open });
  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });
  const teams = useQuery({ queryKey: ['teams'], queryFn: listTeams, enabled: open });
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: open });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Ao escolher o template, herda categoria e padrao financeiro como ponto
      // de partida - o usuario ainda pode mudar antes de salvar.
      if (key === 'template_id' && value) {
        const tpl = templates.data?.find((t) => t.id === value);
        if (tpl && !f.category) next.category = tpl.category;
        if (tpl && !f.financialModeTouched) next.financial_module_mode = tpl.financial_module_default;
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        category: form.category.trim(),
        start_date: form.start_date,
        target_date: form.target_date || null,
        budget: form.budget ? Number(form.budget) : null,
      });
      if (!parsed.success) {
        const map: Record<string, string> = {};
        for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
        setErrors(map);
        throw new Error('Corrija os campos destacados.');
      }
      setErrors({});
      return createProject({
        code: parsed.data.code,
        name: parsed.data.name,
        template_id: form.template_id || null,
        category: parsed.data.category,
        priority: form.priority,
        owner_id: form.owner_id || null,
        sponsor_id: form.sponsor_id || null,
        company_id: form.company_id || null,
        team_id: form.team_id || null,
        start_date: parsed.data.start_date,
        target_date: parsed.data.target_date ?? null,
        budget: parsed.data.budget,
        objective: form.objective || null,
        financial_module_mode: form.financial_module_mode,
      });
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto criado', form.template_id ? 'Fases, tarefas e marcos do template foram instanciados.' : undefined);
      onClose();
      navigate(`/projetos/${id}`);
    },
    onError: (error) => {
      if ((error as Error).message !== 'Corrija os campos destacados.') {
        toast.error('Nao foi possivel criar o projeto', describeError(error));
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo projeto"
      description="Escolher um template instancia fases, tarefas, marcos e campos personalizados automaticamente."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>Criar projeto</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Codigo" required error={errors.code} hint="Ex.: CTB-2026-007">
          <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="CTB-2026-007" />
        </Field>
        <Field label="Template" hint="Opcional - define estrutura inicial do projeto.">
          <Select value={form.template_id} onChange={(e) => set('template_id', e.target.value)}>
            <option value="">Sem template (projeto em branco)</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>

        <Field label="Nome do projeto" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Adocao do CPC 51 nas controladas" />
        </Field>

        <Field label="Categoria" required error={errors.category}>
          <Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Regulatorio, Sistemas, Inovacao..." />
        </Field>
        <Field label="Prioridade">
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>

        <Field label="Owner (gerente do projeto)">
          <Select value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
            <option value="">Definir depois</option>
            {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Sponsor">
          <Select value={form.sponsor_id} onChange={(e) => set('sponsor_id', e.target.value)}>
            <option value="">Definir depois</option>
            {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>

        <Field label="Equipe">
          <Select value={form.team_id} onChange={(e) => set('team_id', e.target.value)}>
            <option value="">Sem equipe</option>
            {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Empresa">
          <Select value={form.company_id} onChange={(e) => set('company_id', e.target.value)}>
            <option value="">Sem empresa</option>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Data de inicio" required error={errors.start_date}>
          <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="Data-alvo" error={errors.target_date}>
          <Input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
        </Field>

        <Field label="Orcamento (R$)" error={errors.budget} hint="Cria a revisao 0 do orcamento.">
          <Input type="number" min="0" step="1000" value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="0,00" />
        </Field>

        <Field label="Objetivo" className="sm:col-span-2">
          <Textarea value={form.objective} onChange={(e) => set('objective', e.target.value)} placeholder="O que o projeto entrega e por que ele existe." />
        </Field>

        {canManageFinancial && (
          <Field
            label="Gestao financeira"
            className="sm:col-span-2"
            hint={
              form.template_id
                ? `Herdado do template: ${financialModeLabel[templates.data?.find((t) => t.id === form.template_id)?.financial_module_default ?? 'inherit']}`
                : undefined
            }
          >
            <Select
              value={form.financial_module_mode}
              onChange={(e) => setForm((f) => ({
                ...f, financial_module_mode: e.target.value as FinancialModuleMode, financialModeTouched: true,
              }))}
            >
              {(Object.entries(financialModeLabel) as [FinancialModuleMode, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
