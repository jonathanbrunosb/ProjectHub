import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import {
  deleteCalendarEvent, listCalendarConflicts, listCalendarEvents, upsertCalendarEvent,
} from '@/services/governance';
import { listCompanies } from '@/services/projects';
import { formatDate, daysBetween } from '@/utils/format';
import { calendarKindLabel, priorityLabel } from '@/utils/domain-labels';
import type { CalendarWindowKind, CriticalCalendarEvent } from '@/types/domain';

const blank = {
  kind: 'fechamento_mensal' as CalendarWindowKind,
  name: '', description: '', start_date: '', end_date: '',
  is_freeze: false, severity: 'alta', company_id: '',
};

/**
 * Calendario critico contabil. Serve a dois propositos: cadastrar as janelas
 * sensiveis e evidenciar as entregas de projeto que caem dentro delas.
 */
export function CalendarPage() {
  useBreadcrumbs([{ label: 'Calendario Critico' }]);
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CriticalCalendarEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [removing, setRemoving] = useState<CriticalCalendarEvent | null>(null);

  const eventsQuery = useQuery({ queryKey: ['calendar', 'events'], queryFn: listCalendarEvents });
  const conflictsQuery = useQuery({ queryKey: ['calendar', 'conflicts'], queryFn: listCalendarConflicts });
  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: open });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome da janela.');
      if (!form.start_date || !form.end_date) throw new Error('Informe o periodo da janela.');
      if (form.end_date < form.start_date) throw new Error('A data final deve ser posterior a inicial.');
      await upsertCalendarEvent({
        id: editing?.id,
        kind: form.kind,
        name: form.name.trim(),
        description: form.description || null,
        start_date: form.start_date,
        end_date: form.end_date,
        is_freeze: form.is_freeze,
        severity: form.severity as never,
        company_id: form.company_id || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success(editing ? 'Janela atualizada' : 'Janela cadastrada');
      setOpen(false);
      setEditing(null);
      setForm(blank);
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteCalendarEvent(removing!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Janela removida');
      setRemoving(null);
    },
    onError: (e) => toast.error('Nao foi possivel remover', describeError(e)),
  });

  const upcoming = useMemo(
    () => (eventsQuery.data ?? [])
      .filter((e) => (daysBetween(new Date(), e.end_date) ?? -1) >= 0)
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [eventsQuery.data],
  );

  const openEditor = (event: CriticalCalendarEvent | null) => {
    setEditing(event);
    setForm(event ? {
      kind: event.kind, name: event.name, description: event.description ?? '',
      start_date: event.start_date, end_date: event.end_date, is_freeze: event.is_freeze,
      severity: event.severity, company_id: event.company_id ?? '',
    } : blank);
    setOpen(true);
  };

  if (eventsQuery.isError) {
    return <ErrorState message={(eventsQuery.error as Error).message} onRetry={() => eventsQuery.refetch()} />;
  }

  const conflicts = conflictsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Calendario Critico Contabil"
        description="Janelas de fechamento, entregas regulatorias e periodos de freeze que restringem o planejamento dos projetos."
        actions={can('calendar.manage') && (
          <Button onClick={() => openEditor(null)} icon={<Plus className="h-4 w-4" />}>Nova janela</Button>
        )}
      />

      {conflicts.length > 0 && (
        <section className="card mb-4 border-warn/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-warn" />
            {conflicts.length} entrega(s) coincidem com janela critica
          </h2>
          <p className="mb-3 text-xs text-muted">
            Marcos, go-lives e homologacoes agendados dentro dessas janelas concorrem com a rotina de
            fechamento. Avalie repriorizar a data ou reforcar a equipe.
          </p>
          <ul className="divide-y divide-border">
            {conflicts.map((c) => (
              <li key={`${c.milestone_id}-${c.event_id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link to={`/projetos/${c.project_id}`} className="font-mono text-xs font-medium text-brand hover:underline">
                  {c.project_code}
                </Link>
                <span className="font-medium">{c.milestone_name}</span>
                <span className="text-muted">em {formatDate(c.due_date)}</span>
                <Badge tone={c.is_freeze ? 'danger' : 'warn'}>
                  {c.is_freeze ? 'Freeze · ' : ''}{c.event_name}
                </Badge>
                <span className="text-xs text-muted">
                  ({formatDate(c.window_start)} a {formatDate(c.window_end)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {eventsQuery.isLoading ? (
        <Spinner />
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="Nenhuma janela critica cadastrada"
          description="Cadastre fechamentos, ITR, DFP, ECD, ECF, inventarios e periodos de freeze para que o sistema alerte conflitos com as entregas dos projetos."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e) => {
            const days = daysBetween(new Date(), e.start_date) ?? 0;
            const active = days <= 0 && (daysBetween(new Date(), e.end_date) ?? 0) >= 0;
            return (
              <article key={e.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone={e.is_freeze ? 'danger' : e.severity === 'critica' ? 'danger' : 'warn'}>
                      {calendarKindLabel[e.kind]}
                    </Badge>
                    <h3 className="mt-1.5 truncate text-sm font-semibold">{e.name}</h3>
                  </div>
                  {can('calendar.manage') && (
                    <button onClick={() => setRemoving(e)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">
                  {formatDate(e.start_date)} a {formatDate(e.end_date)}
                </p>
                {e.description && <p className="mt-1 text-xs text-muted">{e.description}</p>}
                <div className="mt-3 flex items-center gap-2">
                  {active ? (
                    <Badge tone="danger" dot>Em curso</Badge>
                  ) : (
                    <Badge tone="info">Comeca em {days} dia(s)</Badge>
                  )}
                  {e.is_freeze && <Badge tone="danger">Freeze de mudancas</Badge>}
                </div>
                {can('calendar.manage') && (
                  <button onClick={() => openEditor(e)} className="mt-3 text-xs text-brand hover:underline">Editar</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Editar janela critica' : 'Nova janela critica'}
        description="Janelas com freeze bloqueiam mudancas e geram alerta em qualquer entrega agendada no periodo."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CalendarWindowKind }))}>
              {Object.entries(calendarKindLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Severidade">
            <Select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Nome" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Fechamento mensal de marco" />
          </Field>
          <Field label="Inicio" required>
            <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </Field>
          <Field label="Fim" required>
            <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </Field>
          <Field label="Empresa" hint="Em branco aplica a todas as empresas.">
            <Select value={form.company_id} onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}>
              <option value="">Todas</option>
              {(companiesQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[rgb(var(--c-brand))]"
                checked={form.is_freeze}
                onChange={(e) => setForm((f) => ({ ...f, is_freeze: e.target.checked }))}
              />
              Periodo de freeze (bloqueio de mudancas)
            </label>
          </div>
          <Field label="Descricao" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Remover janela critica"
        confirmLabel="Remover"
        description={<>A janela <b>{removing?.name}</b> deixara de gerar alertas de conflito com as entregas dos projetos.</>}
      />
    </>
  );
}
