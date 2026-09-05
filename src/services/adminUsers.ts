import { supabase } from '@/lib/supabase/client';
import type { RoleKey } from '@/types/domain';

export interface CreateUserInput {
  email: string;
  full_name: string;
  role: RoleKey;
  job_title?: string | null;
  company_id?: string | null;
  business_unit_id?: string | null;
  primary_team_id?: string | null;
}

export interface CreateUserResult {
  id: string;
  email: string;
  /** Senha temporaria gerada no servidor. Exibida uma unica vez ao Admin. */
  temporary_password: string;
}

/**
 * Cadastra um usuario via Edge Function (admin-create-user). Nunca usa
 * service_role no navegador: a funcao valida que quem chama e' Admin e faz a
 * operacao privilegiada no servidor.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: input,
  });

  if (error) {
    // FunctionsHttpError carrega a resposta JSON da propria funcao no `context`.
    // A extracao precisa acontecer fora do try, senao o throw e' engolido pelo catch.
    let detail: string | null = null;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string') detail = body.error;
      } catch {
        // corpo nao era JSON - mantem a mensagem original
      }
    }
    throw new Error(detail ?? (error as Error).message);
  }

  return data as CreateUserResult;
}
