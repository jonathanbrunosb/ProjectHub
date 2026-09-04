import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

const palette = [
  'bg-brand/15 text-brand', 'bg-ok/15 text-ok', 'bg-warn/15 text-warn',
  'bg-info/15 text-info', 'bg-strategic/15 text-strategic', 'bg-danger/15 text-danger',
];

function hashIndex(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return h % palette.length;
}

export function Avatar({
  name, size = 'md', className,
}: { name: string | null | undefined; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const label = name ?? 'Nao atribuido';
  const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs' };
  return (
    <span
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        name ? palette[hashIndex(label)] : 'bg-surface-2 text-muted',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarWithName({ name, subtitle }: { name: string | null | undefined; subtitle?: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm text-fg">{name ?? '—'}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
    </span>
  );
}
