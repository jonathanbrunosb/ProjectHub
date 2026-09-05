import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import {
  deleteAttachment, getAttachmentDownloadUrl, listAttachments, uploadAttachment,
} from '@/services/attachments';
import { formatBytes, formatDateTime } from '@/utils/format';
import type { Attachment, AttachmentEntity } from '@/types/domain';

/**
 * Painel de anexos reutilizavel - plugavel tanto no nivel do projeto
 * (entity="project", sem entityId) quanto dentro de um registro especifico
 * (entity="task"/"risk"/"action_plan"/..., com entityId). Mesmo componente,
 * mesma politica de acesso (RLS de `attachments` deriva tudo de `project_id`).
 */
export function AttachmentsPanel({
  projectId, entity, entityId, canEdit, compact,
}: {
  projectId: string;
  entity: AttachmentEntity;
  entityId?: string | null;
  canEdit: boolean;
  /** Layout reduzido para caber dentro de um drawer de formulario. */
  compact?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const queryKey = ['attachments', projectId, entity, entityId ?? null];
  const attachments = useQuery({ queryKey, queryFn: () => listAttachments(projectId, entity, entityId ?? undefined) });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment({ projectId, entity, entityId, file }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Arquivo enviado');
    },
    onError: (e) => toast.error('Nao foi possivel enviar o arquivo', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: (a: Attachment) => deleteAttachment(a.id, a.storage_path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setRemoving(null);
      toast.success('Anexo excluido');
    },
    onError: (e) => toast.error('Nao foi possivel excluir', describeError(e)),
  });

  async function handleDownload(a: Attachment) {
    setDownloadingId(a.id);
    try {
      const url = await getAttachmentDownloadUrl(a.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error('Nao foi possivel gerar o link de download', describeError(e));
    } finally {
      setDownloadingId(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) upload.mutate(file);
  }

  const list = attachments.data ?? [];

  return (
    <section className={compact ? '' : 'card p-4'}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" /> Anexos {list.length > 0 && `(${list.length})`}
        </h2>
        {canEdit && (
          <>
            <input
              ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.docx,.pptx"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary" size="sm" icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => fileInputRef.current?.click()}
              loading={upload.isPending}
            >
              Enviar arquivo
            </Button>
          </>
        )}
      </div>

      {attachments.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nenhum anexo"
          description={canEdit ? 'Envie documentos, planilhas ou evidencias relacionadas.' : undefined}
        />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.file_name}</p>
                <p className="text-xs text-muted">{formatBytes(a.size_bytes)} · {formatDateTime(a.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}
                  loading={downloadingId === a.id}
                  onClick={() => handleDownload(a)}
                >
                  Baixar
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setRemoving(a)}
                    aria-label="Excluir anexo"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        title="Excluir anexo"
        confirmLabel="Excluir"
        description={<>O arquivo <b>{removing?.file_name}</b> sera removido permanentemente.</>}
      />
    </section>
  );
}
