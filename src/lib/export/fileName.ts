import type { Environment } from '@/lib/supabase/client';

/** Remove acentos e caracteres que sistemas de arquivos rejeitam. */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * `[nome_relatorio]_[ambiente]_[data].[ext]` - o ambiente no nome impede que
 * um arquivo de QA circule como se fosse numero oficial de Producao.
 */
export function buildExportFileName(
  base: string, environment: Environment, extension: 'xlsx' | 'pdf', date = new Date(),
): string {
  return `${sanitizeFileName(base)}_${environment}_${date.toISOString().slice(0, 10)}.${extension}`;
}
