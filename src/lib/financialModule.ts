import type { FinancialModuleMode } from '@/types/domain';

/**
 * Regra central de decisao do modulo financeiro. Nunca espalhar esta logica
 * em `if` soltos pelos componentes - toda tela consulta esta funcao (via
 * `useFinancialModule` ou direto, para listas) para saber se deve mostrar,
 * somar ou exportar dado financeiro.
 *
 * 'enabled'/'disabled' no projeto sempre vencem; 'inherit' usa o padrao global.
 */
export function resolveFinancialEnabled(
  mode: FinancialModuleMode | null | undefined,
  globalEnabled: boolean,
): boolean {
  if (mode === 'enabled') return true;
  if (mode === 'disabled') return false;
  return globalEnabled;
}
