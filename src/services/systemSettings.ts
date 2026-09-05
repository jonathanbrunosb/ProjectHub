import { supabase } from '@/lib/supabase/client';
import { logAppEvent } from '@/lib/supabase/audit';
import type { SystemSettings } from '@/types/domain';

export async function getSystemSettings(): Promise<SystemSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('financial_module_enabled')
    .eq('id', true)
    .single();
  if (error) throw error;
  return data as unknown as SystemSettings;
}

/**
 * Alteracao registrada explicitamente na auditoria (alem do que o gatilho
 * generico ja captura): e' uma decisao de configuracao, nao um dado de linha,
 * entao vale reforcar o evento semantico `config_change`.
 */
export async function setFinancialModuleEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .update({ financial_module_enabled: enabled })
    .eq('id', true);
  if (error) throw error;
  await logAppEvent('config_change', 'system_settings', { data: { financial_module_enabled: enabled } });
}
