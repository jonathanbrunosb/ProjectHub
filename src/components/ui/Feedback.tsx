import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-2', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-border/60 to-transparent animate-[shimmer_1.4s_infinite]" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-label="Carregando" role="status">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-10', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title, description, icon, action,
}: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mt-1 max-w-md text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-danger/10 p-3 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-fg">Nao foi possivel carregar os dados</p>
        <p className="mt-1 max-w-md text-xs text-muted">{message}</p>
      </div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
