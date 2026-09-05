import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { logAppEvent } from '@/lib/supabase/audit';
import { downloadWorkbook } from '@/lib/export/xlsx';
import { downloadPdf } from '@/lib/export/pdf';
import { buildExportFileName } from '@/lib/export/fileName';
import { buildReportSheets } from './reportWorkbook';
import { reports } from './reportDefinitions';

export type ExportFormat = 'xlsx' | 'pdf';

/**
 * Exportacao dos relatorios em Excel ou PDF, compartilhada entre a lista e a
 * pagina de detalhe - as duas telas geram exatamente o mesmo arquivo.
 *
 * Os dois formatos partem das mesmas secoes (`buildReportSheets`), entao PDF e
 * Excel nunca divergem de conteudo. Excel serve a analise (valores calculaveis)
 * e PDF a apresentacao (texto formatado, paginado, com marca corporativa).
 *
 * A permissao e' a mesma da visualizacao (`reports.export`), e a autorizacao
 * de verdade continua na RLS: o botao apenas evita oferecer o que o banco
 * recusaria.
 */
export function useReportExport() {
  const toast = useToast();
  const { profile, can } = useAuth();
  const { environment } = useEnvironment();
  // Guarda formato junto da chave: dois botoes por relatorio, e apenas o
  // clicado entra em carregamento.
  const [exporting, setExporting] = useState<{ key: string; format: ExportFormat } | null>(null);

  const exportReport = useCallback(async (reportKey: string, format: ExportFormat = 'xlsx') => {
    const definition = reports.find((r) => r.key === reportKey);
    if (!definition || !can('reports.export')) return;

    const label = format === 'pdf' ? 'PDF' : 'Excel';
    setExporting({ key: reportKey, format });
    try {
      const sheets = await buildReportSheets(reportKey);
      const total = sheets.reduce((sum, s) => sum + s.rows.length, 0);
      if (total === 0) {
        toast.warning('Nada a exportar', 'O relatorio nao possui linhas no escopo atual.');
        return;
      }

      const document = {
        fileName: buildExportFileName(definition.title, environment, format),
        sheets,
        meta: { environment, title: definition.title, userEmail: profile?.email },
      };
      if (format === 'pdf') await downloadPdf(document);
      else await downloadWorkbook(document);

      await logAppEvent('export', 'report', {
        data: { report: reportKey, format: format.toUpperCase(), rows: total, environment },
      });
      toast.success('Relatorio exportado', 'A exportacao foi registrada na trilha de auditoria.');
    } catch (err) {
      toast.error(
        `Nao foi possivel gerar o arquivo ${label}`,
        err instanceof Error ? err.message : 'Tente novamente.',
      );
    } finally {
      setExporting(null);
    }
  }, [can, environment, profile?.email, toast]);

  return {
    exportReport,
    isExporting: (key: string, format: ExportFormat) =>
      exporting?.key === key && exporting.format === format,
    isBusy: (key: string) => exporting?.key === key,
    canExport: can('reports.export'),
  };
}
