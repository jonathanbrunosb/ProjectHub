import { describe, it, expect, vi, beforeEach } from 'vitest';

interface InvokeError { message: string; context?: { clone: () => { json: () => Promise<unknown> } } }
interface InvokeOptions { headers: Record<string, string>; body: { peer_anon_key?: string } }
const invoke = vi.fn(async (_name: string, _options: InvokeOptions) => (
  {
    data: null as { email: string; token: string; warning?: string } | null,
    error: null as InvokeError | null,
  }
));
const verifyOtp = vi.fn(async (_params: { email: string; token_hash: string; type: string }) => (
  { data: {} as Record<string, unknown> | null, error: null as { message: string } | null }
));
const getSupabaseClient = vi.fn((_env: string) => ({
  functions: { invoke },
  auth: { verifyOtp },
}));
const environmentAnonKey = vi.fn((env: string) => `anon-key-${env}`);

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: (env: string) => getSupabaseClient(env),
  environmentAnonKey: (env: string) => environmentAnonKey(env),
}));

const { bridgeEnvironmentLogin } = await import('../envBridge');

beforeEach(() => {
  invoke.mockClear();
  verifyOtp.mockClear();
  getSupabaseClient.mockClear();
  environmentAnonKey.mockClear();
});

describe('bridgeEnvironmentLogin', () => {
  it('troca o token de origem por uma sessao real no ambiente de destino', async () => {
    invoke.mockResolvedValueOnce({ data: { email: 'ana@empresa.com.br', token: 'hash-123' }, error: null });
    verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

    await bridgeEnvironmentLogin('PRD', 'QA', 'token-origem');

    expect(getSupabaseClient).toHaveBeenCalledWith('QA');
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'ana@empresa.com.br', token_hash: 'hash-123', type: 'email',
    });
  });

  it('envia a chave do ambiente de ORIGEM, nao a do destino', async () => {
    invoke.mockResolvedValueOnce({ data: { email: 'ana@empresa.com.br', token: 'hash-123' }, error: null });
    verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

    await bridgeEnvironmentLogin('PRD', 'QA', 'token-origem');

    expect(environmentAnonKey).toHaveBeenCalledWith('PRD');
    expect(invoke).toHaveBeenCalledWith('env-switch-login', {
      headers: { Authorization: 'Bearer token-origem' },
      body: { peer_anon_key: 'anon-key-PRD' },
    });
  });

  it('devolve a ressalva quando o login funciona mas o perfil nao pode ser ajustado', async () => {
    invoke.mockResolvedValueOnce({
      data: { email: 'ana@empresa.com.br', token: 'hash-123', warning: 'perfil nao ajustado' },
      error: null,
    });
    verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

    const resultado = await bridgeEnvironmentLogin('PRD', 'QA', 'token-origem');

    expect(resultado).toEqual({ warning: 'perfil nao ajustado' });
  });

  it('lanca erro quando a edge function nao retorna credenciais', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'sem permissao' } });
    await expect(bridgeEnvironmentLogin('QA', 'PRD', 'token-origem')).rejects.toThrow('sem permissao');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('extrai a mensagem real do corpo da resposta, nao a generica do SDK', async () => {
    const context = {
      clone: () => ({ json: async () => ({ error: 'Esta conta nao tem permissao para alternar de ambiente.' }) }),
    };
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });
    await expect(bridgeEnvironmentLogin('PRD', 'QA', 'token-origem'))
      .rejects.toThrow('Esta conta nao tem permissao para alternar de ambiente.');
  });

  it('lanca erro quando verifyOtp falha', async () => {
    invoke.mockResolvedValueOnce({ data: { email: 'ana@empresa.com.br', token: 'hash-123' }, error: null });
    verifyOtp.mockResolvedValueOnce({ data: null, error: { message: 'token expirado' } });
    await expect(bridgeEnvironmentLogin('PRD', 'QA', 'token-origem')).rejects.toThrow('token expirado');
  });
});
