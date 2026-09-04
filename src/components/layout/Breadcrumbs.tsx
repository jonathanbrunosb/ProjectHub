import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; to?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegacao" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
              {item.to && !last ? (
                <Link to={item.to} className="truncate text-muted hover:text-fg focus-ring rounded">{item.label}</Link>
              ) : (
                <span className={last ? 'truncate font-medium text-fg' : 'truncate text-muted'} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
