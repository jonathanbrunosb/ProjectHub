import { Link } from 'react-router-dom';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { reports } from './reportDefinitions';

export function ReportsPage() {
  useBreadcrumbs([{ label: 'Governanca' }, { label: 'Relatorios' }]);

  return (
    <>
      <PageHeader
        title="Relatorios"
        description="Relatorios prontos para reuniao. Os dados respeitam o seu escopo de acesso; a exportacao fica registrada na trilha de auditoria."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.key}
            to={`/relatorios/${r.key}`}
            className="card group p-4 transition-shadow hover:shadow-pop focus-ring"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <r.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold group-hover:text-brand">{r.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">{r.description}</p>
                <Badge tone="neutral" className="mt-2">{r.audience}</Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
