import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, ShieldCheck, KeyRound, Pencil, UserX, UserCheck } from 'lucide-react';
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
import { listCompanies, listProfiles, listTeams, listTemplates } from '@/services/projects';
import { refreshAllHealth } from '@/services/governance';
import { createUser, resetUserPassword, deleteUser, type CreateUserResult, type ResetPasswordResult } from '@/services/adminUsers';
import { roleDescription, roleLabel } from '@/utils/domain-labels';
import type { CustomFieldDefinition, CustomFieldScope, CustomFieldType, Profile, RoleKey } from '@/types/domain';

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
