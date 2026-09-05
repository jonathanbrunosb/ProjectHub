import type { Environment } from '@/lib/supabase/client';

/**
 * Tipos compartilhados pelos formatos de exportacao.
 *
 * A mesma definicao de secao alimenta o Excel e o PDF: quem monta um
 * relatorio declara os dados e os tipos uma unica vez, e os dois arquivos
 * saem com o mesmo conteudo. Sem isso, Excel e PDF divergiriam com o tempo.
 *
 * O tipo da celula significa coisas diferentes em cada formato, de proposito:
 * no Excel vira valor nativo + formato de numero (para calcular na planilha);
 * no PDF vira texto ja formatado em pt-BR (para ler).
 */
export type CellType =
  | 'text' | 'integer' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean';

export interface SheetColumn {
  key: string;
  header: string;
  type?: CellType;
  width?: number;
}

export interface SheetSpec {
  name: string;
  columns?: SheetColumn[];
  rows: Record<string, unknown>[];
}

export interface ExportMeta {
  environment: Environment;
  title: string;
  userEmail?: string | null;
  /** Filtros ativos na tela, registrados dentro do arquivo. */
  filters?: Record<string, unknown>;
}

export interface ExportDocument {
  fileName: string;
  sheets: SheetSpec[];
  meta: ExportMeta;
}

export const environmentFullLabel: Record<Environment, string> = {
  QA: 'QA - Ambiente de Testes',
  PRD: 'PRD - Producao',
};
