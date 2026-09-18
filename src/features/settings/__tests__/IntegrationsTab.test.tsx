import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  getWebhookConfig: vi.fn(async () => ({ url: '', secret: '', enabled: false })),
  saveWebhookConfig: vi.fn(async () => undefined),
  testWebhookDelivery: vi.fn(async () => undefined),
}));

vi.mock('@/services/webhooks', () => mocks);

const { IntegrationsTab } = await import('../SettingsPage');

beforeEach(() => {
  mocks.getWebhookConfig.mockClear();
  mocks.saveWebhookConfig.mockClear();
  mocks.testWebhookDelivery.mockClear();
});

describe('IntegrationsTab', () => {
  it('carrega a configuracao existente e desabilita "Enviar teste" sem URL salva', async () => {
    renderWithProviders(<IntegrationsTab />);
    expect(await screen.findByText('Inativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar teste' })).toBeDisabled();
  });

  it('salva a URL, o segredo e o estado ativo informados', async () => {
    renderWithProviders(<IntegrationsTab />);
    await screen.findByText('Inativo');

    await userEvent.type(screen.getByPlaceholderText('https://exemplo.com/hooks/projecthub'), 'https://exemplo.com/hook');
    await userEvent.type(screen.getByPlaceholderText('Usado para assinar o payload (X-ProjectHub-Signature)'), 'segredo123');
    await userEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.saveWebhookConfig).toHaveBeenCalledWith({
      url: 'https://exemplo.com/hook', secret: 'segredo123', enabled: true,
    }));
  });

  it('habilita "Enviar teste" quando ja existe uma URL salva e chama a RPC de teste', async () => {
    mocks.getWebhookConfig.mockResolvedValueOnce({ url: 'https://exemplo.com/hook', secret: '', enabled: true });
    renderWithProviders(<IntegrationsTab />);

    const testButton = await screen.findByRole('button', { name: 'Enviar teste' });
    expect(testButton).not.toBeDisabled();

    await userEvent.click(testButton);
    await waitFor(() => expect(mocks.testWebhookDelivery).toHaveBeenCalled());
  });

  it('desabilita "Enviar teste" apos uma edicao nao salva, para nao testar contra config desatualizada', async () => {
    mocks.getWebhookConfig.mockResolvedValueOnce({ url: 'https://exemplo.com/hook', secret: '', enabled: true });
    renderWithProviders(<IntegrationsTab />);

    const testButton = await screen.findByRole('button', { name: 'Enviar teste' });
    expect(testButton).not.toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('https://exemplo.com/hooks/projecthub'), '2');
    expect(testButton).toBeDisabled();
  });
});
