import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Wallet } from 'lucide-react';
import type { ProjectOverview } from '@/types/domain';
import { cn } from '@/utils/cn';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { HealthBadge, PriorityBadge } from '@/components/ui/StatusBadges';
import { EmptyState } from '@/components/ui/Feedback';
import { formatCurrencyCompact, formatDate } from '@/utils/format';
import { projectStatusLabel } from '@/utils/domain-labels';
import type { ProjectStatus } from '@/types/domain';

const kanbanColumns: ProjectStatus[] = ['planejamento', 'em_andamento', 'em_espera', 'concluido', 'cancelado'];

export function PortfolioKanban({ projects }: { projects: ProjectOverview[] }) {
  if (projects.length === 0) return <EmptyState title="Nenhum projeto no filtro atual" />;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {kanbanColumns.map((status) => {
        const items = projects.filter((p) => p.status === status);
        return (
          <div key={status} className="w-[280px] shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {projectStatusLabel[status]}
              </h3>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((p) => <ProjectCard key={p.id} project={p} compact />)}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                  Sem projetos
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PortfolioCards({ projects }: { projects: ProjectOverview[] }) {
  if (projects.length === 0) return <EmptyState title="Nenhum projeto no filtro atual" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
    </div>
  );
}

export function ProjectCard({ project: p, compact }: { project: ProjectOverview; compact?: boolean }) {
  const overBudget = Number(p.forecast_variance_pct ?? 0) > 5;
  return (
    <Link
      to={`/projetos/${p.id}`}
      className="card block p-3.5 transition-shadow hover:shadow-pop focus-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-muted">{p.code}</p>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium text-fg">{p.name}</p>
        </div>
        <HealthBadge health={p.health} manual={p.health_is_manual} />
      </div>

      <div className="mt-3">
        <Progress value={p.progress_actual} planned={p.progress_planned} size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={p.priority} />
        {!compact && <Badge tone="neutral">{p.category}</Badge>}
        {Number(p.critical_risks) > 0 && (
          <Badge tone="danger"><AlertTriangle className="h-3 w-3" />{p.critical_risks} risco(s)</Badge>
        )}
        {Number(p.days_overdue) > 0 && <Badge tone="danger">{p.days_overdue}d atraso</Badge>}
      </div>

      <dl className={cn('mt-3 grid gap-2 text-xs', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        <div className="flex items-center gap-1.5 text-muted">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate">{p.next_milestone_date ? formatDate(p.next_milestone_date) : formatDate(p.target_date)}</span>
        </div>
        <div className={cn('flex items-center gap-1.5', overBudget ? 'text-danger' : 'text-muted')}>
          <Wallet className="h-3 w-3 shrink-0" />
          <span className="truncate tabular-nums">{formatCurrencyCompact(p.forecast)} / {formatCurrencyCompact(p.budget)}</span>
        </div>
      </dl>

      <p className="mt-2.5 truncate border-t border-border pt-2 text-xs text-muted">
        {p.owner_name ?? 'Sem owner'}{p.area_name ? ` · ${p.area_name}` : ''}
      </p>
    </Link>
  );
}
