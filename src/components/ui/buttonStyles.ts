import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand/90 disabled:bg-brand/50',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-border/60',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger/90',
  outline: 'border border-border text-fg hover:bg-surface-2',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
};

/**
 * Classes do botao em modulo proprio para que um <Link> possa ter a aparencia
 * de botao sem deixar de ser um link (ctrl+clique, abrir em nova aba, leitor
 * de tela). Aninhar <button> dentro de <a> seria HTML invalido.
 */
export function buttonClasses({ variant = 'primary', size = 'md', className }: {
  variant?: ButtonVariant; size?: ButtonSize; className?: string;
} = {}): string {
  return cn(
    'inline-flex items-center rounded-lg font-medium transition-colors focus-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    className,
  );
}
