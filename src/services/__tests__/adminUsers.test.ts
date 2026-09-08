import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const invoke = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { createUser, resetUserPassword } = await import('../adminUsers');

beforeEach(() => invoke.mockClear());

describe('resetUserPassword', () => {
  it('chama a edge function admin-reset-password com o id do usuario', async () => {
    invoke.mockResolvedValueOnce({ data: { email: 'ana@empresa.com.br', temporary_password: 'Abc12345!' }, error: null });
    const result = await resetUserPassword('user-123');
    expect(invoke).toHaveBeenCalledWith('admin-reset-password', { body: { user_id: 'user-123' } });
    expect(result).toEqual({ email: 'ana@empresa.com.br', temporary_password: 'Abc12345!' });
  });

  it('extrai a mensagem de erro do corpo da resposta da funcao', async () => {
    const context = { clone: () => ({ json: async () => ({ error: 'Usuario nao encontrado.' }) }) };
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    await expect(resetUserPassword('user-404')).rejects.toThrow('Usuario nao encontrado.');
  });

  it('cai na mensagem generica quando o corpo do erro nao e JSON', async () => {
    const context = { clone: () => ({ json: async () => { throw new Error('nao e json'); } }) };
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'falha de rede', context } });
    await expect(resetUserPassword('user-1')).rejects.toThrow('falha de rede');
  });
});

describe('createUser (compartilha o mesmo helper de invocacao)', () => {
  it('continua funcionando com a mesma assinatura de antes', async () => {
    invoke.mockResolvedValueOnce({ data: { id: 'u1', email: 'x@y.com', temporary_password: 'Abc12345!' }, error: null });
    const result = await createUser({
      email: 'x@y.com', full_name: 'X Y', role: 'collaborator',
    });
    expect(invoke).toHaveBeenCalledWith('admin-create-user', {
      body: { email: 'x@y.com', full_name: 'X Y', role: 'collaborator' },
    });
    expect(result.id).toBe('u1');
  });

  it('mantem a Edge Function alinhada ao schema atual de profiles', () => {
    const functionSource = readFileSync(
      new URL('../../../supabase/functions/admin-create-user/index.ts', import.meta.url),
      'utf8',
    );

    expect(functionSource).not.toContain('primary_team_id');
    expect(functionSource).toContain('business_unit_id: businessUnitId || null');
  });
});
