import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerDownRight, MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { describeError } from '@/lib/supabase/client';
import { createComment, deleteComment, listComments, updateComment } from '@/services/comments';
import { relativeFromNow } from '@/utils/format';
import type { Comment, CommentEntity } from '@/types/domain';

/**
 * Thread de comentarios reutilizavel - mesmo padrao do AttachmentsPanel:
 * plugavel tanto no nivel do projeto (entity="project") quanto dentro de um
 * registro especifico. Lista simples em ordem cronologica, com resposta
 * (`parent_id`) mostrada como citacao acima do texto - sem arvore aninhada,
 * que adicionaria complexidade sem necessidade real neste volume de uso.
 */
export function CommentThread({
  projectId, entity, entityId, canEdit, compact,
}: {
  projectId: string;
  entity: CommentEntity;
  entityId: string;
  canEdit: boolean;
  /** Layout reduzido para caber dentro de um drawer de formulario. */
  compact?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile, can } = useAuth();
  const isManager = can('portfolio.manage');

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [removing, setRemoving] = useState<Comment | null>(null);

  const queryKey = ['comments', projectId, entity, entityId];
  const comments = useQuery({ queryKey, queryFn: () => listComments(projectId, entity, entityId) });
  const byId = useMemo(() => new Map((comments.data ?? []).map((c) => [c.id, c])), [comments.data]);

  const create = useMutation({
    mutationFn: () => createComment({ projectId, entity, entityId, body: draft, parentId: replyTo?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDraft('');
      setReplyTo(null);
    },
    onError: (e) => toast.error('Nao foi possivel enviar o comentario', describeError(e)),
  });

  const update = useMutation({
    mutationFn: () => updateComment(editing!.id, editDraft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditing(null);
    },
    onError: (e) => toast.error('Nao foi possivel salvar a edicao', describeError(e)),
  });

  const remove = useMutation({
    mutationFn: (c: Comment) => deleteComment(c.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setRemoving(null);
      toast.success('Comentario excluido');
    },
    onError: (e) => toast.error('Nao foi possivel excluir', describeError(e)),
  });

  const list = comments.data ?? [];

  function canModify(c: Comment): boolean {
    return canEdit && (c.created_by === profile?.id || isManager);
  }

  return (
    <section className={compact ? '' : 'card p-4'}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" /> Comentarios {list.length > 0 && `(${list.length})`}
      </h2>

      {comments.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nenhum comentario"
          description={canEdit ? 'Registre uma observacao sobre este item.' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {list.map((c) => {
            const parent = c.parent_id ? byId.get(c.parent_id) : null;
            return (
              <li key={c.id} className="rounded-lg border border-border p-3">
                {parent && (
                  <p className="mb-1.5 truncate border-l-2 border-border pl-2 text-xs text-muted">
                    <CornerDownRight className="mr-1 inline h-3 w-3" />
                    {parent.author?.full_name ?? 'Alguem'}: {parent.body}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{c.author?.full_name ?? 'Usuario removido'}</p>
                  <p className="text-xs text-muted">
                    {relativeFromNow(c.created_at)}{c.edited_at && ' · editado'}
                  </p>
                </div>

                {editing?.id === c.id ? (
                  <div className="mt-1.5 space-y-2">
                    <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => update.mutate()} loading={update.isPending}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                )}

                {editing?.id !== c.id && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => setReplyTo(c)}>Responder</Button>
                    )}
                    {canModify(c) && (
                      <>
                        <Button
                          variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => { setEditing(c); setEditDraft(c.body); }}
                          aria-label="Editar comentario"
                        />
                        <Button
                          variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setRemoving(c)}
                          aria-label="Excluir comentario"
                        />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 space-y-2">
          {replyTo && (
            <p className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
              <span className="truncate">Respondendo a {replyTo.author?.full_name ?? 'alguem'}: {replyTo.body}</span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          <Textarea
            value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva um comentario..." rows={compact ? 2 : 3}
          />
          <Button size="sm" onClick={() => create.mutate()} loading={create.isPending} disabled={!draft.trim()}>
            Comentar
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        title="Excluir comentario"
        confirmLabel="Excluir"
        description="Este comentario sera removido permanentemente."
      />
    </section>
  );
}
