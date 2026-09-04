import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { AvatarWithName } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { supabase, describeError } from '@/lib/supabase/client';
import {
  deleteDefinition, listAllDefinitions, replaceOptions, upsertDefinition,
} from '@/services/customFields';
import { listProfiles, listTeams, listTemplates } from '@/services/projects';
import { refreshAllHealth } from '@/services/governance';
import { roleDescription, roleLabel } from '@/utils/domain-labels';
import type { CustomFieldDefinition, CustomFieldScope, CustomFieldType, RoleKey } from '@/types/domain';

const TABS = [
  { key: 'perfil', label: 'Meu perfil' },
  { key: 'usuarios', label: 'Usuarios & Permissoes' },
  { key: 'campos', label: 'Campos personalizados' },
  { key: 'templates', label: 'Templates' },
  { key: 'equipes', label: 'Equipes' },
  { key: 'sistema', label: 'Sistema' },
];

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const sub = location.pathname.split('/')[2] ?? 'perfil';
  const tab = TABS.some((t) => t.key === sub) ? sub : 'perfil';

  useBreadcrumbs([
    { label: 'Governanca' },
    { label: 'Configuracoes', to: '/configuracoes' },
    { label: TABS.find((t) => t.key === tab)?.label ?? '' },
  ]);

  const visible = TABS.filter((t) => {
    if (t.key === 'usuarios' || t.key === 'sistema') return can('users.manage') || can('settings.manage');
    if (t.key === 'campos' || t.key === 'templates' || t.key === 'equipes') return can('portfolio.manage');
    return true;
  });

  return (
    <>
      <PageHeader
        title="Configuracoes"
        description="Perfis de acesso, campos personalizados, templates e parametros da plataforma."
      />
      <Tabs className="mb-4" value={tab} onChange={(k) => navigate(`/configuracoes/${k}`)} items={visible} />

      {tab === 'perfil' && <ProfileTab />}
      {tab === 'usuarios' && <UsersTab />}
      {tab === 'campos' && <CustomFieldsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'equipes' && <TeamsTab />}
      {tab === 'sistema' && <SystemTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
function ProfileTab() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    job_title: profile?.job_title ?? '',
    weekly_capacity_hours: String(profile?.weekly_capacity_hours ?? 40),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          job_title: form.job_title || null,
          weekly_capacity_hours: Number(form.weekly_capacity_hours) || 40,
        })
        .eq('id', profile!.id);
      if (error) throw error;
      await refreshProfile();
    },
    onSuccess: () => toast.success('Perfil atualizado'),
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  if (!profile) return <Spinner />;

  return (
    <div className="card max-w-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <AvatarWithName name={profile.full_name} subtitle={profile.email} />
        <Badge tone="brand">{roleLabel[profile.role]}</Badge>
      </div>
      <p className="mb-4 rounded-lg bg-surface-2 p-3 text-xs text-muted">
        {roleDescription[profile.role]} O papel de acesso so pode ser alterado por um Administrador -
        a regra e aplicada no banco, nao apenas na interface.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" required className="sm:col-span-2">
          <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </Field>
        <Field label="Cargo">
          <Input value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} />
        </Field>
        <Field label="Capacidade semanal (horas)" hint="Base do calculo de capacidade e sobrecarga.">
          <Input type="number" min="0" max="80" value={form.weekly_capacity_hours}
            onChange={(e) => setForm((f) => ({ ...f, weekly_capacity_hours: e.target.value }))} />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function UsersTab() {
  const { can, profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['profiles', 'all'], queryFn: listProfiles });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: RoleKey }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast.success('Papel atualizado', 'A alteracao de permissao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel alterar o papel', describeError(e)),
  });

  if (isLoading) return <Spinner />;

  return (
    <>
      <div className="card mb-4 p-4 text-sm">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-ok" /> Modelo de permissoes</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(roleLabel) as RoleKey[]).map((r) => (
            <div key={r} className="rounded-lg bg-surface-2 p-2.5">
              <dt className="text-xs font-semibold">{roleLabel[r]}</dt>
              <dd className="mt-0.5 text-xs text-muted">{roleDescription[r]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2">
            <tr>
              {['Usuario', 'Cargo', 'Papel de acesso', 'Capacidade', 'Situacao'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2.5"><AvatarWithName name={p.full_name} subtitle={p.email} /></td>
                <td className="px-3 py-2.5 text-muted">{p.job_title ?? '—'}</td>
                <td className="px-3 py-2.5">
                  {can('users.manage') && p.id !== profile?.id ? (
                    <Select
                      className="h-8 w-auto py-0 text-xs"
                      value={p.role}
                      onChange={(e) => changeRole.mutate({ id: p.id, role: e.target.value as RoleKey })}
                    >
                      {(Object.keys(roleLabel) as RoleKey[]).map((r) => (
                        <option key={r} value={r}>{roleLabel[r]}</option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone="brand">{roleLabel[p.role]}</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted">{p.weekly_capacity_hours} h/sem</td>
                <td className="px-3 py-2.5">
                  {p.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
const fieldTypes: { value: CustomFieldType; label: string }[] = [
  { value: 'texto', label: 'Texto' },
  { value: 'texto_longo', label: 'Texto longo' },
  { value: 'numero', label: 'Numero' },
  { value: 'moeda', label: 'Moeda' },
  { value: 'percentual', label: 'Percentual' },
  { value: 'data', label: 'Data' },
  { value: 'data_hora', label: 'Data e hora' },
  { value: 'boolean', label: 'Sim/Nao' },
  { value: 'lista_unica', label: 'Lista (escolha unica)' },
  { value: 'multipla_escolha', label: 'Multipla escolha' },
  { value: 'usuario', label: 'Usuario' },
  { value: 'equipe', label: 'Equipe' },
  { value: 'status', label: 'Status' },
  { value: 'url', label: 'URL' },
];

function CustomFieldsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<CustomFieldDefinition | null>(null);
  const [form, setForm] = useState({
    scope: 'global' as CustomFieldScope, template_id: '', entity: 'project',
    key: '', label: '', description: '', field_type: 'texto' as CustomFieldType,
    required: false, position: '10', options: '',
  });

  const definitions = useQuery({ queryKey: ['custom-fields', 'all'], queryFn: listAllDefinitions });
  const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates, enabled: open });

  const save = useMutation({
    mutationFn: async () => {
      if (!/^[a-z][a-z0-9_]{1,48}$/.test(form.key)) {
        throw new Error('A chave deve comecar com letra minuscula e conter apenas letras, numeros e underscore.');
      }
      if (!form.label.trim()) throw new Error('Informe o rotulo do campo.');
      if (form.scope === 'template' && !form.template_id) throw new Error('Selecione o template.');

      const id = await upsertDefinition({
        scope: form.scope,
        template_id: form.scope === 'template' ? form.template_id : null,
        project_id: null,
        entity: form.entity,
        key: form.key,
        label: form.label.trim(),
        description: form.description || null,
        field_type: form.field_type,
        required: form.required,
        position: Number(form.position) || 0,
      });

      if (['lista_unica', 'multipla_escolha', 'status'].includes(form.field_type)) {
        const options = form.options.split('\n').map((l) => l.trim()).filter(Boolean)
          .map((line) => {
            const [value, label] = line.split('|').map((s) => s.trim());
            return { value: value.toLowerCase().replace(/\s+/g, '_'), label: label || value };
          });
        await replaceOptions(id, options);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo personalizado criado');
      setOpen(false);
      setForm((f) => ({ ...f, key: '', label: '', description: '', options: '' }));
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteDefinition(removing!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo removido');
      setRemoving(null);
    },
    onError: (e) => toast.error('Nao foi possivel remover', describeError(e)),
  });

  if (definitions.isLoading) return <Spinner />;

  const needsOptions = ['lista_unica', 'multipla_escolha', 'status'].includes(form.field_type);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Campos globais valem para toda a plataforma; campos de template so aparecem nos projetos
          criados com ele; campos de projeto sao criados na aba do proprio projeto.
        </p>
        <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Novo campo</Button>
      </div>

      {(definitions.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum campo personalizado cadastrado" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                {['Escopo', 'Entidade', 'Chave', 'Rotulo', 'Tipo', 'Obrigatorio', 'Opcoes', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(definitions.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2.5">
                    <Badge tone={d.scope === 'global' ? 'brand' : d.scope === 'template' ? 'info' : 'neutral'}>
                      {d.scope}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{d.entity}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{d.key}</td>
                  <td className="px-3 py-2.5 font-medium">{d.label}</td>
                  <td className="px-3 py-2.5 text-muted">{d.field_type}</td>
                  <td className="px-3 py-2.5">{d.required ? <Badge tone="warn">Sim</Badge> : '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {(d.options ?? []).map((o) => o.label).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setRemoving(d)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo campo personalizado"
        description="Os valores sao gravados em colunas tipadas no PostgreSQL, permitindo filtro e ordenacao com indice."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Criar campo</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Escopo" required>
            <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as CustomFieldScope }))}>
              <option value="global">Global</option>
              <option value="template">Template</option>
            </Select>
          </Field>
          {form.scope === 'template' && (
            <Field label="Template" required>
              <Select value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Entidade">
            <Select value={form.entity} onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))}>
              <option value="project">Projeto</option>
              <option value="task">Tarefa</option>
              <option value="risk">Risco</option>
              <option value="action_plan">Plano de acao</option>
            </Select>
          </Field>
          <Field label="Chave tecnica" required hint="minuscula, sem espaco. Ex.: norma_referencia">
            <Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase() }))} />
          </Field>
          <Field label="Rotulo" required>
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </Field>
          <Field label="Tipo" required>
            <Select value={form.field_type} onChange={(e) => setForm((f) => ({ ...f, field_type: e.target.value as CustomFieldType }))}>
              {fieldTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Ordem de exibicao">
            <Input type="number" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[rgb(var(--c-brand))]"
                checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} />
              Preenchimento obrigatorio
            </label>
          </div>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          {needsOptions && (
            <Field
              label="Opcoes" className="sm:col-span-2"
              hint="Uma por linha. Use valor|Rotulo para diferenciar (ex.: alto|Alto impacto)."
            >
              <Textarea value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                placeholder={'alto|Alto\nmedio|Medio\nbaixo|Baixo'} />
            </Field>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Remover campo personalizado"
        confirmLabel="Remover"
        confirmText={removing?.key}
        description={<>Todos os valores preenchidos para o campo <b>{removing?.label}</b> serao excluidos. Esta acao nao pode ser desfeita.</>}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
function TemplatesTab() {
  const { data = [], isLoading } = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  if (isLoading) return <Spinner />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((t) => (
        <article key={t.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-mono text-xs text-muted">{t.code}</span>
              <h3 className="text-sm font-semibold">{t.name}</h3>
            </div>
            <Badge tone="neutral">{t.category}</Badge>
          </div>
          {t.description && <p className="mt-2 text-xs text-muted">{t.description}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="info">Progresso {t.default_progress_method}</Badge>
            {t.evm_enabled && <Badge tone="strategic">EVM habilitado</Badge>}
          </div>
        </article>
      ))}
      {data.length === 0 && <EmptyState title="Nenhum template cadastrado" />}
    </div>
  );
}

function TeamsTab() {
  const { data = [], isLoading } = useQuery({ queryKey: ['teams'], queryFn: listTeams });
  if (isLoading) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-surface-2">
          <tr>
            {['Equipe', 'Area', 'Capacidade semanal', 'Limite de alocacao'].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-3 py-2.5 font-medium">{t.name}</td>
              <td className="px-3 py-2.5 text-muted">{t.area ?? '—'}</td>
              <td className="px-3 py-2.5 tabular-nums">{t.weekly_capacity_hours} h</td>
              <td className="px-3 py-2.5 tabular-nums">{t.max_allocation_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemTab() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const refresh = useMutation({
    mutationFn: refreshAllHealth,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Saude recalculada', `${count} projeto(s) reavaliado(s) pelas regras automaticas.`);
    },
    onError: (e) => toast.error('Nao foi possivel recalcular', describeError(e)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Health score automatico</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          A saude e recalculada a partir do desvio de avanco, do desvio financeiro, de marcos criticos
          vencidos e de riscos criticos sem mitigacao. Projetos com override manual sao preservados.
        </p>
        <Button variant="secondary" onClick={() => refresh.mutate()} loading={refresh.isPending} icon={<RefreshCw className="h-4 w-4" />}>
          Recalcular saude do portfolio
        </Button>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Seguranca</h2>
        <ul className="space-y-2 text-xs leading-relaxed text-muted">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            RLS ativa em todas as tabelas expostas, com politicas separadas por operacao.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            Nenhuma chave de servico no frontend - apenas a chave publica (anon).</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            Trilha de auditoria append-only, imutavel inclusive para Administradores.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            Storage privado por projeto, com acesso via URL assinada.</li>
        </ul>
      </section>
    </div>
  );
}
