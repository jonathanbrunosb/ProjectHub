import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { listActiveProfiles } from '@/services/projects';
import { createTasks, type TaskWithContext } from '@/services/tasks';
import { describeError } from '@/lib/supabase/client';
import {
  downloadTaskImportTemplate, parseTaskImportFile, type TaskImportResult,
} from './taskImport';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existingTasks: TaskWithContext[];
}

export function TaskImportModal({ open, onClose, projectId, existingTasks }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<TaskImportResult | null>(null);
  const [fileError, setFileError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const profiles = useQuery({ queryKey: ['profiles', 'active'], queryFn: listActiveProfiles, enabled: open });

  useEffect(() => {
    if (!open) {
      setFileName('');
      setResult(null);
      setFileError('');
      setParsing(false);
      setDownloading(false);
    }
  }, [open]);

  const importTasks = useMutation({
    mutationFn: () => createTasks(result?.tasks ?? []),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      toast.success('Importação concluída', `${count} tarefa(s) criada(s).`);
      onClose();
    },
    onError: (error) => toast.error('Não foi possível importar', describeError(error)),
  });

  const handleFile = async (file: File | undefined) => {
    setFileName(file?.name ?? '');
    setResult(null);
    setFileError('');
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseTaskImportFile(file, {
        projectId,
        existingTasks,
        profiles: profiles.data ?? [],
      });
      setResult(parsed);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.');
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadTaskImportTemplate();
    } catch (error) {
      toast.error('Não foi possível gerar o modelo', describeError(error));
    } finally {
      setDownloading(false);
    }
  };

  const issues = result?.issues ?? [];
  const canImport = Boolean(result?.tasks.length) && issues.length === 0 && !parsing && !profiles.isError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar tarefas por Excel"
      description="Baixe o modelo, preencha uma tarefa por linha e envie o arquivo .xlsx."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button
            onClick={() => importTasks.mutate()}
            loading={importTasks.isPending}
            disabled={!canImport}
            icon={<Upload className="h-4 w-4" />}
          >
            Importar{result?.tasks.length ? ` ${result.tasks.length} tarefa(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">1. Baixe e preencha o modelo</h3>
              <p className="mt-1 text-xs text-muted">Não altere os cabeçalhos. O título é obrigatório e o código pode ficar vazio.</p>
            </div>
            <Button variant="secondary" onClick={() => void downloadTemplate()} loading={downloading} icon={<Download className="h-4 w-4" />}>
              Baixar modelo
            </Button>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold">2. Selecione o arquivo preenchido</h3>
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center hover:bg-subtle">
            <FileSpreadsheet className="h-8 w-8 text-brand" />
            <span className="mt-2 text-sm font-medium">{fileName || 'Selecionar arquivo .xlsx'}</span>
            <span className="mt-1 text-xs text-muted">Até 500 tarefas e 5 MB por importação</span>
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Arquivo Excel de tarefas"
              disabled={profiles.isLoading || parsing || importTasks.isPending}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </section>

        {parsing && <p className="text-sm text-muted">Validando o arquivo...</p>}
        {fileError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{fileError}</div>}
        {profiles.isError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            Não foi possível carregar os responsáveis ativos. Feche e tente novamente.
          </div>
        )}

        {result && issues.length === 0 && (
          <div role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
            Arquivo válido. {result.tasks.length} tarefa(s) pronta(s) para importação.
          </div>
        )}

        {issues.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3">
            <p className="text-sm font-medium text-danger">Corrija o arquivo antes de importar:</p>
            <ul className="mt-2 space-y-1 text-xs text-danger">
              {issues.slice(0, 10).map((issue, index) => (
                <li key={`${issue.row}-${index}`}>
                  {issue.row > 0 ? `Linha ${issue.row}: ` : ''}{issue.message}
                </li>
              ))}
            </ul>
            {issues.length > 10 && <p className="mt-2 text-xs text-danger">E mais {issues.length - 10} erro(s).</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
