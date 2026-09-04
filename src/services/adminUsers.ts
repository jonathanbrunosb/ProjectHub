import { supabase } from '@/lib/supabase/client';
import type { RoleKey } from '@/types/domain';

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: RoleKey;
  job_title?: string | null;
  company_id?: string | null;
  business_unit_id?: string | null;
  primary_team_id?: string | null;
}

/**
 * Cadastra um usuario e envia convite por e-mail via Edge Function
 * (admin-invite-user). Nunca usa service_role no navegador: a funcao valida
 * que quem chama e' Admin e faz a operacao privilegiada no servidor.
 */
export async function inviteUser(input: InviteUserInput): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke('admin-invite-user', {
    body: input,
  });
  if (error) {
    // FunctionsHttpError carrega a resposta JSON de erro da propria funcao.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json();
        if (body?.error) throw new Error(body.error);
      } catch {
        // corpo nao era JSON - segue com a mensagem generica
      }
    }
    throw error;
  }
  return data as { id: string };
}
