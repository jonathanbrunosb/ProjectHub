import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';

const requestPasswordReset = vi.fn(async (_email: string) => {});
const confirmPasswordReset = vi.fn(async (_email: string, _token: string, _password: string) => {});

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    session: null, loading: false, configured: true,
    requestPasswordReset: (email: string) => requestPasswordReset(email),
    confirmPasswordReset: (email: string, token: string, password: string) =>
      confirmPasswordReset(email, token, password),
  }),
}));

const { ForgotPasswordPage } = await import('../ForgotPasswordPage');

function render() {
  return renderWithProviders(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
}

beforeEach(() => {
  requestPasswordReset.mockClear();
  confirmPasswordReset.mockClear();
});

async function goToConfirmStep(email = 'ana@empresa.com.br') {
  render();
  await userEvent.type(screen.getByPlaceholderText('nome@empresa.com.br'), email);
  await userEvent.click(screen.getByRole('button', { name: /enviar codigo/i }));
  await waitFor(() => expect(screen.getByText(/digite o codigo/i)).toBeInTheDocument());
}

describe('recuperacao de senha por codigo', () => {
  it('pede o codigo por e-mail sem link magico envolvido', async () => {
    render();
    await userEvent.type(screen.getByPlaceholderText('nome@empresa.com.br'), 'ana@empresa.com.br');
    await userEvent.click(screen.getByRole('button', { name: /enviar codigo/i }));
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('ana@empresa.com.br'));
  });

  it('avanca para a etapa de codigo + nova senha apos o envio', async () => {
    await goToConfirmStep('ana@empresa.com.br');
    expect(screen.getByText('ana@empresa.com.br')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('valida tamanho minimo da senha antes de chamar o backend', async () => {
    await goToConfirmStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    const senhas = screen.getAllByPlaceholderText('********');
    await userEvent.type(senhas[0], '123');
    await userEvent.type(senhas[1], '123');
    await userEvent.click(screen.getByRole('button', { name: /redefinir senha/i }));
    expect(await screen.findByText(/pelo menos 8 caracteres/i)).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('valida que as senhas coincidem antes de chamar o backend', async () => {
    await goToConfirmStep();
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    const senhas = screen.getAllByPlaceholderText('********');
    await userEvent.type(senhas[0], 'senhaForte1');
    await userEvent.type(senhas[1], 'outraSenha2');
    await userEvent.click(screen.getByRole('button', { name: /redefinir senha/i }));
    expect(await screen.findByText(/nao coincidem/i)).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('confirma com e-mail, codigo e nova senha corretos', async () => {
    await goToConfirmStep('ana@empresa.com.br');
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    const senhas = screen.getAllByPlaceholderText('********');
    await userEvent.type(senhas[0], 'senhaForte1');
    await userEvent.type(senhas[1], 'senhaForte1');
    await userEvent.click(screen.getByRole('button', { name: /redefinir senha/i }));
    await waitFor(() => expect(confirmPasswordReset).toHaveBeenCalledWith(
      'ana@empresa.com.br', '123456', 'senhaForte1',
    ));
  });

  it('mostra mensagem de sucesso apos redefinir', async () => {
    await goToConfirmStep('ana@empresa.com.br');
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    const senhas = screen.getAllByPlaceholderText('********');
    await userEvent.type(senhas[0], 'senhaForte1');
    await userEvent.type(senhas[1], 'senhaForte1');
    await userEvent.click(screen.getByRole('button', { name: /redefinir senha/i }));
    expect(await screen.findByText(/senha redefinida/i)).toBeInTheDocument();
  });

  it('traduz codigo invalido/expirado em mensagem amigavel', async () => {
    confirmPasswordReset.mockRejectedValueOnce(new Error('Token has expired or is invalid'));
    await goToConfirmStep('ana@empresa.com.br');
    await userEvent.type(screen.getByPlaceholderText('000000'), '000000');
    const senhas = screen.getAllByPlaceholderText('********');
    await userEvent.type(senhas[0], 'senhaForte1');
    await userEvent.type(senhas[1], 'senhaForte1');
    await userEvent.click(screen.getByRole('button', { name: /redefinir senha/i }));
    expect(await screen.findByText(/codigo invalido ou expirado/i)).toBeInTheDocument();
  });

  it('permite reenviar o codigo sem sair da etapa de confirmacao', async () => {
    await goToConfirmStep('ana@empresa.com.br');
    requestPasswordReset.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /reenviar codigo/i }));
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('ana@empresa.com.br'));
    expect(screen.getByText(/digite o codigo/i)).toBeInTheDocument();
  });

  it('link de voltar aponta para o login', async () => {
    render();
    expect(screen.getByRole('link', { name: /voltar para o login/i })).toHaveAttribute('href', '/login');
  });
});
