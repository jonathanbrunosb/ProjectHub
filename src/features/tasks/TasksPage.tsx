import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/Feedback';
import { listTasks } from '@/services/tasks';
import { useAuth } from '@/app/AuthProvider';
import { daysBetween } from '@/utils/format';
import { TaskList } from './TaskList';

export function TasksPage() {
  useBreadcrumbs([{ label: 'Tarefas & Entregas' }]);
  const { can } = useAuth();
  const [params] = useSearchParams();
  const onlyOverdue = params.get('vencidas') === '1';

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => listTasks(),
  });

  const tasks = useMemo(
    () => (onlyOverdue
      ? data.filter((t) => t.due_date && !['concluida', 'cancelada'].includes(t.status)
        && (daysBetween(new Date(), t.due_date) ?? 0) < 0)
      : data),
    [data, onlyOverdue],
  );

  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Tarefas & Entregas"
        description={
          onlyOverdue
            ? `${tasks.length} tarefa(s) vencida(s) no escopo autorizado.`
            : 'Visao corporativa das tarefas de todos os projetos que voce acessa.'
        }
      />
      <TaskList
        tasks={tasks}
        loading={isLoading}
        canEdit={can('project.write')}
        showProjectColumn
        module="tasks-corporate"
      />
    </>
  );
}
