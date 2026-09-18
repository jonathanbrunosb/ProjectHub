import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  loading: false,
  mfaPending: false,
  signOut: vi.fn(async () => undefined),
  verifyMfa: vi.fn(async (_code: string) => undefined),
}));

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    session: mocks.session, loading: mocks.loading, mfaPending: mocks.mfaPending,
    signOut: mocks.signOut, verifyMfa: mocks.verifyMfa,
  }),
}));

const { MfaChallengePage } = await import('../MfaChallengePage');

function renderPage(initialEntries: string[] = ['/mfa']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/mfa" element={<MfaChallengePage />} />
        <Route path="/login" element={<div>Tela de login</div>} />
        <Route path="/" element={<div>Area logada</div>} />
        <Route path="/portfolio" element={<div>Portfolio</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MfaChallengePage', () => {
  it('redireciona para o login quando nao ha sessao', async () => {
    mocks.session = null;
    mocks.mfaPending = false;
    renderPage();
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
  });

  it('redireciona para a area logada quando o desafio ja nao e mais necessario', async () => {
    mocks.session = { user: { id: 'user-1' } };
    mocks.mfaPending = false;
    renderPage();
    expect(await screen.findByText('Area logada')).toBeInTheDocument();
  });

  it('redireciona para a rota original apos o desafio, quando informada', async () => {
    mocks.session = { user: { id: 'user-1' } };
    mocks.mfaPending = false;
    render(
      <MemoryRouter initialEntries={[{ pathname: '/mfa', state: { from: '/portfolio' } }]}>
        <Routes>
          <Route path="/mfa" element={<MfaChallengePage />} />
          <Route path="/portfolio" element={<div>Portfolio</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Portfolio')).toBeInTheDocument();
  });

  it('pede o codigo e chama verifyMfa quando o desafio esta pendente', async () => {
    mocks.session = { user: { id: 'user-1' } };
    mocks.mfaPending = true;
    renderPage();

    const input = await screen.findByPlaceholderText('000000');
    await userEvent.type(input, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(mocks.verifyMfa).toHaveBeenCalledWith('123456'));
  });

  it('exibe erro amigavel quando o codigo e invalido', async () => {
    mocks.session = { user: { id: 'user-1' } };
    mocks.mfaPending = true;
    mocks.verifyMfa.mockRejectedValueOnce(new Error('Invalid TOTP code entered'));
    renderPage();

    const input = await screen.findByPlaceholderText('000000');
    await userEvent.type(input, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('Codigo invalido ou expirado.')).toBeInTheDocument();
  });

  it('permite sair quando o usuario nao tem acesso ao autenticador', async () => {
    mocks.session = { user: { id: 'user-1' } };
    mocks.mfaPending = true;
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
