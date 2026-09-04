import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

const base =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70 ' +
  'transition-colors focus-ring disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted';

export function Field({
  label, hint, error, required, children, className,
}: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn(base, invalid && 'border-danger', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} className={cn(base, 'min-h-[90px] resize-y', invalid && 'border-danger', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(base, 'cursor-pointer pr-8', invalid && 'border-danger', className)} {...props}>
        {children}
      </select>
    );
  },
);
