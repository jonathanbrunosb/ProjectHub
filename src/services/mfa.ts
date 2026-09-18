import { supabase } from '@/lib/supabase/client';

export interface MfaFactor {
  id: string;
  friendly_name?: string;
  status: 'verified' | 'unverified';
  created_at: string;
}

/** So os fatores TOTP ja verificados - o que importa para decidir se o usuario tem MFA ativo. */
export async function listVerifiedTotpFactors(): Promise<MfaFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []) as unknown as MfaFactor[];
}

export interface TotpEnrollment {
  factorId: string;
  /** Ja vem como data URI (`data:image/svg+xml;utf-8,...`), pronto para <img src>. */
  qrCode: string;
  /** Mostrar em campo estilo senha - alternativa a escanear o QR code. */
  secret: string;
}

/** Cria um fator TOTP nao verificado. So vira utilizavel apos `verifyTotpEnrollment`. */
export async function enrollTotpFactor(): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirma o cadastro com o codigo de 6 digitos e ja eleva a sessao para AAL2. */
export async function verifyTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

/** Remove um fator - verificado (desativa MFA) ou nao verificado (cancela um cadastro abandonado). */
export async function unenrollMfaFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** Desafio de segundo fator no login - mesma chamada usada na confirmacao do cadastro. */
export async function verifyMfaChallenge(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

export interface AssuranceLevel {
  currentLevel: string | null;
  nextLevel: string | null;
}

/**
 * `currentLevel === 'aal1' && nextLevel === 'aal2'` = a sessao autenticou so
 * com senha, mas ha' um fator verificado esperando o desafio - e' o sinal que
 * decide se a tela de segundo fator deve bloquear o acesso.
 */
export async function getAssuranceLevel(): Promise<AssuranceLevel> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
}
