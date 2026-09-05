import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileSpreadsheet, FileText } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { listProjectOverview } from '@/services/projects';
import { reports } from './reportDefinitions';
import { useReportExport } from './useReportExport';

export function ReportsPage() {
  useBreadcrumbs([{ label: 'Governanca' }, { label: 'Relatorios' }]);
  const { exportReport, isExporting, isBusy, canExport } = useReportExport();
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });

  // Relatorios dedicados so' fazem sentido quando existe pelo menos um projeto
  // usando o respectivo modulo - caso contrario seriam telas vazias.
  const anyFinancial = projects.data?.some((p) => p.financial_effective_enabled) ?? true;
  const anyGoalIndicator = projects.data?.some((p) => p.goal_indicator_enabled) ?? true;
  const visibleReports = useMemo(
    () => reports.filter((r) => (r.key !== 'financeiro' || anyFinancial) && (r.key !== 'indicador-metas' || anyGoalIndicator)),
    [anyFinancial, anyGoalIndicator],
  );

  return (
    <>
      <PageHeader
        title="Relatorios"
        description="Relatorios prontos para reuniao. Os dados respeitam o seu escopo de acesso; a exportacao fica registrada na trilha de auditoria."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleReports.map((r) => (
          <article key={r.key} className="card flex flex-col p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <r.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{r.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">{r.description}</p>
                <Badge tone="neutral" className="mt-2">{r.audience}</Badge>
              </div>
            </div>

            {/* Botoes fora do link: <button> dentro de <a> e' HTML invalido e
                quebra a navegacao por teclado. */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Link
                to={`/relatorios/${r.key}`}
                className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'gap-1.5' })}
              >
                <Eye className="h-3.5 w-3.5" />
                Visualizar
              </Link>
              {canExport && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void exportReport(r.key, 'pdf')}
                    loading={isExporting(r.key, 'pdf')}
                    disabled={isBusy(r.key)}
                    icon={<FileText className="h-3.5 w-3.5" />}
                  >
                    {isExporting(r.key, 'pdf') ? 'Gerando...' : 'PDF'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void exportReport(r.key, 'xlsx')}
                    loading={isExporting(r.key, 'xlsx')}
                    disabled={isBusy(r.key)}
                    icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                  >
                    {isExporting(r.key, 'xlsx') ? 'Gerando...' : 'Excel'}
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
