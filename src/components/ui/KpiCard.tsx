import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Tooltip } from './Tooltip';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Variacao percentual: o sinal define a seta; `invertColors` para metricas onde subir e' ruim. */
  delta?: number | null;
  deltaLabel?: string;
  invertColors?: boolean;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'info' | 'strategic';
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
}

const tones = {
  default: 'text-fg',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
  strategic: 'text-strategic',
};

export function KpiCard({
  label, value, hint, delta, deltaLabel, invertColors, tone = 'default', icon, onClick, className,
}: KpiCardProps) {
  const positive = (delta ?? 0) > 0;
  const neutral = !delta;
  const good = invertColors ? !positive : positive;
  const DeltaIcon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', tones[tone])}>{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {delta != null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
              neutral ? 'text-muted' : good ? 'text-ok' : 'text-danger',
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {deltaLabel && <span className="text-xs text-muted truncate">{deltaLabel}</span>}
      </div>
    </>
  );

  const card = (
    <div
      className={cn(
        'card h-full p-4 transition-shadow',
        onClick && 'cursor-pointer hover:shadow-pop focus-ring',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
    >
      {content}
    </div>
  );

  return hint ? <Tooltip content={hint} className="block h-full">{card}</Tooltip> : card;
}
