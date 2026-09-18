import { supabase } from '@/lib/supabase/client';
import type { Comment, CommentEntity } from '@/types/domain';

const COMMENT_COLUMNS =
  'id,project_id,entity,entity_id,body,parent_id,edited_at,created_at,created_by,' +
  'author:profiles!comments_created_by_fkey(full_name)';

export const MAX_COMMENT_LENGTH = 8000; // mesmo limite da constraint comments_body_ck.

/** Lista os comentarios de um registro especifico (`entity`+`entityId`), do mais antigo ao mais novo. */
export async function listComments(
  projectId: string, entity: CommentEntity, entityId: string,
): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectId)
    .eq('entity', entity)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Comment[];
}

export async function createComment(input: {
  projectId: string; entity: CommentEntity; entityId: string; body: string; parentId?: string | null;
}): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error('O comentario nao pode ficar vazio.');
  if (body.length > MAX_COMMENT_LENGTH) throw new Error('Comentario acima do limite de 8000 caracteres.');

  const { error } = await supabase.from('comments').insert({
    project_id: input.projectId,
    entity: input.entity,
    entity_id: input.entityId,
    body,
    parent_id: input.parentId ?? null,
  });
  if (error) throw error;
}

/** Edicao restrita ao autor (ou Admin/PMO) pela RLS - `edited_at` marca a edicao na tela. */
export async function updateComment(id: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('O comentario nao pode ficar vazio.');
  if (trimmed.length > MAX_COMMENT_LENGTH) throw new Error('Comentario acima do limite de 8000 caracteres.');

  const { error } = await supabase
    .from('comments')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
