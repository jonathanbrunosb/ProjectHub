import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BellRing, CheckCheck, Zap } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import {
  listNotifications, markAllNotificationsRead, markNotificationRead, runAlertEngine,
} from '@/services/governance';
import { relativeFromNow } from '@/utils/format';
import { priorityTone } from '@/utils/domain-labels';
import { cn } from '@/utils/cn';

export function NotificationsPage() {
  useBreadcrumbs([{ label: 'Central de Notificacoes' }]);
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({ queryKey: ['notifications'], queryFn: listNotifications });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });

  const runEngine = useMutation({
    mutationFn: runAlertEngine,
    onSuccess: () => {
      invalidate();
      toast.success('Motor de alertas executado', 'Novas notificacoes foram geradas conforme as regras ativas.');
    },
    onError: (e) => toast.error('Nao foi possivel executar o motor', describeError(e)),
  });

  const unread = data.filter((n) => !n.read_at);

  return (
    <>
      <PageHeader
        title="Central de Notificacoes"
        description="Alertas gerados pelas regras de automacao: prazos, riscos, capacidade e desvios financeiros."
        actions={
          <>
            {can('portfolio.manage') && (
              <Button variant="secondary" onClick={() => runEngine.mutate()} loading={runEngine.isPending} icon={<Zap className="h-4 w-4" />}>
                Executar motor de alertas
              </Button>
            )}
            {unread.length > 0 && (
              <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending} icon={<CheckCheck className="h-4 w-4" />}>
                Marcar todas como lidas
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="Nenhuma notificacao"
          description="Voce sera avisado sobre tarefas vencidas, riscos criticos sem plano, acoes atrasadas e desvios de orcamento."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((n) => (
            <li
              key={n.id}
              className={cn('card flex items-start gap-3 p-3.5', !n.read_at && 'border-l-2 border-l-brand')}
            >
              <Badge tone={priorityTone[n.severity]}>{n.severity}</Badge>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', !n.read_at && 'font-medium')}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{relativeFromNow(n.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n.link && (
                  <Link to={n.link} className="text-xs text-brand hover:underline" onClick={() => markRead.mutate(n.id)}>
                    Abrir
                  </Link>
                )}
                {!n.read_at && (
                  <button onClick={() => markRead.mutate(n.id)} className="text-xs text-muted hover:text-fg">
                    Marcar lida
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
