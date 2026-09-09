import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronDown, ChevronRight, Pencil, Plus, UserMinus, Users } from 'lucide-react';
import { AvatarWithName } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import {
  createProjectMember, listProjectMemberCandidates, updateProjectMember,
  type ProjectMemberRow,
} from '@/services/projects';
import {
  cancelAllocation, checkAllocationCapacity, listAllocations, listTaskPlannedAllocation, upsertAllocation,
  type AllocationRow, type CapacityCheck,
} from '@/services/governance';
import type { TaskPlannedAllocationRow } from '@/types/domain';
import { formatDate } from '@/utils/format';

interface Props {
  projectId: string;
  members: ProjectMemberRow[];
  loading: boolean;
  canManage: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const blankMember = {
  profile_id: '', role: 'Membro', custom_role: '', start_date: today(), end_date: '', status: 'ativo' as 'ativo' | 'inativo', notes: '',
};
const blankAllocation = {
  profile_id: '', period_start: today(), period_end: today(), mode: 'hours' as 'hours' | 'percent',
  amount: '', description: '', overload_justification: '',
};

function daysInclusive(start: string, end: string) {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export function ProjectResourcesTab({ projectId, members, loading, canManage }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const allocations = useQuery({ queryKey: ['allocations', projectId], queryFn: () => listAllocations(projectId) });
  const planned = useQuery({ queryKey: ['task-planned-allocation', projectId], queryFn: () => listTaskPlannedAllocation(projectId) });
  const candidates = useQuery({ queryKey: ['project-member-candidates'], queryFn: listProjectMemberCandidates, enabled: canManage });
  const [areaFilter, setAreaFilter] = useState('');
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [memberForm, setMemberForm] = useState(blankMember);
  const [editingMember, setEditingMember] = useState<ProjectMemberRow | null>(null);
  const [inactivateMember, setInactivateMember] = useState<ProjectMemberRow | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState(blankAllocation);
  const [editingAllocation, setEditingAllocation] = useState<AllocationRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AllocationRow | null>(null);
  const [capacity, setCapacity] = useState<CapacityCheck | null>(null);

  const activeMembers = useMemo(() => members.filter((m) => m.status === 'ativo' && m.profile?.active), [members]);
  const activeAllocations = useMemo(() => (allocations.data ?? []).filter((a) => a.status === 'ativa'), [allocations.data]);
  const realizedAllocations = useMemo(() => activeAllocations.filter((a) => a.source === 'realizado'), [activeAllocations]);
  const legacyAllocations = useMemo(() => activeAllocations.filter((a) => a.source === 'legado'), [activeAllocations]);
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activeAllocations) map.set(a.profile_id, (map.get(a.profile_id) ?? 0) + Number(a.allocated_hours));
    return map;
  }, [activeAllocations]);
  const plannedByProfile = useMemo(() => {
    const map = new Map<string, { total: number; tasks: TaskPlannedAllocationRow[] }>();
    for (const row of planned.data ?? []) {
      const entry = map.get(row.profile_id) ?? { total: 0, tasks: [] };
      entry.total += Number(row.planned_hours);
      entry.tasks.push(row);
      map.set(row.profile_id, entry);
    }
    return map;
  }, [planned.data]);
  const activeIds = useMemo(() => new Set(activeMembers.map((m) => m.profile_id)), [activeMembers]);
  const visibleCandidates = useMemo(() => {
    const term = candidateSearch.trim().toLocaleLowerCase('pt-BR');
    return (candidates.data ?? []).filter((person) => {
      if (activeIds.has(person.id)) return false;
      if (!term) return true;
      return [person.full_name, person.employee_number, person.email]
        .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [candidates.data, activeIds, candidateSearch]);

  const areaOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of members) if (m.profile?.area?.name) names.add(m.profile.area.name);
    return [...names].sort();
  }, [members]);
  const filteredMembers = areaFilter ? members.filter((m) => m.profile?.area?.name === areaFilter) : members;
  const filteredAllocations = areaFilter
    ? realizedAllocations.filter((a) => a.profile?.area?.name === areaFilter) : realizedAllocations;
  const filteredLegacyAllocations = areaFilter
    ? legacyAllocations.filter((a) => a.profile?.area?.name === areaFilter) : legacyAllocations;
  const plannedRows = (areaFilter ? members.filter((m) => m.profile?.area?.name === areaFilter) : members)
    .filter((m) => plannedByProfile.has(m.profile_id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['members', projectId] });
    queryClient.invalidateQueries({ queryKey: ['allocations'] });
    queryClient.invalidateQueries({ queryKey: ['task-planned-allocation'] });
    queryClient.invalidateQueries({ queryKey: ['resource-capacity'] });
  };

  const saveMember = useMutation({
    mutationFn: async () => {
      const roleLabel = memberForm.role === 'Outro' ? memberForm.custom_role.trim() : memberForm.role;
      if (!editingMember && !memberForm.profile_id) throw new Error('Selecione um colaborador.');
      if (!roleLabel) throw new Error('Informe o papel no projeto.');
      if (!memberForm.start_date) throw new Error('Informe a data de inicio.');
      if (memberForm.end_date && memberForm.end_date < memberForm.start_date) throw new Error('A data final deve ser posterior a inicial.');
      const patch = {
        role_label: roleLabel, start_date: memberForm.start_date,
        end_date: memberForm.end_date || null, status: memberForm.status,
        notes: memberForm.notes.trim() || null,
      };
      if (editingMember) await updateProjectMember(editingMember.id, patch);
      else await createProjectMember({ project_id: projectId, profile_id: memberForm.profile_id, ...patch });
    },
    onSuccess: () => {
      invalidate(); setMemberOpen(false); setEditingMember(null); setMemberForm(blankMember);
      toast.success(editingMember ? 'Vinculo atualizado' : 'Membro adicionado');
    },
    onError: (error) => toast.error('Nao foi possivel salvar o vinculo', describeError(error)),
  });

  const inactivate = useMutation({
    mutationFn: (member: ProjectMemberRow) => updateProjectMember(member.id, { status: 'inativo', end_date: member.end_date ?? today() }),
    onSuccess: () => { invalidate(); setInactivateMember(null); toast.success('Vinculo inativado', 'O historico e as alocacoes foram preservados.'); },
    onError: (error) => toast.error('Nao foi possivel inativar', describeError(error)),
  });

  function allocationHours() {
    const amount = Number(allocationForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe horas ou percentual maior que zero.');
    if (allocationForm.mode === 'hours') return amount;
    const member = members.find((m) => m.profile_id === allocationForm.profile_id);
    const days = daysInclusive(allocationForm.period_start, allocationForm.period_end);
    return Number((((member?.profile?.weekly_capacity_hours ?? 0) * days / 7) * amount / 100).toFixed(2));
  }

  const saveAllocation = useMutation({
    mutationFn: async () => {
      if (!allocationForm.profile_id) throw new Error('Selecione um membro do projeto.');
      if (!allocationForm.period_start || !allocationForm.period_end) throw new Error('Informe o periodo.');
      if (allocationForm.period_end < allocationForm.period_start) throw new Error('A data final deve ser posterior a inicial.');
      const hours = allocationHours();
      const result = await checkAllocationCapacity({
        projectId, profileId: allocationForm.profile_id, periodStart: allocationForm.period_start,
        periodEnd: allocationForm.period_end, allocatedHours: hours, excludeId: editingAllocation?.id,
      });
      setCapacity(result);
      if (result.overloaded && allocationForm.overload_justification.trim().length < 10) {
        throw new Error(`A dedicacao chegara a ${Number(result.total_pct).toFixed(1)}%. Informe uma justificativa para confirmar a sobrecarga.`);
      }
      await upsertAllocation({
        id: editingAllocation?.id, project_id: projectId, profile_id: allocationForm.profile_id,
        role_label: members.find((m) => m.profile_id === allocationForm.profile_id)?.role_label ?? null,
        period_start: allocationForm.period_start, period_end: allocationForm.period_end,
        allocated_hours: hours,
        allocation_pct: allocationForm.mode === 'percent'
          ? Number(allocationForm.amount)
          : (Number(result.capacity_hours) > 0 ? Number((hours / Number(result.capacity_hours) * 100).toFixed(2)) : null),
        description: allocationForm.description.trim() || null, status: 'ativa',
        overload_justification: allocationForm.overload_justification.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate(); setAllocationOpen(false); setEditingAllocation(null); setCapacity(null); setAllocationForm(blankAllocation);
      toast.success(editingAllocation ? 'Horas realizadas atualizadas' : 'Horas realizadas registradas');
    },
    onError: (error) => toast.error('Nao foi possivel salvar as horas realizadas', describeError(error)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAllocation(id),
    onSuccess: () => { invalidate(); setCancelTarget(null); toast.success('Registro cancelado', 'O registro foi preservado na trilha de auditoria.'); },
    onError: (error) => toast.error('Nao foi possivel cancelar', describeError(error)),
  });

  function openMemberEdit(member: ProjectMemberRow) {
    const known = ['Líder', 'Membro', 'Especialista'].includes(member.role_label ?? '');
    setMemberForm({
      profile_id: member.profile_id, role: known ? member.role_label! : 'Outro',
      custom_role: known ? '' : (member.role_label ?? ''), start_date: member.start_date,
      end_date: member.end_date ?? '', status: member.status, notes: member.notes ?? '',
    });
    setEditingMember(member); setMemberOpen(true);
  }

  function openAllocationEdit(allocation: AllocationRow) {
    setAllocationForm({
      profile_id: allocation.profile_id, period_start: allocation.period_start, period_end: allocation.period_end,
      mode: 'hours', amount: String(allocation.allocated_hours), description: allocation.description ?? '',
      overload_justification: allocation.overload_justification ?? '',
    });
    setEditingAllocation(allocation); setCapacity(null); setAllocationOpen(true);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      {areaOptions.length > 0 && (
        <Select className="w-auto" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filtrar recursos por area">
          <option value="">Todas as areas</option>
          {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
        </Select>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Equipe do projeto</h2>
            {canManage && <Button size="sm" onClick={() => { setEditingMember(null); setCandidateSearch(''); setMemberForm(blankMember); setMemberOpen(true); }} icon={<Plus className="h-3.5 w-3.5" />}>Adicionar membro</Button>}
          </header>
          {filteredMembers.length === 0 ? (
            <div className="p-4"><EmptyState title="Nenhum membro vinculado" description="Adicione colaboradores para definir responsabilidades e acompanhar a capacidade." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <li key={member.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <AvatarWithName name={member.profile?.full_name} subtitle={[member.profile?.employee_number, member.profile?.area?.name].filter(Boolean).join(' · ') || undefined} />
                    <div className="flex items-center gap-1">
                      <Badge tone={member.status === 'ativo' ? 'ok' : 'neutral'}>{member.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge>
                      {canManage && <Button size="icon" variant="ghost" aria-label="Editar membro" onClick={() => openMemberEdit(member)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canManage && member.status === 'ativo' && member.project_role !== 'project_owner' && <Button size="icon" variant="ghost" aria-label="Inativar membro" onClick={() => setInactivateMember(member)}><UserMinus className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">
                    <Badge tone="neutral">{member.role_label ?? 'Membro'}</Badge>
                    <span>{formatDate(member.start_date)} a {member.end_date ? formatDate(member.end_date) : 'sem termino'}</span>
                    <span>· {(plannedByProfile.get(member.profile_id)?.total ?? 0).toFixed(0)} h planejadas</span>
                    <span>· {Number(totals.get(member.profile_id) ?? 0).toFixed(0)} h apontadas</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{member.profile?.area?.business_unit?.name ?? 'Gerencia nao informada'} · {member.profile?.job_title ?? 'Cargo nao informado'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Planejado</h2>
            <p className="text-xs text-muted">Planejamento de capacidade gerado automaticamente a partir das tarefas do projeto. As horas planejadas sao calculadas com base no esforco estimado, periodo e responsaveis definidos nas tarefas.</p>
          </header>
          {planned.isLoading ? <div className="p-4"><Spinner /></div> : plannedRows.length === 0 ? (
            <div className="p-4"><EmptyState title="Nenhuma hora planejada" description="Defina horas estimadas, periodo e responsavel nas tarefas para que a alocacao seja calculada." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {plannedRows.map((member) => {
                const entry = plannedByProfile.get(member.profile_id)!;
                const expanded = expandedProfile === member.profile_id;
                return (
                  <li key={member.profile_id} className="p-3">
                    <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setExpandedProfile(expanded ? null : member.profile_id)}>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        {member.profile?.full_name ?? '—'}
                      </span>
                      <b className="whitespace-nowrap text-sm tabular-nums">{entry.total.toFixed(0)} h planejadas</b>
                    </button>
                    {expanded && (
                      <ul className="mt-2 space-y-1 pl-5 text-xs text-muted">
                        {entry.tasks.map((task) => (
                          <li key={task.task_id} className="flex items-center justify-between gap-2">
                            <span>{task.code} · {task.title}</span>
                            <span className="tabular-nums">{Number(task.planned_hours).toFixed(1)} h · {formatDate(task.period_start)} a {formatDate(task.period_end)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Horas realizadas</h2>
            {canManage && <Button size="sm" disabled={activeMembers.length === 0} title={activeMembers.length ? undefined : 'Adicione um membro ativo antes de registrar horas realizadas.'} onClick={() => { setEditingAllocation(null); setCapacity(null); setAllocationForm({ ...blankAllocation, profile_id: activeMembers[0]?.profile_id ?? '' }); setAllocationOpen(true); }} icon={<CalendarPlus className="h-3.5 w-3.5" />}>Registrar horas realizadas</Button>}
          </header>
          {filteredAllocations.length === 0 ? (
            <div className="p-4"><EmptyState title="Nenhuma hora realizada registrada" description="Registre o esforco efetivamente executado para comparar com o planejado." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredAllocations.map((allocation) => (
                <li key={allocation.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-sm font-medium">{allocation.profile?.full_name ?? '—'}</p><p className="text-xs text-muted">{allocation.description || allocation.role_label || 'Sem descricao'}</p></div>
                    <div className="flex items-center gap-1"><b className="mr-1 whitespace-nowrap text-sm tabular-nums">{Number(allocation.allocated_hours).toFixed(0)} h</b>{canManage && <Button size="icon" variant="ghost" aria-label="Editar horas realizadas" onClick={() => openAllocationEdit(allocation)}><Pencil className="h-3.5 w-3.5" /></Button>}{canManage && <Button size="icon" variant="ghost" aria-label="Cancelar horas realizadas" onClick={() => setCancelTarget(allocation)}><UserMinus className="h-3.5 w-3.5" /></Button>}</div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{formatDate(allocation.period_start)} a {formatDate(allocation.period_end)}{allocation.allocation_pct != null && <> · {Number(allocation.allocation_pct).toFixed(1)}%</>}</p>
                </li>
              ))}
            </ul>
          )}
          {filteredLegacyAllocations.length > 0 && (
            <details className="border-t border-border px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-muted">Dados legados (cadastro manual anterior a automacao) · {filteredLegacyAllocations.length}</summary>
              <ul className="mt-2 divide-y divide-border">
                {filteredLegacyAllocations.map((allocation) => (
                  <li key={allocation.id} className="py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-sm font-medium">{allocation.profile?.full_name ?? '—'}</p><p className="text-xs text-muted">{allocation.description || allocation.role_label || 'Sem descricao'}</p></div>
                      <b className="whitespace-nowrap text-sm tabular-nums">{Number(allocation.allocated_hours).toFixed(0)} h</b>
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatDate(allocation.period_start)} a {formatDate(allocation.period_end)}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <Modal open={memberOpen} onClose={() => setMemberOpen(false)} title={editingMember ? 'Editar vinculo' : 'Adicionar membro'} description="O colaborador deve estar previamente cadastrado no sistema." footer={<><Button variant="secondary" onClick={() => setMemberOpen(false)}>Cancelar</Button><Button loading={saveMember.isPending} onClick={() => saveMember.mutate()}>Salvar</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {!editingMember && <><Field label="Buscar por nome, matricula ou e-mail" className="sm:col-span-2"><Input aria-label="Buscar por nome, matricula ou e-mail" value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)} placeholder="Digite para filtrar..." /></Field><Field label="Colaborador" required className="sm:col-span-2"><Select aria-label="Colaborador" value={memberForm.profile_id} onChange={(e) => setMemberForm((form) => ({ ...form, profile_id: e.target.value }))}><option value="">Selecione...</option>{visibleCandidates.map((person) => <option key={person.id} value={person.id} disabled={!person.active}>{person.full_name} · {person.employee_number || 'sem matricula'} · {person.email} · {person.area?.business_unit?.name || 'sem Gerencia'} / {person.area?.name || 'sem Area'} · {person.job_title || 'sem cargo'} · {person.active ? 'Ativo' : 'Inativo'}</option>)}</Select></Field></>}
          {editingMember && <div className="sm:col-span-2 rounded-lg bg-surface-2 p-3 text-sm"><b>{editingMember.profile?.full_name}</b><p className="text-xs text-muted">{editingMember.profile?.email} · {editingMember.profile?.employee_number || 'Sem matricula'}</p></div>}
          <Field label="Papel no projeto" required><Select value={memberForm.role} onChange={(e) => setMemberForm((form) => ({ ...form, role: e.target.value }))}>{['Líder', 'Membro', 'Especialista', 'Outro'].map((role) => <option key={role}>{role}</option>)}</Select></Field>
          {memberForm.role === 'Outro' && <Field label="Outro papel" required><Input value={memberForm.custom_role} onChange={(e) => setMemberForm((form) => ({ ...form, custom_role: e.target.value }))} /></Field>}
          <Field label="Inicio" required><Input type="date" value={memberForm.start_date} onChange={(e) => setMemberForm((form) => ({ ...form, start_date: e.target.value }))} /></Field>
          <Field label="Termino previsto"><Input type="date" value={memberForm.end_date} onChange={(e) => setMemberForm((form) => ({ ...form, end_date: e.target.value }))} /></Field>
          {editingMember && <Field label="Status do vinculo"><Select value={memberForm.status} onChange={(e) => setMemberForm((form) => ({ ...form, status: e.target.value as 'ativo' | 'inativo' }))}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></Select></Field>}
          <Field label="Observacoes" className="sm:col-span-2"><Textarea value={memberForm.notes} onChange={(e) => setMemberForm((form) => ({ ...form, notes: e.target.value }))} /></Field>
        </div>
      </Modal>

      <Modal open={allocationOpen} onClose={() => setAllocationOpen(false)} title={editingAllocation ? 'Editar horas realizadas' : 'Registrar horas realizadas'} description="Horas efetivamente executadas - o planejado e' calculado automaticamente a partir das tarefas e nao e' editado aqui." footer={<><Button variant="secondary" onClick={() => setAllocationOpen(false)}>Cancelar</Button><Button loading={saveAllocation.isPending} onClick={() => saveAllocation.mutate()}>Salvar</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Membro do projeto" required className="sm:col-span-2"><Select value={allocationForm.profile_id} onChange={(e) => { setCapacity(null); setAllocationForm((form) => ({ ...form, profile_id: e.target.value })); }}>{activeMembers.map((member) => <option key={member.profile_id} value={member.profile_id}>{member.profile?.full_name} · {member.role_label || 'Membro'}</option>)}</Select></Field>
          <Field label="Inicio" required><Input type="date" value={allocationForm.period_start} onChange={(e) => { setCapacity(null); setAllocationForm((form) => ({ ...form, period_start: e.target.value })); }} /></Field>
          <Field label="Termino" required><Input type="date" value={allocationForm.period_end} onChange={(e) => { setCapacity(null); setAllocationForm((form) => ({ ...form, period_end: e.target.value })); }} /></Field>
          <Field label="Forma"><Select value={allocationForm.mode} onChange={(e) => { setCapacity(null); setAllocationForm((form) => ({ ...form, mode: e.target.value as 'hours' | 'percent', amount: '' })); }}><option value="hours">Horas previstas</option><option value="percent">Percentual de dedicacao</option></Select></Field>
          <Field label={allocationForm.mode === 'hours' ? 'Horas previstas' : 'Dedicacao (%)'} required><Input aria-label={allocationForm.mode === 'hours' ? 'Horas previstas' : 'Dedicacao (%)'} type="number" min="0.01" step="0.01" value={allocationForm.amount} onChange={(e) => { setCapacity(null); setAllocationForm((form) => ({ ...form, amount: e.target.value })); }} /></Field>
          <Field label="Descricao ou atividade" className="sm:col-span-2"><Textarea value={allocationForm.description} onChange={(e) => setAllocationForm((form) => ({ ...form, description: e.target.value }))} /></Field>
          {capacity?.overloaded && <div className="sm:col-span-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn"><b>Sobrecarga identificada: {Number(capacity.total_pct).toFixed(1)}%</b><p className="mt-1 text-xs">Limite configurado: {Number(capacity.limit_pct).toFixed(1)}%. A confirmacao exige justificativa.</p></div>}
          {(capacity?.overloaded || allocationForm.overload_justification) && <Field label="Justificativa da sobrecarga" required className="sm:col-span-2" hint="Minimo de 10 caracteres."><Textarea aria-label="Justificativa da sobrecarga" value={allocationForm.overload_justification} onChange={(e) => setAllocationForm((form) => ({ ...form, overload_justification: e.target.value }))} /></Field>}
        </div>
      </Modal>

      <ConfirmDialog open={Boolean(inactivateMember)} onClose={() => setInactivateMember(null)} onConfirm={() => inactivateMember && inactivate.mutate(inactivateMember)} loading={inactivate.isPending} title="Inativar vinculo" confirmLabel="Inativar" description={<>O vinculo de <b>{inactivateMember?.profile?.full_name}</b> sera encerrado, preservando historico e alocacoes.</>} />
      <ConfirmDialog open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)} loading={cancel.isPending} title="Cancelar horas realizadas" confirmLabel="Cancelar" description="O registro deixara os totais ativos, mas permanecera no historico e na auditoria." />
    </div>
  );
}
