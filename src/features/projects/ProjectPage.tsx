import { useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Users } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { AvatarWithName } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useFinancialModule } from '@/hooks/useFinancialModule';
import { resolveFinancialEnabled } from '@/lib/financialModule';
import { describeError } from '@/lib/supabase/client';
import {
  getProject, getProjectOverview, listProjectMembers, updateProject,
} from '@/services/projects';
import type { FinancialModuleMode } from '@/types/domain';
import { listMilestones, listTasks } from '@/services/tasks';
import { listActionPlans, listRisks } from '@/services/risks';
import { listAllocations, listAuditLog, listCalendarConflicts, listDecisions } from '@/services/governance';
import { formatDate, formatDateTime, relativeFromNow } from '@/utils/format';
import {
  auditActionLabel, auditActionTone, entityLabel, financialModeLabel, projectStatusLabel,
  priorityLabel, roleLabel,
} from '@/utils/domain-labels';
import { ProjectHeader } from './ProjectHeader';
import { TaskList } from '@/features/tasks/TaskList';
import { RiskTable, ActionPlanTable } from '@/features/risks/RiskViews';
import { FinancialTab } from './tabs/FinancialTab';
import { GoalIndicatorTab } from './tabs/GoalIndicatorTab';
import { DecisionsTab, IndicatorsTab, StatusReportsTab } from './tabs/GovernanceTabs';
import { CustomFieldsPanel } from '@/features/customfields/CustomFieldsPanel';
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel';
import { GanttChart } from '@/components/gantt/GanttChart';

