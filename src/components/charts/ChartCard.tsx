import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';

export function ChartCard({
  title, description, action, children, loading, empty, className, height = 260,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  className?: string;
  height?: number;
}) {
  return (
    <section className={cn('card flex flex-col p-4', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="min-w-0 flex-1" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <EmptyState title="Sem dados no periodo" description="Nao ha registros suficientes para este grafico." />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
