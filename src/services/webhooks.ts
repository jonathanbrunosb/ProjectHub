import { supabase } from '@/lib/supabase/client';
import { logAppEvent } from '@/lib/supabase/audit';
import type { WebhookConfig } from '@/types/domain';

export async function getWebhookConfig(): Promise<WebhookConfig> {
  const { data, error } = await supabase
    .from('webhook_config')
    .select('url, secret, enabled')
    .eq('id', true)
    .single();
  if (error) throw error;
  return data as unknown as WebhookConfig;
}

/**
 * Alteracao registrada explicitamente na auditoria (alem do gatilho generico):
 * e' uma decisao de configuracao de integracao, mesmo padrao de config_change
 * usado em system_settings. O segredo nunca vai para a trilha.
 */
export async function saveWebhookConfig(config: { url: string; secret: string; enabled: boolean }): Promise<void> {
  const { error } = await supabase
    .from('webhook_config')
    .update({ url: config.url || null, secret: config.secret || null, enabled: config.enabled })
    .eq('id', true);
  if (error) throw error;
  await logAppEvent('config_change', 'webhook_config', { data: { enabled: config.enabled, url: config.url || null } });
}

export async function testWebhookDelivery(): Promise<void> {
  const { error } = await supabase.rpc('test_webhook_delivery');
  if (error) throw error;
}