const TABS = [
  { key: 'visao-geral', label: 'Visao Geral' },
  { key: 'cronograma', label: 'Plano & Cronograma' },
  { key: 'tarefas', label: 'Tarefas & Entregas' },
  { key: 'meta-prazo', label: 'Indicador de Meta' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'recursos', label: 'Recursos' },
  { key: 'riscos', label: 'Riscos & Issues' },
  { key: 'acoes', label: 'Planos de Acao' },
  { key: 'indicadores', label: 'Indicadores' },
  { key: 'decisoes', label: 'Decisoes & Aprovacoes' },
  { key: 'campos', label: 'Campos Personalizados' },
  { key: 'anexos', label: 'Anexos' },
  { key: 'status-report', label: 'Status Reports' },
  { key: 'historico', label: 'Historico / Auditoria' },
];

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { can, profile } = useAuth();

  const sub = location.pathname.split('/')[3] ?? 'visao-geral';
  const tab = TABS.some((t) => t.key === sub) ? sub : 'visao-geral';

  const overview = useQuery({
    queryKey: ['project', projectId, 'overview'],
    queryFn: () => getProjectOverview(projectId),
  });
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const tasks = useQuery({ queryKey: ['tasks', projectId], queryFn: () => listTasks(projectId) });
  const risks = useQuery({ queryKey: ['risks', projectId], queryFn: () => listRisks(projectId) });
  const actions = useQuery({ queryKey: ['actions', projectId], queryFn: () => listActionPlans(projectId) });
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => listProjectMembers(projectId) });

  const financialActive = overview.data?.financial_effective_enabled ?? true;
  const goalIndicatorActive = overview.data?.goal_indicator_enabled ?? false;
  const canManageGoalIndicator = can('goal_indicator.manage');
  const visibleTabs = TABS.filter((t) => {
    if (t.key === 'financeiro') return financialActive;
    // Privilegiado sempre ve a aba (precisa dela para ativar); demais so quando ja ativo.
    if (t.key === 'meta-prazo') return goalIndicatorActive || canManageGoalIndicator;
    return true;
  });

  useBreadcrumbs([
    { label: 'Portfolio de Projetos', to: '/portfolio' },
    { label: overview.data?.code ?? '...', to: `/projetos/${projectId}` },
    { label: visibleTabs.find((t) => t.key === tab)?.label ?? '' },
  ]);

  const [editing, setEditing] = useState(false);

  if (overview.isError) {
    return <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />;
  }
  if (overview.isLoading) return <Spinner label="Carregando projeto" />;
  if (!overview.data) {
    return (
      <EmptyState
        title="Projeto nao encontrado"
        description="O projeto nao existe ou voce nao tem permissao para acessa-lo."
        action={<Button onClick={() => navigate('/portfolio')}>Voltar ao portfolio</Button>}
      />
    );
  }

  const p = overview.data;
  const isOwner = p.owner_id === profile?.id;
  const canEdit = can('portfolio.manage') || isOwner || can('project.write');
  const canManage = can('portfolio.manage') || isOwner;

  return (
    <>
      <ProjectHeader project={p} onEdit={() => setEditing(true)} />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(k) => navigate(`/projetos/${projectId}/${k}`)}
        items={visibleTabs.map((t) => ({
          ...t,
          count: t.key === 'tarefas' ? tasks.data?.length
            : t.key === 'riscos' ? risks.data?.length
              : t.key === 'acoes' ? actions.data?.length : undefined,
        }))}
      />

      {tab === 'visao-geral' && <OverviewTab projectId={projectId} canEdit={canEdit} />}
      {tab === 'cronograma' && <ScheduleTab projectId={projectId} />}
      {tab === 'tarefas' && (
        <TaskList
          tasks={tasks.data ?? []}
          loading={tasks.isLoading}
          projectId={projectId}
          canEdit={canEdit}
          module={`tasks-project`}
        />
      )}
      {tab === 'meta-prazo' && <GoalIndicatorTab projectId={projectId} />}
      {tab === 'financeiro' && financialActive && <FinancialTab projectId={projectId} canManage={canManage} canEdit={canEdit} />}
      {tab === 'recursos' && <ResourcesTab projectId={projectId} members={members.data ?? []} loading={members.isLoading} />}
      {tab === 'riscos' && (
        <RiskTable risks={risks.data ?? []} loading={risks.isLoading} projectId={projectId} canEdit={canEdit} module="risks-project" />
      )}
      {tab === 'acoes' && (
        <ActionPlanTable actions={actions.data ?? []} loading={actions.isLoading} projectId={projectId} canEdit={canEdit} module="actions-project" />
      )}
      {tab === 'indicadores' && (
        <IndicatorsTab projectId={projectId} canEdit={canEdit} evmEnabled={Boolean(project.data?.evm_enabled)} />
      )}
      {tab === 'decisoes' && (
        <DecisionsTab projectId={projectId} canEdit={canEdit} canDecide={can('decision.decide') || p.sponsor_id === profile?.id} />
      )}
      {tab === 'campos' && (
        <div className="card p-4">
          <CustomFieldsPanel
            entity="project"
            recordId={projectId}
            projectId={projectId}
            templateId={project.data?.template_id ?? null}
            canEdit={canEdit}
          />
        </div>
      )}
      {tab === 'anexos' && <AttachmentsPanel projectId={projectId} entity="project" canEdit={canEdit} />}
      {tab === 'status-report' && <StatusReportsTab projectId={projectId} canManage={canManage} />}
      {tab === 'historico' && <HistoryTab projectId={projectId} />}

      {project.data && (
        <EditProjectModal
          open={editing}
          onClose={() => setEditing(false)}
          project={project.data}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function OverviewTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const overview = useQuery({ queryKey: ['project', projectId, 'overview'], queryFn: () => getProjectOverview(projectId) });
  const milestones = useQuery({ queryKey: ['milestones', projectId], queryFn: () => listMilestones(projectId) });
  const risks = useQuery({ queryKey: ['risks', projectId], queryFn: () => listRisks(projectId) });
  const decisions = useQuery({ queryKey: ['decisions', projectId], queryFn: () => listDecisions(projectId) });
  const conflicts = useQuery({ queryKey: ['calendar', 'conflicts'], queryFn: listCalendarConflicts });

  const [summary, setSummary] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateProject(projectId, {
      executive_summary: summary ?? '',
      executive_summary_updated_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setSummary(null);
      toast.success('Resumo executivo atualizado');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const p = project.data;
  const o = overview.data;
  const projectConflicts = (conflicts.data ?? []).filter((c) => c.project_id === projectId);
  const openRisks = (risks.data ?? []).filter((r) => r.status === 'aberto' || r.status === 'em_tratamento');
  const pendingDecisions = (decisions.data ?? []).filter((d) => d.status === 'aguardando_decisao');
  const upcoming = (milestones.data ?? []).filter((m) => !m.completed_at).slice(0, 5);

  if (project.isLoading) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Resumo executivo atual</h2>
            {p?.executive_summary_updated_at && (
              <span className="text-xs text-muted">Atualizado {relativeFromNow(p.executive_summary_updated_at)}</span>
            )}
          </div>
          {summary === null ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {p?.executive_summary || <span className="text-muted">Nenhum resumo executivo registrado.</span>}
              </p>
              {canEdit && (
                <button onClick={() => setSummary(p?.executive_summary ?? '')} className="mt-2 text-xs text-brand hover:underline">
                  Atualizar resumo
                </button>
              )}
            </>
          ) : (
            <div>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[120px]" />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSummary(null)}>Cancelar</Button>
                <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextCard title="Objetivo" body={p?.objective} />
          <TextCard title="Escopo" body={p?.scope} />
          <TextCard title="Resultados esperados" body={p?.expected_results} className="sm:col-span-2" />
        </div>

        {projectConflicts.length > 0 && (
          <section className="card border-warn/40 p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-warn" /> Conflito com o calendario contabil
            </h2>
            <ul className="space-y-1.5 text-sm">
              {projectConflicts.map((c) => (
                <li key={`${c.milestone_id}-${c.event_id}`}>
                  <b>{c.milestone_name}</b> em {formatDate(c.due_date)} coincide com{' '}
                  <Badge tone={c.is_freeze ? 'danger' : 'warn'}>{c.event_name}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="space-y-4">
        <ListCard title="Proximos marcos" empty="Nenhum marco em aberto">
          {upcoming.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm">{m.name}</span>
              <span className="shrink-0 text-xs text-muted">{formatDate(m.due_date)}</span>
            </li>
          ))}
        </ListCard>

        <ListCard title={`Riscos abertos (${openRisks.length})`} empty="Nenhum risco aberto">
          {openRisks.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm">{r.title}</span>
              <Badge tone={r.score >= 15 ? 'danger' : r.score >= 9 ? 'warn' : 'info'}>{r.score}</Badge>
            </li>
          ))}
        </ListCard>

        <ListCard title="Decisoes pendentes" empty="Nenhuma decisao pendente">
          {pendingDecisions.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm">{d.subject}</span>
              <span className="shrink-0 text-xs text-muted">{formatDate(d.deadline)}</span>
            </li>
          ))}
        </ListCard>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Situacao</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Tarefas em aberto" value={String(o?.open_tasks ?? 0)} />
            <Row label="Tarefas vencidas" value={String(o?.overdue_tasks ?? 0)} danger={Number(o?.overdue_tasks) > 0} />
            <Row label="Acoes vencidas" value={String(o?.overdue_actions ?? 0)} danger={Number(o?.overdue_actions) > 0} />
            <Row label="Riscos criticos" value={String(o?.critical_risks ?? 0)} danger={Number(o?.critical_risks) > 0} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function ScheduleTab({ projectId }: { projectId: string }) {
  const tasks = useQuery({ queryKey: ['tasks', projectId], queryFn: () => listTasks(projectId) });
  const milestones = useQuery({ queryKey: ['milestones', projectId], queryFn: () => listMilestones(projectId) });

  const items = useMemo(() => {
    const rows = (tasks.data ?? [])
      .filter((t) => t.start_date || t.due_date)
      .map((t) => ({
        id: t.id,
        label: `${t.code} · ${t.title}`,
        start: t.start_date ?? t.due_date,
        end: t.due_date ?? t.start_date,
        baselineStart: t.start_date,
        baselineEnd: t.baseline_due_date,
        progress: Number(t.progress),
        isMilestone: t.is_milestone,
        isCritical: t.is_critical,
        tone: (t.status === 'bloqueada' ? 'danger'
          : t.status === 'concluida' ? 'ok'
            : t.status === 'em_andamento' ? 'info' : 'neutral') as 'danger' | 'ok' | 'info' | 'neutral',
      }));
    const ms = (milestones.data ?? [])
      .filter((m) => !(tasks.data ?? []).some((t) => t.id === m.task_id))
      .map((m) => ({
        id: m.id, label: m.name, start: m.due_date, end: m.due_date,
        baselineStart: m.baseline_date, baselineEnd: m.baseline_date,
        isMilestone: true, isCritical: m.is_critical, level: 1,
      }));
    return [...rows, ...ms];
  }, [tasks.data, milestones.data]);

  if (tasks.isLoading) return <Spinner />;

  return (
    <div className="card p-2">
      <GanttChart items={items} scale="semana" />
    </div>
  );
}

function ResourcesTab({
  projectId, members, loading,
}: { projectId: string; members: Awaited<ReturnType<typeof listProjectMembers>>; loading: boolean }) {
  const allocations = useQuery({ queryKey: ['allocations', projectId], queryFn: () => listAllocations(projectId) });

  if (loading) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Equipe do projeto
        </h2>
        {members.length === 0 ? (
          <EmptyState title="Nenhum membro vinculado" />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2.5">
                <AvatarWithName name={m.profile?.full_name} subtitle={m.profile?.job_title} />
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{m.role_label ?? roleLabel[m.project_role as keyof typeof roleLabel]}</Badge>
                  {!m.can_edit && <Badge tone="info">Somente leitura</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Alocacao</h2>
        {(allocations.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma alocacao registrada" description="Registre horas por periodo para acompanhar capacidade e sobrecarga." />
        ) : (
          <ul className="divide-y divide-border">
            {(allocations.data ?? []).map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{a.profile?.full_name ?? '—'}</span>
                  <span className="shrink-0 tabular-nums text-sm">{Number(a.allocated_hours).toFixed(0)} h</span>
                </div>
                <p className="text-xs text-muted">
                  {a.role_label ?? 'Sem funcao'} · {formatDate(a.period_start)} a {formatDate(a.period_end)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryTab({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['audit', 'project', projectId],
    queryFn: () => listAuditLog({ projectId, limit: 200 }),
  });

  if (isLoading) return <Spinner />;
  if (data.length === 0) return <EmptyState title="Sem eventos registrados" />;

  return (
    <ol className="card divide-y divide-border">
      {data.map((e) => (
        <li key={e.id} className="flex items-start gap-3 p-3.5">
          <Badge tone={auditActionTone[e.action]}>{auditActionLabel[e.action]}</Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <b>{e.user_name ?? 'Sistema'}</b>{' '}
              <span className="text-muted">em {entityLabel[e.entity] ?? e.entity}</span>
            </p>
            {e.changed_fields?.length ? (
              <p className="mt-0.5 font-mono text-xs text-muted">{e.changed_fields.join(', ')}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-muted">{formatDateTime(e.occurred_at)}</span>
        </li>
      ))}
    </ol>
  );
}

function EditProjectModal({
  open, onClose, project,
}: { open: boolean; onClose: () => void; project: NonNullable<Awaited<ReturnType<typeof getProject>>> }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManageFinancial = can('financial_module.manage');
  const { globalEnabled, effectiveEnabled } = useFinancialModule(project.financial_module_mode);
  const [form, setForm] = useState({
    name: project.name, category: project.category, phase: project.phase ?? '',
    status: project.status, priority: project.priority,
    start_date: project.start_date ?? '', target_date: project.target_date ?? '',
    objective: project.objective ?? '', scope: project.scope ?? '',
    expected_results: project.expected_results ?? '',
    progress_method: project.progress_method,
    progress_actual: String(project.progress_actual),
    financial_module_mode: project.financial_module_mode,
  });
  const [confirmingFinancialOff, setConfirmingFinancialOff] = useState(false);

  const save = useMutation({
    mutationFn: async (financialModeOverride?: FinancialModuleMode) => {
      if (form.target_date && form.start_date && form.target_date < form.start_date) {
        throw new Error('A data-alvo deve ser posterior a data de inicio.');
      }
      await updateProject(project.id, {
        name: form.name.trim(),
        category: form.category.trim(),
        phase: form.phase || null,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        objective: form.objective || null,
        scope: form.scope || null,
        expected_results: form.expected_results || null,
        progress_method: form.progress_method,
        ...(form.progress_method === 'manual'
          ? { progress_actual: Math.max(0, Math.min(100, Number(form.progress_actual) || 0)) }
          : {}),
        ...(canManageFinancial
          ? { financial_module_mode: financialModeOverride ?? form.financial_module_mode }
          : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto atualizado');
      setConfirmingFinancialOff(false);
      onClose();
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  function handleSave() {
    // Desativar o modulo financeiro num projeto que ja tem dados exige uma
    // confirmacao extra: os dados continuam intactos, mas somem da experiencia
    // e das consolidacoes - a pessoa precisa saber disso antes de confirmar.
    const willDisableFinancial = canManageFinancial
      && effectiveEnabled
      && form.financial_module_mode !== project.financial_module_mode
      && !resolveFinancialEnabled(form.financial_module_mode, globalEnabled);
    if (willDisableFinancial) {
      setConfirmingFinancialOff(true);
      return;
    }
    save.mutate(undefined);
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar projeto"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={save.isPending}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Categoria"><Input value={form.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="Fase atual"><Input value={form.phase} onChange={(e) => set('phase', e.target.value)} /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(projectStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Inicio"><Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="Data-alvo"><Input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} /></Field>

        <Field
          label="Metodologia de progresso"
          hint="Automatico calcula pela media ponderada das tarefas; manual usa o valor informado."
        >
          <Select value={form.progress_method} onChange={(e) => set('progress_method', e.target.value)}>
            <option value="automatico">Automatico (por tarefas e pesos)</option>
            <option value="manual">Manual (informado pelo Owner)</option>
          </Select>
        </Field>
        {form.progress_method === 'manual' && (
          <Field label="Progresso realizado (%)">
            <Input type="number" min="0" max="100" value={form.progress_actual} onChange={(e) => set('progress_actual', e.target.value)} />
          </Field>
        )}

        <Field label="Objetivo" className="sm:col-span-2">
          <Textarea value={form.objective} onChange={(e) => set('objective', e.target.value)} />
        </Field>
        <Field label="Escopo" className="sm:col-span-2">
          <Textarea value={form.scope} onChange={(e) => set('scope', e.target.value)} />
        </Field>
        <Field label="Resultados esperados" className="sm:col-span-2">
          <Textarea value={form.expected_results} onChange={(e) => set('expected_results', e.target.value)} />
        </Field>

        {canManageFinancial && (
          <Field
            label="Modulos do projeto - Gestao financeira"
            className="sm:col-span-2"
            hint={`Configuracao global: ${globalEnabled ? 'Ativada' : 'Desativada'} · Status efetivo neste projeto: ${effectiveEnabled ? 'Ativada' : 'Desativada'}`}
          >
            <Select
              value={form.financial_module_mode}
              onChange={(e) => setForm((f) => ({ ...f, financial_module_mode: e.target.value as FinancialModuleMode }))}
            >
              {(Object.entries(financialModeLabel) as [FinancialModuleMode, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <ConfirmDialog
        open={confirmingFinancialOff}
        onClose={() => setConfirmingFinancialOff(false)}
        onConfirm={() => save.mutate(form.financial_module_mode)}
        loading={save.isPending}
        title="Desativar gestao financeira neste projeto"
        confirmLabel="Desativar"
        description="Este projeto possui informacoes financeiras cadastradas. Ao desativar a gestao financeira, os dados serao preservados, mas ficarao ocultos e nao serao considerados nas consolidacoes."
      />
    </Modal>
  );
}

function TextCard({ title, body, className }: { title: string; body: string | null | undefined; className?: string }) {
  return (
    <section className={`card p-4 ${className ?? ''}`}>
      <h2 className="mb-1.5 text-sm font-semibold">{title}</h2>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{body || 'Nao informado.'}</p>
    </section>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {hasChildren ? <ul className="divide-y divide-border">{children}</ul> : (
        <p className="py-4 text-center text-xs text-muted">{empty}</p>
      )}
    </section>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums font-medium ${danger ? 'text-danger' : ''}`}>{value}</dd>
    </div>
  );
}
