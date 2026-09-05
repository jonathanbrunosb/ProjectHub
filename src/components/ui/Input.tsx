import { forwardRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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

/**
 * Campo de senha com alternancia visualizar/ocultar. A troca e' puramente
 * visual (type="password" <-> type="text" no input local): o valor digitado
 * nunca e' alterado, registrado em console ou persistido - apenas o atributo
 * `type` do <input> muda, sem tocar em nenhum comportamento do Supabase Auth.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function PasswordInput({ className, invalid, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(base, 'pr-10', invalid && 'border-danger', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Visualizar senha'}
          title={visible ? 'Ocultar senha' : 'Visualizar senha'}
          tabIndex={0}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-fg focus-ring rounded-r-lg"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    );
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
