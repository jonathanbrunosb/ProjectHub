import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const profile = {
  id: 'user-1', full_name: 'Ana Ribeiro', email: 'ana@empresa.com.br', job_title: 'Analista',
  role: 'collaborator', weekly_capacity_hours: 40, area_id: null,
};

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile, refreshProfile: vi.fn() }),
}));

vi.mock('@/services/areas', () => ({ listAreas: vi.fn(async () => []) }));

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/client')>();
  return {
    ...actual,
    supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
  };
});

const mocks = vi.hoisted(() => ({
  listVerifiedTotpFactors: vi.fn(async (): Promise<import('@/services/mfa').MfaFactor[]> => []),
  enrollTotpFactor: vi.fn(async () => ({
    factorId: 'factor-new', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET123',
  })),
  verifyTotpEnrollment: vi.fn(async () => undefined),
  unenrollMfaFactor: vi.fn(async () => undefined),
}));

vi.mock('@/services/mfa', () => mocks);

const { ProfileTab } = await import('../SettingsPage');

beforeEach(() => {
  mocks.listVerifiedTotpFactors.mockClear();
  mocks.enrollTotpFactor.mockClear();
  mocks.verifyTotpEnrollment.mockClear();
  mocks.unenrollMfaFactor.mockClear();
});

describe('SecurityCard (via ProfileTab)', () => {
  it('oferece ativar quando nao ha fator cadastrado', async () => {
    renderWithProviders(<ProfileTab />);
    expect(await screen.findByRole('button', { name: 'Ativar autenticacao em duas etapas' })).toBeInTheDocument();
  });

  it('mostra o QR code e confirma o cadastro com o codigo digitado', async () => {
    renderWithProviders(<ProfileTab />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar autenticacao em duas etapas' }));

    const dialog = await screen.findByRole('dialog', { name: /Ativar autenticacao em duas etapas/i });
    expect(within(dialog).getByAltText('QR code para o aplicativo autenticador')).toHaveAttribute('src', 'data:image/svg+xml;utf-8,<svg/>');
    expect(within(dialog).getByDisplayValue('SECRET123')).toBeInTheDocument();

    const codeInput = within(dialog).getByPlaceholderText('000000');
    await userEvent.type(codeInput, '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.verifyTotpEnrollment).toHaveBeenCalledWith('factor-new', '123456'));
  });

  it('cancelar o cadastro remove o fator nao verificado', async () => {
    renderWithProviders(<ProfileTab />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar autenticacao em duas etapas' }));
    const dialog = await screen.findByRole('dialog', { name: /Ativar autenticacao em duas etapas/i });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(mocks.unenrollMfaFactor).toHaveBeenCalledWith('factor-new'));
    expect(mocks.verifyTotpEnrollment).not.toHaveBeenCalled();
  });

  it('oferece desativar quando ja existe um fator verificado', async () => {
    mocks.listVerifiedTotpFactors.mockResolvedValueOnce([
      { id: 'factor-1', status: 'verified', created_at: '2026-09-01T00:00:00Z' },
    ]);
    renderWithProviders(<ProfileTab />);
    expect(await screen.findByRole('button', { name: 'Desativar' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    const confirmDialog = await screen.findByRole('dialog', { name: /Desativar autenticacao em duas etapas/i });
    await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(mocks.unenrollMfaFactor).toHaveBeenCalledWith('factor-1'));
  });
});
