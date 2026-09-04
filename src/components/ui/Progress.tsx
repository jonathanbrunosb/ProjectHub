import { cn } from '@/utils/cn';
import { formatPercent } from '@/utils/format';

/**
 * Barra de progresso com marcador do avanco planejado - a leitura executiva
 * exige ver realizado e planejado no mesmo elemento.
 */
export function Progress({
  value, planned, className, showLabel = true, size = 'md',
}: { value: number; planned?: number | null; className?: string; showLabel?: boolean; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  const p = planned == null ? null : Math.max(0, Math.min(100, Number(planned)));
  const behind = p != null && v < p - 2;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'h-1.5' : 'h-2')}>
        <div
          className={cn('h-full rounded-full transition-all', behind ? 'bg-warn' : 'bg-brand')}
          style={{ width: `${v}%` }}
        />
        {p != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-fg/40"
            style={{ left: `${p}%` }}
            title={`Planejado: ${formatPercent(p)}`}
          />
        )}
      </div>
      {showLabel && (
        <span className={cn('tabular-nums text-xs font-medium', behind ? 'text-warn' : 'text-muted')}>
          {formatPercent(v, 0)}
        </span>
      )}
    </div>
  );
}
