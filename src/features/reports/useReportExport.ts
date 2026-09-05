import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { logAppEvent } from '@/lib/supabase/audit';
import { buildFileName, downloadWorkbook } from '@/lib/export/xlsx';
import { buildReportSheets } from './reportWorkbook';
import { reports } from './reportDefinitions';

/**
 * Exportacao Excel dos relatorios, compartilhada entre a lista e a pagina de
 * detalhe - as duas telas geram exatamente o mesmo arquivo.
 *
 * A permissao e' a mesma da visualizacao (`reports.export`), e a autorizacao
 * de verdade continua na RLS: o botao apenas evita oferecer o que o banco
 * recusaria.
 */
export function useReportExport() {
  const toast = useToast();
  const { profile, can } = useAuth();
  const { environment } = useEnvironment();
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const exportReport = useCallback(async (reportKey: string) => {
    const definition = reports.find((r) => r.key === reportKey);
    if (!definition || !can('reports.export')) return;

    setExportingKey(reportKey);
    try {
      const sheets = await buildReportSheets(reportKey);
      const total = sheets.reduce((sum, s) => sum + s.rows.length, 0);
      if (total === 0) {
        toast.warning('Nada a exportar', 'O relatorio nao possui linhas no escopo atual.');
        return;
      }

      await downloadWorkbook({
        fileName: buildFileName(definition.title, environment),
        sheets,
        meta: { environment, title: definition.title, userEmail: profile?.email },
      });

      await logAppEvent('export', 'report', {
        data: { report: reportKey, format: 'XLSX', rows: total, environment },
      });
      toast.success('Relatorio exportado', 'A exportacao foi registrada na trilha de auditoria.');
    } catch (err) {
      toast.error(
        'Nao foi possivel gerar o arquivo Excel',
        err instanceof Error ? err.message : 'Tente novamente.',
      );
    } finally {
      setExportingKey(null);
    }
  }, [can, environment, profile?.email, toast]);

  return {
    exportReport,
    exportingKey,
    isExporting: (key: string) => exportingKey === key,
    canExport: can('reports.export'),
  };
}
