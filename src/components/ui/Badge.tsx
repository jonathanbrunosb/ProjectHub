import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'strategic' | 'brand';

const tones: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok ring-ok/25',
  warn: 'bg-warn/10 text-warn ring-warn/25',
  danger: 'bg-danger/10 text-danger ring-danger/25',
  info: 'bg-info/10 text-info ring-info/25',
  neutral: 'bg-neutral2/10 text-neutral2 ring-neutral2/25',
  strategic: 'bg-strategic/10 text-strategic ring-strategic/25',
  brand: 'bg-brand/10 text-brand ring-brand/25',
};

export function Badge({
  tone = 'neutral', children, className, dot = false,
}: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
