import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Plus, Trash2, RefreshCw, ShieldCheck, KeyRound, Pencil, UserX, UserCheck, Wallet, CalendarDays,
  Building2, Link2, Users,
} from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { AvatarWithName } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useFinancialModule } from '@/hooks/useFinancialModule';
import { useTableState } from '@/hooks/useTableState';
import { supabase, describeError } from '@/lib/supabase/client';
import {
  deleteDefinition, listAllDefinitions, replaceOptions, upsertDefinition,
} from '@/services/customFields';
import {
  listActiveProfiles, listCompanies, listProfiles, listTeams, listTemplates, updateTemplateFinancialDefault,
} from '@/services/projects';
import {
  createArea, createBusinessUnit, listAreas, listBusinessUnits, setAreaActive, setBusinessUnitActive,
  updateArea, updateBusinessUnit, type AreaWithRelations,
} from '@/services/areas';
import { setFinancialModuleEnabled } from '@/services/systemSettings';
import { createHoliday, deleteHoliday, listHolidays } from '@/services/goalIndicators';
import { refreshAllHealth } from '@/services/governance';
import { createUser, resetUserPassword, deleteUser, type CreateUserResult, type ResetPasswordResult } from '@/services/adminUsers';
import { financialModeLabel, roleDescription, roleLabel } from '@/utils/domain-labels';
import { formatDate, formatDateTime } from '@/utils/format';
import type {
  BusinessUnit, CustomFieldDefinition, CustomFieldScope, CustomFieldType, FinancialModuleMode, Profile, RoleKey,
} from '@/types/domain';

