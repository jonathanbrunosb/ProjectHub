import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/AuthProvider';
import { getSystemSettings } from '@/services/systemSettings';
import { resolveFinancialEnabled } from '@/lib/financialModule';
import type { FinancialModuleMode } from '@/types/domain';

/**
 * Hook central do modulo financeiro. Qualquer tela que precise saber se deve
 * mostrar/usar recursos financeiros passa por aqui - nunca reimplementar a
 * cascata global -> projeto em outro lugar.
 *
 * `mode` e' opcional: sem projeto (ex.: tela de config global), so' o global
 * e' relevante e `effectiveEnabled` reflete apenas ele.
 */
export function useFinancialModule(mode?: FinancialModuleMode | null) {
  const { can } = useAuth();
  const settings = useQuery({ queryKey: ['system-settings'], queryFn: getSystemSettings });

  const globalEnabled = settings.data?.financial_module_enabled ?? true;
  const effectiveEnabled = resolveFinancialEnabled(mode, globalEnabled);

  return {
    globalEnabled,
    mode: mode ?? 'inherit',
    effectiveEnabled,
    canManage: can('financial_module.manage'),
    isLoading: settings.isLoading,
  };
}
