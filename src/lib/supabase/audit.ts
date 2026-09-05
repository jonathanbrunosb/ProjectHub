import { supabase } from './client';
import type { AuditAction } from '@/types/domain';

/**
 * Eventos com contexto de sessao (login, logout, exportacao) sao gravados via
 * RPC. Alteracoes de dados sao capturadas por gatilho no PostgreSQL - o cliente
 * nao e' fonte de verdade da trilha.
 */
export async function logAppEvent(
  action: Extract<
    AuditAction,
    'login' | 'logout' | 'export' | 'config_change' | 'environment_switch' | 'environment_switch_denied'
  >,
  entity: string,
  options: { entityId?: string; projectId?: string; data?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await supabase.rpc('log_app_event', {
      p_action: action,
      p_entity: entity,
      p_entity_id: options.entityId ?? null,
      p_project_id: options.projectId ?? null,
      p_new_data: options.data ?? null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_correlation_id: crypto.randomUUID(),
      p_origin: 'web',
    });
  } catch {
    // A trilha nao pode quebrar a experiencia do usuario.
  }
}