const TABS = [
  { key: 'perfil', label: 'Meu perfil' },
  { key: 'usuarios', label: 'Usuarios & Permissoes' },
  { key: 'campos', label: 'Campos personalizados' },
  { key: 'templates', label: 'Templates' },
  { key: 'equipes', label: 'Equipes' },
  { key: 'gerencias', label: 'Gerencias' },
  { key: 'areas', label: 'Areas' },
  { key: 'modulos', label: 'Modulos' },
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
    if (t.key === 'campos' || t.key === 'templates' || t.key === 'equipes' || t.key === 'gerencias' || t.key === 'areas') {
      return can('portfolio.manage');
    }
    if (t.key === 'modulos') return can('financial_module.manage');
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
      {tab === 'gerencias' && <GerenciasTab />}
      {tab === 'areas' && <AreasTab />}
      {tab === 'modulos' && <ModulosTab />}
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
const blankNewUser = {
  full_name: '', email: '', role: 'viewer' as RoleKey, job_title: '', company_id: '', primary_team_id: '',
};

const blankEditForm = {
  full_name: '', job_title: '', company_id: '', primary_team_id: '', weekly_capacity_hours: 40,
};

function UsersTab() {
  const { can, profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['profiles', 'all'], queryFn: listProfiles });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(blankNewUser);
  // Credencial exibida uma unica vez (cadastro ou redefinicao) - nao fica armazenada.
  const [createdUser, setCreatedUser] = useState<CreateUserResult | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetResult, setResetResult] = useState<ResetPasswordResult | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState(blankEditForm);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; email: string } | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: inviteOpen || Boolean(editTarget) });
  const teams = useQuery({ queryKey: ['teams'], queryFn: listTeams, enabled: inviteOpen || Boolean(editTarget) });

  const changeEnvironmentAccess = useMutation({
    mutationFn: async ({ id, allowed }: { id: string; allowed: boolean }) => {
      const { error } = await supabase
        .from('profiles').update({ can_switch_environment: allowed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast.success('Acesso a ambientes atualizado', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel alterar o acesso', describeError(e)),
  });

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

  const invite = useMutation({
    mutationFn: async () => {
      if (!inviteForm.full_name.trim() || !inviteForm.email.trim()) {
        throw new Error('Informe nome e e-mail.');
      }
      return createUser({
        email: inviteForm.email.trim(),
        full_name: inviteForm.full_name.trim(),
        role: inviteForm.role,
        job_title: inviteForm.job_title || null,
        company_id: inviteForm.company_id || null,
        primary_team_id: inviteForm.primary_team_id || null,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setInviteOpen(false);
      setInviteForm(blankNewUser);
      setCreatedUser(result);
    },
    onError: (e) => toast.error('Nao foi possivel cadastrar o usuario', describeError(e)),
  });

  const resetPassword = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (result) => {
      setResetTarget(null);
      setResetResult(result);
    },
    onError: (e) => toast.error('Nao foi possivel redefinir a senha', describeError(e)),
  });

  const editUser = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const { error } = await supabase.from('profiles').update({
        full_name: editForm.full_name.trim(),
        job_title: editForm.job_title || null,
        company_id: editForm.company_id || null,
        primary_team_id: editForm.primary_team_id || null,
        weekly_capacity_hours: editForm.weekly_capacity_hours,
      }).eq('id', editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setEditTarget(null);
      toast.success('Cadastro atualizado', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { active }) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setDeactivateTarget(null);
      toast.success(active ? 'Usuario ativado' : 'Usuario inativado', 'A alteracao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel alterar a situacao', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setDeleteTarget(null);
      toast.success('Usuario excluido', 'A exclusao foi registrada na trilha de auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel excluir o usuario', describeError(e)),
  });

  function openEdit(p: Profile) {
    setEditForm({
      full_name: p.full_name,
      job_title: p.job_title ?? '',
      company_id: p.company_id ?? '',
      primary_team_id: p.primary_team_id ?? '',
      weekly_capacity_hours: p.weekly_capacity_hours,
    });
    setEditTarget(p);
  }

  if (isLoading) return <Spinner />;

  return (
    <>
      {can('users.manage') && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setInviteOpen(true)} icon={<Plus className="h-4 w-4" />}>Adicionar usuário</Button>
        </div>
      )}

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
              {['Usuario', 'Cargo', 'Papel de acesso', 'Alterna QA/PRD', 'Capacidade', 'Situacao', ''].map((h) => (
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
                <td className="px-3 py-2.5">
                  {can('users.manage') ? (
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        className="accent-[rgb(var(--c-brand))]"
                        checked={p.can_switch_environment}
                        onChange={(e) => changeEnvironmentAccess.mutate({ id: p.id, allowed: e.target.checked })}
                      />
                      {p.can_switch_environment ? 'Permitido' : 'Bloqueado'}
                    </label>
                  ) : (
                    <Badge tone={p.can_switch_environment ? 'strategic' : 'neutral'}>
                      {p.can_switch_environment ? 'Permitido' : 'Bloqueado'}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted">{p.weekly_capacity_hours} h/sem</td>
                <td className="px-3 py-2.5">
                  {p.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}
                </td>
                <td className="px-3 py-2.5">
                  {can('users.manage') && (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<KeyRound className="h-3.5 w-3.5" />}
                        onClick={() => setResetTarget({ id: p.id, name: p.full_name })}
                      >
                        Redefinir senha
                      </Button>
                      {/* Auto-inativacao e auto-exclusao ficam de fora da UI - travariam a
                          propria conta administrativa sem outra pessoa para reverter. */}
                      {p.id !== profile?.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={p.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                            onClick={() => setDeactivateTarget({ id: p.id, name: p.full_name, active: !p.active })}
                          >
                            {p.active ? 'Inativar' : 'Ativar'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setDeleteTarget({ id: p.id, name: p.full_name, email: p.email })}
                          >
                            Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Adicionar usuário"
        description="A conta e criada ja ativa, com uma senha temporaria exibida ao final para voce repassar a pessoa. O papel de acesso sai definido conforme escolhido aqui."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={() => invite.mutate()} loading={invite.isPending}>Cadastrar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input value={inviteForm.full_name} onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="E-mail" required className="sm:col-span-2">
            <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="nome@empresa.com.br" />
          </Field>
          <Field label="Papel de acesso" required>
            <Select value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as RoleKey }))}>
              {(Object.keys(roleLabel) as RoleKey[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </Select>
          </Field>
          <Field label="Cargo">
            <Input value={inviteForm.job_title} onChange={(e) => setInviteForm((f) => ({ ...f, job_title: e.target.value }))} />
          </Field>
          <Field label="Empresa">
            <Select value={inviteForm.company_id} onChange={(e) => setInviteForm((f) => ({ ...f, company_id: e.target.value }))}>
              <option value="">Nao informado</option>
              {(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Equipe">
            <Select value={inviteForm.primary_team_id} onChange={(e) => setInviteForm((f) => ({ ...f, primary_team_id: e.target.value }))}>
              <option value="">Sem equipe</option>
              {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(createdUser)}
        onClose={() => setCreatedUser(null)}
        title="Usuário cadastrado"
        description="Repasse a credencial abaixo. Ela nao fica armazenada e nao sera exibida novamente."
        size="sm"
        footer={<Button onClick={() => setCreatedUser(null)}>Concluir</Button>}
      >
        {createdUser && (
          <div className="space-y-3">
            <Field label="E-mail">
              <Input readOnly value={createdUser.email} onFocus={(e) => e.target.select()} />
            </Field>
            <Field label="Senha temporaria">
              <Input readOnly value={createdUser.temporary_password} className="font-mono" onFocus={(e) => e.target.select()} />
            </Field>
            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`E-mail: ${createdUser.email}\nSenha temporaria: ${createdUser.temporary_password}`)
                  .then(() => toast.success('Credencial copiada'))
                  .catch(() => toast.error('Nao foi possivel copiar', 'Selecione e copie manualmente.'));
              }}
            >
              Copiar e-mail e senha
            </Button>
            <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
              Oriente a pessoa a trocar a senha no primeiro acesso. Enquanto nao houver vinculo a
              projetos, ela entra mas nao enxerga nenhum projeto - o vinculo e feito na aba
              <b> Recursos</b> de cada projeto.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        onConfirm={() => resetTarget && resetPassword.mutate(resetTarget.id)}
        loading={resetPassword.isPending}
        title="Redefinir senha"
        confirmLabel="Redefinir"
        description={
          <>
            Uma nova senha temporaria sera gerada para <b>{resetTarget?.name}</b>, substituindo a
            atual imediatamente. Repasse a credencial a pessoa por um canal seguro.
          </>
        }
      />

      <Modal
        open={Boolean(resetResult)}
        onClose={() => setResetResult(null)}
        title="Senha redefinida"
        description="Repasse a credencial abaixo. Ela nao fica armazenada e nao sera exibida novamente."
        size="sm"
        footer={<Button onClick={() => setResetResult(null)}>Concluir</Button>}
      >
        {resetResult && (
          <div className="space-y-3">
            <Field label="E-mail">
              <Input readOnly value={resetResult.email} onFocus={(e) => e.target.select()} />
            </Field>
            <Field label="Senha temporaria">
              <Input readOnly value={resetResult.temporary_password} className="font-mono" onFocus={(e) => e.target.select()} />
            </Field>
            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`E-mail: ${resetResult.email}\nSenha temporaria: ${resetResult.temporary_password}`)
                  .then(() => toast.success('Credencial copiada'))
                  .catch(() => toast.error('Nao foi possivel copiar', 'Selecione e copie manualmente.'));
              }}
            >
              Copiar e-mail e senha
            </Button>
            <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
              Oriente a pessoa a trocar a senha assim que entrar.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Editar usuário"
        description="Papel de acesso e permissao de troca de ambiente sao alterados direto na tabela."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={() => editUser.mutate()} loading={editUser.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input readOnly value={editTarget?.email ?? ''} className="text-muted" />
          </Field>
          <Field label="Cargo">
            <Input value={editForm.job_title} onChange={(e) => setEditForm((f) => ({ ...f, job_title: e.target.value }))} />
          </Field>
          <Field label="Capacidade semanal (h)">
            <Input
              type="number"
              min={0}
              max={200}
              value={editForm.weekly_capacity_hours}
              onChange={(e) => setEditForm((f) => ({ ...f, weekly_capacity_hours: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Empresa">
            <Select value={editForm.company_id} onChange={(e) => setEditForm((f) => ({ ...f, company_id: e.target.value }))}>
              <option value="">Nao informado</option>
              {(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Equipe">
            <Select value={editForm.primary_team_id} onChange={(e) => setEditForm((f) => ({ ...f, primary_team_id: e.target.value }))}>
              <option value="">Sem equipe</option>
              {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && toggleActive.mutate({ id: deactivateTarget.id, active: deactivateTarget.active })}
        loading={toggleActive.isPending}
        danger={Boolean(deactivateTarget && !deactivateTarget.active)}
        title={deactivateTarget?.active ? 'Ativar usuário' : 'Inativar usuário'}
        confirmLabel={deactivateTarget?.active ? 'Ativar' : 'Inativar'}
        description={
          deactivateTarget?.active
            ? <>Voce esta reativando <b>{deactivateTarget?.name}</b>. A pessoa volta a conseguir entrar na plataforma.</>
            : <>Voce esta inativando <b>{deactivateTarget?.name}</b>. A pessoa continua com a conta e os dados intactos, mas nao consegue mais entrar ate ser reativada.</>
        }
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        loading={remove.isPending}
        title="Excluir usuário"
        confirmLabel="Excluir"
        confirmText={deleteTarget?.email}
        description={
          <>
            A conta de <b>{deleteTarget?.name}</b> sera excluida permanentemente - esta acao nao pode
            ser desfeita. Projetos, tarefas, riscos e decisoes onde a pessoa era responsavel
            permanecem, apenas sem responsavel atribuido. Vinculos de equipe, aprovacoes,
            visualizacoes salvas e preferencias pessoais sao removidos junto - aprovacoes ficam
            registradas na trilha de auditoria mesmo assim.
            <br /><br />
            Para confirmar, digite o e-mail <b>{deleteTarget?.email}</b> abaixo.
          </>
        }
      />
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
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const canManageFinancial = can('financial_module.manage');

  const setDefault = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: FinancialModuleMode }) =>
      updateTemplateFinancialDefault(id, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Padrao financeiro do template atualizado');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

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
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs font-semibold text-muted">Gestao financeira (padrao ao criar projeto)</p>
            {canManageFinancial ? (
              <Select
                className="h-8 py-0 text-xs"
                value={t.financial_module_default}
                onChange={(e) => setDefault.mutate({ id: t.id, mode: e.target.value as FinancialModuleMode })}
              >
                {(Object.entries(financialModeLabel) as [FinancialModuleMode, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            ) : (
              <Badge tone="neutral">{financialModeLabel[t.financial_module_default]}</Badge>
            )}
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

// ---------------------------------------------------------------------------
const blankBusinessUnit = { company_id: '', code: '', name: '' };

function GerenciasTab() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = can('portfolio.manage');
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BusinessUnit | null>(null);
  const [form, setForm] = useState(blankBusinessUnit);
  const [toggleTarget, setToggleTarget] = useState<BusinessUnit | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['business-units'], queryFn: listBusinessUnits });
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: open || Boolean(editTarget) });
  const companyName = useMemo(
    () => new Map((companies.data ?? []).map((c) => [c.id, c.name])),
    [companies.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_id) throw new Error('Selecione a empresa.');
      if (!form.code.trim() || !form.name.trim()) throw new Error('Informe codigo e nome.');
      if (editTarget) {
        await updateBusinessUnit(editTarget.id, {
          company_id: form.company_id, code: form.code.trim().toUpperCase(), name: form.name.trim(),
        });
      } else {
        await createBusinessUnit({
          company_id: form.company_id, code: form.code.trim().toUpperCase(), name: form.name.trim(),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      toast.success(editTarget ? 'Gerencia atualizada' : 'Gerencia criada', 'A alteracao foi registrada na trilha de auditoria.');
      setOpen(false);
      setEditTarget(null);
      setForm(blankBusinessUnit);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: () => setBusinessUnitActive(toggleTarget!.id, !toggleTarget!.active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      toast.success(toggleTarget?.active ? 'Gerencia inativada' : 'Gerencia ativada', 'A alteracao foi registrada na trilha de auditoria.');
      setToggleTarget(null);
    },
    onError: (e) => toast.error('Nao foi possivel alterar a situacao', describeError(e)),
  });

  function openCreate() { setForm(blankBusinessUnit); setEditTarget(null); setOpen(true); }
  function openEdit(bu: BusinessUnit) {
    setForm({ company_id: bu.company_id, code: bu.code, name: bu.name });
    setEditTarget(bu);
    setOpen(true);
  }

  if (isLoading) return <Spinner />;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Gerencia e' o nivel organizacional acima de Area - cada Area pertence a uma Gerencia.
        </p>
        {canManage && (
          <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>Nova Gerencia</Button>
        )}
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="Nenhuma gerencia cadastrada"
          description={canManage ? 'Cadastre a primeira gerencia para poder criar Areas.' : undefined}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                {['Gerencia', 'Codigo', 'Empresa', 'Situacao', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((bu) => (
                <tr key={bu.id} className="border-t border-border">
                  <td className="px-3 py-2.5 font-medium">{bu.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted">{bu.code}</td>
                  <td className="px-3 py-2.5 text-muted">{companyName.get(bu.company_id) ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {bu.active ? <Badge tone="ok">Ativa</Badge> : <Badge tone="neutral">Inativa</Badge>}
                  </td>
                  <td className="px-3 py-2.5">
                    {canManage && (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(bu)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={bu.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          onClick={() => setToggleTarget(bu)}
                        >
                          {bu.active ? 'Inativar' : 'Ativar'}
                        </Button>
                      </div>
                    )}
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
        title={editTarget ? 'Editar gerencia' : 'Nova gerencia'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa" required className="sm:col-span-2">
            <Select aria-label="Empresa" value={form.company_id} onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Codigo" required hint="Identificador curto, ex.: CTB">
            <Input aria-label="Codigo" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="Nome" required>
            <Input aria-label="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleActive.mutate()}
        loading={toggleActive.isPending}
        danger={Boolean(toggleTarget?.active)}
        title={toggleTarget?.active ? 'Inativar gerencia' : 'Ativar gerencia'}
        confirmLabel={toggleTarget?.active ? 'Inativar' : 'Ativar'}
        description={
          toggleTarget?.active
            ? <>As Areas ja vinculadas a <b>{toggleTarget?.name}</b> continuam existindo, mas ela deixa de aparecer como opcao para novas Areas.</>
            : <><b>{toggleTarget?.name}</b> volta a aparecer como opcao para novas Areas.</>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
const blankArea = { business_unit_id: '', code: '', name: '', description: '', manager_user_id: '' };

function AreasTab() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = can('portfolio.manage');
  const table = useTableState('settings-areas');

  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AreaWithRelations | null>(null);
  const [form, setForm] = useState(blankArea);
  const [toggleTarget, setToggleTarget] = useState<AreaWithRelations | null>(null);
  const [linksTarget, setLinksTarget] = useState<AreaWithRelations | null>(null);
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const areasQuery = useQuery({ queryKey: ['areas'], queryFn: listAreas });
  const businessUnits = useQuery({ queryKey: ['business-units'], queryFn: listBusinessUnits });
  const profiles = useQuery({ queryKey: ['profiles', 'all'], queryFn: listProfiles });
  const activeProfiles = useQuery({
    queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open || Boolean(editTarget),
  });
  const teams = useQuery({ queryKey: ['teams'], queryFn: listTeams });

  const rows = useMemo(() => (areasQuery.data ?? []).filter((a) => {
    if (businessUnitFilter && a.business_unit_id !== businessUnitFilter) return false;
    if (statusFilter === 'ativa' && !a.is_active) return false;
    if (statusFilter === 'inativa' && a.is_active) return false;
    return true;
  }), [areasQuery.data, businessUnitFilter, statusFilter]);

  const collaboratorCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of profiles.data ?? []) {
      if (!p.area_id || !p.active) continue;
      map.set(p.area_id, (map.get(p.area_id) ?? 0) + 1);
    }
    return map;
  }, [profiles.data]);

  const teamCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of teams.data ?? []) {
      if (!t.area_id) continue;
      map.set(t.area_id, (map.get(t.area_id) ?? 0) + 1);
    }
    return map;
  }, [teams.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.business_unit_id) throw new Error('Selecione a gerencia.');
      if (!form.code.trim() || !form.name.trim()) throw new Error('Informe codigo e nome.');
      const input = {
        business_unit_id: form.business_unit_id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        manager_user_id: form.manager_user_id || null,
      };
      if (editTarget) await updateArea(editTarget.id, input);
      else await createArea(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      toast.success(editTarget ? 'Area atualizada' : 'Area criada', 'A alteracao foi registrada na trilha de auditoria.');
      setOpen(false);
      setEditTarget(null);
      setForm(blankArea);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: () => setAreaActive(toggleTarget!.id, !toggleTarget!.is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      toast.success(toggleTarget?.is_active ? 'Area inativada' : 'Area ativada', 'A alteracao foi registrada na trilha de auditoria.');
      setToggleTarget(null);
    },
    onError: (e) => toast.error('Nao foi possivel alterar a situacao', describeError(e)),
  });

  function openCreate() { setForm(blankArea); setEditTarget(null); setOpen(true); }
  function openEdit(a: AreaWithRelations) {
    setForm({
      business_unit_id: a.business_unit_id, code: a.code, name: a.name,
      description: a.description ?? '', manager_user_id: a.manager_user_id ?? '',
    });
    setEditTarget(a);
    setOpen(true);
  }

  const columns = useMemo<ColumnDef<AreaWithRelations, unknown>[]>(() => [
    {
      accessorKey: 'name', header: 'Area', meta: { label: 'Area' }, size: 220,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="font-mono text-xs text-muted">{row.original.code}</p>
        </div>
      ),
    },
    {
      id: 'business_unit', header: 'Gerencia', meta: { label: 'Gerencia' }, size: 180,
      accessorFn: (row) => row.business_unit?.name ?? '',
      cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) || '—'}</span>,
    },
    {
      id: 'manager', header: 'Gestor', meta: { label: 'Gestor' }, size: 180,
      accessorFn: (row) => row.manager?.full_name ?? '',
      cell: ({ getValue }) => <span className="text-sm text-muted">{(getValue() as string) || '—'}</span>,
    },
    {
      id: 'collaborators', header: 'Colaboradores', meta: { label: 'Colaboradores', exportType: 'integer' }, size: 130,
      accessorFn: (row) => collaboratorCount.get(row.id) ?? 0,
      cell: ({ getValue }) => <span className="tabular-nums text-sm">{getValue() as number}</span>,
    },
    {
      id: 'status', header: 'Situacao', meta: { label: 'Situacao' }, size: 110,
      accessorFn: (row) => (row.is_active ? 'Ativa' : 'Inativa'),
      cell: ({ row }) => (row.original.is_active ? <Badge tone="ok">Ativa</Badge> : <Badge tone="neutral">Inativa</Badge>),
    },
    {
      id: 'actions', header: '', meta: { label: 'Acoes', exportable: false }, size: 220, enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            variant="ghost" size="sm" icon={<Link2 className="h-3.5 w-3.5" />}
            onClick={() => setLinksTarget(row.original)}
          >
            Vinculos
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(row.original)}>
                Editar
              </Button>
              <Button
                variant="ghost" size="sm"
                icon={row.original.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                onClick={() => setToggleTarget(row.original)}
              >
                {row.original.is_active ? 'Inativar' : 'Ativar'}
              </Button>
            </>
          )}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [collaboratorCount, canManage]);

  if (areasQuery.isError) {
    return <ErrorState message={(areasQuery.error as Error).message} onRetry={() => areasQuery.refetch()} />;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Area e' o nivel organizacional entre Gerencia e Equipe/Colaborador. Cada colaborador ativo
          deve ter uma Area principal vinculada no cadastro de Usuarios.
        </p>
        {canManage && (
          <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />} disabled={(businessUnits.data ?? []).length === 0}>
            Nova Area
          </Button>
        )}
      </div>

      {!areasQuery.isLoading && (businessUnits.data ?? []).length === 0 && (
        <div className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          Nenhuma Gerencia cadastrada ainda - crie uma na aba <b>Gerencias</b> antes de cadastrar Areas.
        </div>
      )}

      <DataTable<AreaWithRelations>
        data={rows}
        columns={columns}
        loading={areasQuery.isLoading}
        state={table.state}
        onStateChange={table.onStateChange}
        getRowId={(row) => row.id}
        exportFileName="areas"
        emptyTitle="Nenhuma area cadastrada"
        emptyDescription={canManage ? 'Cadastre a primeira area para vincular colaboradores.' : undefined}
        toolbarExtra={
          <>
            <Select
              className="w-auto" value={businessUnitFilter}
              onChange={(e) => setBusinessUnitFilter(e.target.value)} aria-label="Filtrar por gerencia"
            >
              <option value="">Todas as gerencias</option>
              {(businessUnits.data ?? []).map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </Select>
            <Select
              className="w-auto" value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por situacao"
            >
              <option value="">Ativas e inativas</option>
              <option value="ativa">Somente ativas</option>
              <option value="inativa">Somente inativas</option>
            </Select>
          </>
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editTarget ? 'Editar area' : 'Nova area'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gerencia" required className="sm:col-span-2">
            <Select aria-label="Gerencia" value={form.business_unit_id} onChange={(e) => setForm((f) => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {(businessUnits.data ?? []).filter((bu) => bu.active || bu.id === form.business_unit_id).map((bu) => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Codigo" required hint="Unico dentro da gerencia, ex.: CTG">
            <Input aria-label="Codigo" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="Nome" required>
            <Input aria-label="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Gestor da area">
            <Select aria-label="Gestor da area" value={form.manager_user_id} onChange={(e) => setForm((f) => ({ ...f, manager_user_id: e.target.value }))}>
              <option value="">Nao informado</option>
              {(activeProfiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea aria-label="Descricao da area" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          {editTarget && (
            <p className="text-xs text-muted sm:col-span-2">
              Criada em {formatDateTime(editTarget.created_at)} · ultima alteracao em {formatDateTime(editTarget.updated_at)}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleActive.mutate()}
        loading={toggleActive.isPending}
        danger={Boolean(toggleTarget?.is_active)}
        title={toggleTarget?.is_active ? 'Inativar area' : 'Ativar area'}
        confirmLabel={toggleTarget?.is_active ? 'Inativar' : 'Ativar'}
        description={
          toggleTarget?.is_active
            ? <>Colaboradores e equipes ja vinculados a <b>{toggleTarget?.name}</b> continuam vinculados, mas ela deixa de aparecer como opcao para novos vinculos.</>
            : <><b>{toggleTarget?.name}</b> volta a aparecer como opcao para novos vinculos.</>
        }
      />

      <Modal
        open={Boolean(linksTarget)}
        onClose={() => setLinksTarget(null)}
        title={`Vinculos de ${linksTarget?.name ?? ''}`}
        size="sm"
        footer={<Button onClick={() => setLinksTarget(null)}>Fechar</Button>}
      >
        {linksTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                <Building2 className="h-3.5 w-3.5" /> Gerencia
              </p>
              <p className="mt-1 text-sm">{linksTarget.business_unit?.name ?? '—'}</p>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
                <Users className="h-3.5 w-3.5" /> Colaboradores ativos ({collaboratorCount.get(linksTarget.id) ?? 0})
              </p>
              {(profiles.data ?? []).filter((p) => p.area_id === linksTarget.id && p.active).length === 0 ? (
                <p className="text-xs text-muted">Nenhum colaborador ativo vinculado.</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
                  {(profiles.data ?? []).filter((p) => p.area_id === linksTarget.id && p.active).map((p) => (
                    <li key={p.id} className="py-1.5">{p.full_name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">Equipes ({teamCount.get(linksTarget.id) ?? 0})</p>
              {(teams.data ?? []).filter((t) => t.area_id === linksTarget.id).length === 0 ? (
                <p className="text-xs text-muted">Nenhuma equipe vinculada.</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
                  {(teams.data ?? []).filter((t) => t.area_id === linksTarget.id).map((t) => (
                    <li key={t.id} className="py-1.5">{t.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function ModulosTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { globalEnabled, canManage, isLoading } = useFinancialModule();
  const [confirmingOff, setConfirmingOff] = useState(false);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setFinancialModuleEnabled(enabled),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setConfirmingOff(false);
      toast.success(
        enabled ? 'Gestao financeira ativada' : 'Gestao financeira desativada',
        'A alteracao foi registrada na trilha de auditoria.',
      );
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4" /> Gestao Financeira
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Controla a exibicao e utilizacao dos recursos financeiros da plataforma (orcamento,
          realizado, comprometido, forecast e relatorios financeiros). Projetos individuais podem
          sobrescrever esta configuracao em Editar projeto, conforme permissao.
        </p>
        <div className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
          <div>
            <p className="text-sm font-medium">{globalEnabled ? 'Ativada' : 'Desativada'}</p>
            <p className="text-xs text-muted">Padrao aplicado a projetos com modulo em &quot;Herdar&quot;.</p>
          </div>
          {canManage ? (
            <Button
              variant={globalEnabled ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => (globalEnabled ? setConfirmingOff(true) : toggle.mutate(true))}
              loading={toggle.isPending}
            >
              {globalEnabled ? 'Desativar' : 'Ativar'}
            </Button>
          ) : (
            <Badge tone={globalEnabled ? 'ok' : 'neutral'}>{globalEnabled ? 'Ativada' : 'Desativada'}</Badge>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmingOff}
        onClose={() => setConfirmingOff(false)}
        onConfirm={() => toggle.mutate(false)}
        loading={toggle.isPending}
        title="Desativar Gestao Financeira"
        confirmLabel="Desativar"
        description={
          <>
            Projetos com o modulo financeiro em &quot;Herdar configuracao padrao&quot; deixarao de exibir
            orcamento, realizado, forecast e relatorios financeiros, e nao entrarao mais nas
            consolidacoes do dashboard e do portfolio. Nenhum dado financeiro e apagado - projetos
            com override manual (&quot;Ativar&quot; no proprio projeto) continuam exibindo o modulo normalmente.
          </>
        }
      />
    </div>
  );
}

function SystemTab() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManageHolidays = can('portfolio.manage');
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const refresh = useMutation({
    mutationFn: refreshAllHealth,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Saude recalculada', `${count} projeto(s) reavaliado(s) pelas regras automaticas.`);
    },
    onError: (e) => toast.error('Nao foi possivel recalcular', describeError(e)),
  });

  const holidays = useQuery({ queryKey: ['holidays'], queryFn: listHolidays });

  const addHoliday = useMutation({
    mutationFn: () => {
      if (!newHoliday.date || !newHoliday.name.trim()) throw new Error('Informe data e nome do feriado.');
      return createHoliday({ date: newHoliday.date, name: newHoliday.name.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setNewHoliday({ date: '', name: '' });
      toast.success('Feriado cadastrado');
    },
    onError: (e) => toast.error('Nao foi possivel cadastrar', describeError(e)),
  });

  const removeHoliday = useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Feriado removido');
    },
    onError: (e) => toast.error('Nao foi possivel remover', describeError(e)),
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
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4" /> Feriados corporativos</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Usado pelo Indicador de Metas quando a base de calculo e &quot;Dias uteis&quot; - finais de semana
          ja sao considerados automaticamente, so os feriados precisam ser cadastrados aqui.
        </p>
        {canManageHolidays && (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Data" className="w-auto">
              <Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((f) => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Nome" className="min-w-[160px] flex-1">
              <Input value={newHoliday.name} onChange={(e) => setNewHoliday((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Natal" />
            </Field>
            <Button size="sm" onClick={() => addHoliday.mutate()} loading={addHoliday.isPending} icon={<Plus className="h-3.5 w-3.5" />}>
              Adicionar
            </Button>
          </div>
        )}
        {(holidays.data ?? []).length === 0 ? (
          <p className="text-xs text-muted">Nenhum feriado cadastrado.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto text-sm">
            {(holidays.data ?? []).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{formatDate(h.date)} · {h.name}</span>
                {canManageHolidays && (
                  <button onClick={() => removeHoliday.mutate(h.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 lg:col-span-2">
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
