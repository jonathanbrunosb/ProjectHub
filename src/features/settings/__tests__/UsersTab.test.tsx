import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/components/layout/AppShell', () => ({ useBreadcrumbs: vi.fn() }));

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    can: (cap: string) => cap === 'users.manage',
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

const profiles = [
  { id: 'admin-1', full_name: 'Admin Um', email: 'admin@empresa.com.br', job_title: 'PMO', role: 'admin', can_switch_environment: true, weekly_capacity_hours: 40, active: true },
  { id: 'user-2', full_name: 'Colaborador Dois', email: 'colab@empresa.com.br', job_title: null, role: 'collaborator', can_switch_environment: false, weekly_capacity_hours: 40, active: true },
];

vi.mock('@/services/projects', () => ({
  listProfiles: vi.fn(async () => profiles),
  listCompanies: vi.fn(async () => []),
  listTeams: vi.fn(async () => []),
  listTemplates: vi.fn(async () => []),
}));

vi.mock('@/services/customFields', () => ({
  listAllDefinitions: vi.fn(async () => []),
  upsertDefinition: vi.fn(), deleteDefinition: vi.fn(), replaceOptions: vi.fn(),
}));

vi.mock('@/services/governance', () => ({ refreshAllHealth: vi.fn() }));

const resetUserPassword = vi.fn();
vi.mock('@/services/adminUsers', () => ({
  createUser: vi.fn(),
  resetUserPassword: (userId: string) => resetUserPassword(userId),
}));

const { SettingsPage } = await import('../SettingsPage');

function render() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/configuracoes/usuarios']}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => resetUserPassword.mockClear());

describe('redefinicao de senha pelo Admin', () => {
  it('oferece o botao de redefinir senha para cada usuario', async () => {
    render();
    expect(await screen.findAllByRole('button', { name: /redefinir senha/i })).toHaveLength(2);
  });

  it('pede confirmacao antes de gerar a nova senha', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[1]);
    expect(await screen.findByRole('button', { name: /^redefinir$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Colaborador Dois/).length).toBeGreaterThan(0);
    expect(resetUserPassword).not.toHaveBeenCalled();
  });

  it('gera a senha e exibe a credencial apos confirmar', async () => {
    resetUserPassword.mockResolvedValueOnce({ email: 'colab@empresa.com.br', temporary_password: 'Abc12345!' });
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[1]);
    await userEvent.click(screen.getByRole('button', { name: /^redefinir$/i }));

    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('user-2'));
    expect(await screen.findByText(/senha redefinida/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Abc12345!')).toBeInTheDocument();
  });

  it('cancelar a confirmacao nao gera nenhuma senha', async () => {
    render();
    const botoes = await screen.findAllByRole('button', { name: /redefinir senha/i });
    await userEvent.click(botoes[0]);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(resetUserPassword).not.toHaveBeenCalled();
  });
});
