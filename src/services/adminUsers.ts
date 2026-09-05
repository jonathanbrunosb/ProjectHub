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

export interface ResetPasswordResult {
  email: string;
  /** Senha temporaria gerada no servidor. Exibida uma unica vez ao Admin. */
  temporary_password: string;
}

/**
 * FunctionsHttpError carrega a resposta JSON da propria funcao no `context`.
 * A extracao precisa acontecer fora do try/catch de quem chama, senao o throw
 * e' engolido pelo catch - por isso vira um helper e nao fica duplicada.
 */
async function invokeAdminFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let detail: string | null = null;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json();
        if (typeof responseBody?.error === 'string') detail = responseBody.error;
      } catch {
        // corpo nao era JSON - mantem a mensagem original
      }
    }
    throw new Error(detail ?? (error as Error).message);
  }

  return data as T;
}

/**
 * Cadastra um usuario via Edge Function (admin-create-user). Nunca usa
 * service_role no navegador: a funcao valida que quem chama e' Admin e faz a
 * operacao privilegiada no servidor.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  return invokeAdminFunction<CreateUserResult>('admin-create-user', input);
}

/**
 * Gera uma nova senha temporaria para um usuario existente (admin-reset-password).
 * Caminho interino enquanto o SMTP proprio nao esta configurado: a recuperacao
 * por e-mail (resetPasswordForEmail) depende do mailer nativo do Supabase, que
 * e' limitado e nao-deterministico - o mesmo motivo que levou o cadastro a usar
 * senha temporaria em vez de convite por e-mail.
 */
export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  return invokeAdminFunction<ResetPasswordResult>('admin-reset-password', { user_id: userId });
}
