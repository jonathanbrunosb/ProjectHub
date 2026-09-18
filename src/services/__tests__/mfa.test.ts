import { describe, it, expect, vi, beforeEach } from 'vitest';

const listFactors = vi.fn(async () => ({
  data: { all: [], totp: [{ id: 'factor-1', status: 'verified', created_at: '2026-09-01T00:00:00Z' }] },
  error: null as Error | null,
}));
const enroll = vi.fn(async (_params: { factorType: string }) => ({
  data: { id: 'factor-new', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET123', uri: 'otpauth://...' } },
  error: null as Error | null,
}));
const unenroll = vi.fn(async (_params: { factorId: string }) => ({ data: {}, error: null as Error | null }));
const challengeAndVerify = vi.fn(async (_params: { factorId: string; code: string }) => ({ data: {}, error: null as Error | null }));
const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
  data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
  error: null as Error | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { mfa: { listFactors, enroll, unenroll, challengeAndVerify, getAuthenticatorAssuranceLevel } } },
}));

const {
  listVerifiedTotpFactors, enrollTotpFactor, verifyTotpEnrollment, unenrollMfaFactor, verifyMfaChallenge, getAssuranceLevel,
} = await import('../mfa');

beforeEach(() => {
  listFactors.mockClear();
  enroll.mockClear();
  unenroll.mockClear();
  challengeAndVerify.mockClear();
  getAuthenticatorAssuranceLevel.mockClear();
});

describe('listVerifiedTotpFactors', () => {
  it('retorna so os fatores TOTP ja verificados', async () => {
    const factors = await listVerifiedTotpFactors();
    expect(factors).toEqual([{ id: 'factor-1', status: 'verified', created_at: '2026-09-01T00:00:00Z' }]);
  });

  it('retorna lista vazia quando nao ha fator TOTP', async () => {
    listFactors.mockResolvedValueOnce({ data: { all: [], totp: [] }, error: null });
    expect(await listVerifiedTotpFactors()).toEqual([]);
  });
});

describe('enrollTotpFactor', () => {
  it('cadastra um fator TOTP e devolve QR code + segredo', async () => {
    const result = await enrollTotpFactor();
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
    expect(result).toEqual({
      factorId: 'factor-new', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET123',
    });
  });
});

describe('verifyTotpEnrollment', () => {
  it('confirma o cadastro via challengeAndVerify', async () => {
    await verifyTotpEnrollment('factor-new', '123456');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-new', code: '123456' });
  });

  it('propaga o erro quando o codigo e invalido', async () => {
    challengeAndVerify.mockResolvedValueOnce({ data: {}, error: new Error('Invalid TOTP code') });
    await expect(verifyTotpEnrollment('factor-new', '000000')).rejects.toThrow('Invalid TOTP code');
  });
});

describe('unenrollMfaFactor', () => {
  it('remove o fator pelo id', async () => {
    await unenrollMfaFactor('factor-1');
    expect(unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });
});

describe('verifyMfaChallenge', () => {
  it('desafia e verifica o codigo no login', async () => {
    await verifyMfaChallenge('factor-1', '654321');
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '654321' });
  });
});

describe('getAssuranceLevel', () => {
  it('retorna o nivel atual e o proximo nivel de autenticacao', async () => {
    expect(await getAssuranceLevel()).toEqual({ currentLevel: 'aal1', nextLevel: 'aal2' });
  });
});
