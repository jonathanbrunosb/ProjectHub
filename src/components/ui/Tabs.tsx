import { cn } from '@/utils/cn';

export interface TabItem { key: string; label: string; count?: number }

export function Tabs({
  items, value, onChange, className,
}: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cn('border-b border-border', className)}>
      <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={cn(
                'relative whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-ring rounded-t',
                active
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted hover:border-border hover:text-fg',
              )}
            >
              {item.label}
              {item.count != null && item.count > 0 && (
                <span className={cn(
                  'ml-1.5 rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                  active ? 'bg-brand/10 text-brand' : 'bg-surface-2 text-muted',
                )}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
