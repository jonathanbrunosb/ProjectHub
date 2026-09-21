import { supabase } from '@/lib/supabase/client';
import { logAppEvent } from '@/lib/supabase/audit';
import type { EmailNotificationConfig } from '@/types/domain';

export async function getEmailNotificationConfig(): Promise<EmailNotificationConfig> {
  const { data, error } = await supabase
    .from('email_notification_config')
    .select('api_key, from_email, app_base_url, enabled')
    .eq('id', true)
    .single();
  if (error) throw error;
  return data as unknown as EmailNotificationConfig;
}

/**
 * Alteracao registrada explicitamente na auditoria (mesmo padrao de
 * webhook_config): e' uma decisao de configuracao de integracao. A API key
 * nunca vai para a trilha.
 */
export async function saveEmailNotificationConfig(config: {
  apiKey: string;
  fromEmail: string;
  appBaseUrl: string;
  enabled: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('email_notification_config')
    .update({
      api_key: config.apiKey || null,
      from_email: config.fromEmail || null,
      app_base_url: config.appBaseUrl || null,
      enabled: config.enabled,
    })
    .eq('id', true);
  if (error) throw error;
  await logAppEvent('config_change', 'email_notification_config', {
    data: { enabled: config.enabled, from_email: config.fromEmail || null },
  });
}

export async function testEmailDelivery(): Promise<void> {
  const { error } = await supabase.rpc('test_email_delivery');
  if (error) throw error;
}
