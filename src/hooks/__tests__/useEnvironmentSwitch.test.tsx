import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Cobre o comportamento visivel da troca de ambiente: o que a pessoa ve quando
 * da certo, quando ha ressalva e quando a ponte esta indisponivel. Estes casos
 * so eram exercitados manualmente em producao - onde apareceram como mensagem
 * tecnica vazada para a tela.
 */
const bridgeEnvironmentLogin = vi.fn(
  async (_source: string, _target: string, _token: string) => ({ warning: undefined as string | undefined }),
);
const switchEnvironment = vi.fn((_target: string) => {});
const logAppEvent = vi.fn(async () => {});

let perfil: { can_switch_environment: boolean } | null = { can_switch_environment: true };
let sessao: { access_token: string } | null = { access_token: 'token-de-origem' };

vi.mock('@/services/envBridge', () => ({
  bridgeEnvironmentLogin: (s: string, t: string, k: string) => bridgeEnvironmentLogin(s, t, k),
}));
vi.mock('@/lib/supabase/audit', () => ({
  logAppEvent: (...args: unknown[]) => logAppEvent(...(args as [])),
}));
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: perfil, session: sessao }),
}));
vi.mock('@/app/EnvironmentProvider', () => ({
  useEnvironment: () => ({
    environment: 'PRD' as const,
    available: ['QA', 'PRD'] as const,
    switchEnvironment: (t: string) => switchEnvironment(t),
  }),
}));

const { useEnvironmentSwitch } = await import('../useEnvironmentSwitch');
const { ToastProvider } = await import('@/components/ui/Toast');

function Tela() {
  const { requestSwitch, switching, switchingTo } = useEnvironmentSwitch();
  return (
    <div>
      <button type="button" onClick={() => void requestSwitch('QA')}>trocar</button>
      <span data-testid="estado">{switching ? `indo para ${switchingTo}` : 'parado'}</span>
    </div>
  );
}

function montar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}><ToastProvider>{children}</ToastProvider></QueryClientProvider>
  );
  return render(<Tela />, { wrapper: Wrapper });
}

beforeEach(() => {
  bridgeEnvironmentLogin.mockReset().mockResolvedValue({ warning: undefined });
  switchEnvironment.mockClear();
  logAppEvent.mockClear();
  perfil = { can_switch_environment: true };
  sessao = { access_token: 'token-de-origem' };
});

describe('troca de ambiente - o que a pessoa ve', () => {
  it('confirma o destino em linguagem de negocio quando da certo', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'trocar' }));

    await waitFor(() => expect(switchEnvironment).toHaveBeenCalledWith('QA'));
    expect(await screen.findByText('Voce esta em Ambiente de Testes')).toBeInTheDocument();
  });

  it('nunca mostra jargao tecnico quando ha ressalva - so o que o Admin precisa fazer', async () => {
    bridgeEnvironmentLogin.mockResolvedValue({
      warning: 'O perfil de acesso neste ambiente pode precisar de ajuste em Configuracoes > Usuarios.',
    });
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'trocar' }));

    const aviso = await screen.findByText(/pode precisar de ajuste em Configuracoes/);
    expect(aviso).toBeInTheDocument();
    // O que vazava antes: nome de tabela, formato de chave, erro de banco.
    expect(document.body.textContent).not.toMatch(/permission denied|sb_secret|service_role|profiles/i);
  });

  it('troca mesmo assim quando a ponte falha, orientando a entrar de novo', async () => {
    bridgeEnvironmentLogin.mockRejectedValue(new Error('A troca automatica esta indisponivel no momento.'));
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'trocar' }));

    expect(await screen.findByText('Entre novamente para continuar')).toBeInTheDocument();
    // O caminho manual continua funcionando - a falha nao prende a pessoa.
    await waitFor(() => expect(switchEnvironment).toHaveBeenCalledWith('QA'));
  });

  it('mostra para onde esta indo enquanto espera', async () => {
    let liberar: (v: { warning: undefined }) => void = () => {};
    bridgeEnvironmentLogin.mockReturnValue(new Promise((ok) => { liberar = ok; }));
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'trocar' }));

    expect(await screen.findByTestId('estado')).toHaveTextContent('indo para QA');
    liberar({ warning: undefined });
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('parado'));
  });

  it('ignora cliques repetidos durante a troca', async () => {
    let liberar: (v: { warning: undefined }) => void = () => {};
    bridgeEnvironmentLogin.mockReturnValue(new Promise((ok) => { liberar = ok; }));
    montar();
    const botao = screen.getByRole('button', { name: 'trocar' });

    await userEvent.click(botao);
    await userEvent.click(botao);
    await userEvent.click(botao);

    expect(bridgeEnvironmentLogin).toHaveBeenCalledTimes(1);
    liberar({ warning: undefined });
  });

  it('nao aciona a ponte para quem nao tem permissao, e registra a tentativa', async () => {
    perfil = { can_switch_environment: false };
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'trocar' }));

    expect(bridgeEnvironmentLogin).not.toHaveBeenCalled();
    expect(switchEnvironment).not.toHaveBeenCalled();
    await waitFor(() => expect(logAppEvent).toHaveBeenCalledWith(
      'environment_switch_denied', 'environment', expect.anything(),
    ));
  });
});
