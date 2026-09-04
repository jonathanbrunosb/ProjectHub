import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * A aplicacao usa exclusivamente a chave anon (publica). A service_role NUNCA
 * entra no bundle: operacoes privilegiadas ficam em Edge Functions.
 * Toda a autorizacao efetiva e' feita por RLS no PostgreSQL.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

function createStub(): SupabaseClient {
  const message =
    'Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(message);
    },
  };
  return new Proxy({}, handler) as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'pmo.auth',
      },
      global: { headers: { 'x-application-name': 'pmo-contabil' } },
    })
  : createStub();

/** Erro do PostgREST normalizado para mensagem legivel ao usuario. */
export function describeError(error: unknown): string {
  if (!error) return 'Erro desconhecido.';
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  if (e.code === '42501' || e.message?.includes('row-level security')) {
    return 'Voce nao tem permissao para esta operacao.';
  }
  if (e.code === '23505') return 'Ja existe um registro com esse identificador.';
  if (e.code === '23503') return 'Registro referenciado nao existe ou esta em uso.';
  if (e.code === '23514') return e.message ?? 'Valor invalido para a regra de negocio.';
  return e.message ?? String(error);
}
