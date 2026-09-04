import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Popover({
  trigger, children, align = 'end', className, contentClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-1.5 min-w-[220px] rounded-lg border border-border bg-surface p-1.5 shadow-pop animate-fade-in',
            align === 'end' ? 'right-0' : 'left-0',
            contentClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function PopoverItem({
  children, onClick, danger, disabled,
}: { children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
