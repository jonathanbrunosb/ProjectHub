import { useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Tooltip({
  content, children, side = 'top', className,
}: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side];

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-xs rounded-md bg-slate-900 px-2 py-1',
            'text-xs font-normal leading-snug text-slate-50 shadow-pop animate-fade-in',
            pos,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
