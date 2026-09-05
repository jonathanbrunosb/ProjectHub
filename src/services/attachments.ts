import { supabase } from '@/lib/supabase/client';
import type { Attachment, AttachmentEntity } from '@/types/domain';

const ATTACHMENT_COLUMNS =
  'id,project_id,entity,entity_id,file_name,storage_path,mime_type,size_bytes,created_at,created_by';

export const MAX_ATTACHMENT_SIZE = 52_428_800; // 50 MB - mesmo limite do bucket.

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/** Lista anexos de um projeto ou de um registro especifico (`entity`+`entityId`). */
export async function listAttachments(
  projectId: string, entity?: AttachmentEntity, entityId?: string,
): Promise<Attachment[]> {
  let query = supabase.from('attachments').select(ATTACHMENT_COLUMNS).eq('project_id', projectId);
  if (entity) query = query.eq('entity', entity);
  if (entityId) query = query.eq('entity_id', entityId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Attachment[];
}

/**
 * A CHAVE do objeto no Storage so' aceita ASCII sem espaco (o Supabase rejeita
 * com "Invalid key" nomes com acento ou espaco, ex.: "Ana Lídia Pereira.pdf") -
 * mas o nome original precisa continuar aparecendo na tela. Por isso o nome
 * exibido (`file_name`) nunca e' tocado; so' o segmento de caminho e' sanitizado.
 */
export function sanitizeForStorageKey(fileName: string): string {
  const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const safe = normalized.replace(/[^a-zA-Z0-9.\-_]+/g, '_');
  return safe || 'arquivo';
}

/**
 * Envia o arquivo para o Storage e so' depois cria a linha em `attachments` -
 * se o insert falhar (RLS, rede), o objeto orfao no bucket e' removido para
 * nao acumular lixo sem registro correspondente.
 *
 * Caminho `<project_id>/<entity>/<uuid>-<nome-sanitizado>`: as politicas de
 * storage.objects derivam a autorizacao do primeiro segmento (project_id); o
 * uuid evita colisao de nome sem depender do usuario renomear o arquivo.
 */
export async function uploadAttachment(input: {
  projectId: string; entity: AttachmentEntity; entityId?: string | null; file: File;
}): Promise<void> {
  const { projectId, entity, entityId, file } = input;
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Arquivo maior que o limite de 50 MB.');
  }
  if (file.type && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
    throw new Error('Tipo de arquivo nao permitido. Use PDF, Office, imagem, CSV ou TXT.');
  }

  const storagePath = `${projectId}/${entity}/${crypto.randomUUID()}-${sanitizeForStorageKey(file.name)}`;
  const { error: uploadError } = await supabase.storage.from('project-files').upload(storagePath, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('attachments').insert({
    project_id: projectId,
    entity,
    entity_id: entityId ?? null,
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
  if (insertError) {
    await supabase.storage.from('project-files').remove([storagePath]);
    throw insertError;
  }
}

/** URL assinada de curta duracao - o bucket e' privado, nunca ha link publico persistente. */
export async function getAttachmentDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(id: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) throw error;
  await supabase.storage.from('project-files').remove([storagePath]);
}
