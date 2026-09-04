import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, Flag } from 'lucide-react';
import type { TaskStatus } from '@/types/domain';
import type { TaskWithContext } from '@/services/tasks';
import { updateTask } from '@/services/tasks';
import { cn } from '@/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import { formatDate, daysBetween } from '@/utils/format';
import { priorityTone, taskStatusLabel } from '@/utils/domain-labels';

const columns: TaskStatus[] = ['nao_iniciada', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida'];

export function TaskBoard({
  tasks, onOpen, canEdit,
}: { tasks: TaskWithContext[]; onOpen: (task: TaskWithContext) => void; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => updateTask(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error('Nao foi possivel mover a tarefa', describeError(e)),
  });

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskWithContext[]>();
    for (const c of columns) map.set(c, []);
    for (const t of tasks) {
      if (t.status === 'cancelada') continue;
      map.get(t.status)?.push(t);
    }
    return map;
  }, [tasks]);

  if (tasks.length === 0) return <EmptyState title="Nenhuma tarefa cadastrada" />;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((status) => {
        const items = grouped.get(status) ?? [];
        return (
          <div
            key={status}
            className="w-[280px] shrink-0"
            onDragOver={(e) => canEdit && e.preventDefault()}
            onDrop={(e) => {
              if (!canEdit) return;
              const id = e.dataTransfer.getData('text/plain');
              if (id) move.mutate({ id, status });
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{taskStatusLabel[status]}</h3>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-muted">{items.length}</span>
            </div>
            <div className="min-h-[80px] space-y-2 rounded-lg bg-surface-2/40 p-1.5">
              {items.map((t) => {
                const overdue = t.due_date && t.status !== 'concluida'
                  && (daysBetween(new Date(), t.due_date) ?? 0) < 0;
                return (
                  <article
                    key={t.id}
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                    onClick={() => onOpen(t)}
                    className={cn(
                      'card cursor-pointer p-3 transition-shadow hover:shadow-pop',
                      canEdit && 'active:cursor-grabbing',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium">{t.title}</p>
                      {t.is_milestone && <Flag className="h-3.5 w-3.5 shrink-0 text-strategic" />}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      {t.project?.code ?? ''} · {t.code}
                    </p>
                    <div className="mt-2"><Progress value={t.progress} size="sm" /></div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                      <div className="flex items-center gap-1.5">
                        {t.due_date && (
                          <span className={cn('inline-flex items-center gap-1 text-[10px]', overdue ? 'text-danger' : 'text-muted')}>
                            {overdue ? <AlertCircle className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                            {formatDate(t.due_date)}
                          </span>
                        )}
                        <Avatar name={t.assignee?.full_name} size="xs" />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
