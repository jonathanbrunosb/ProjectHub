import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  getWebhookConfig: vi.fn(async () => ({ url: '', secret: '', enabled: false })),
  saveWebhookConfig: vi.fn(async () => undefined),
  testWebhookDelivery: vi.fn(async () => undefined),
  getEmailNotificationConfig: vi.fn(async () => ({ api_key: '', from_email: '', app_base_url: '', enabled: false })),
  saveEmailNotificationConfig: vi.fn(async () => undefined),
  testEmailDelivery: vi.fn(async () => undefined),
}));

vi.mock('@/services/webhooks', () => mocks);
vi.mock('@/services/emailNotifications', () => mocks);

const { IntegrationsTab } = await import('../SettingsPage');

beforeEach(() => {
  mocks.getWebhookConfig.mockClear();
  mocks.saveWebhookConfig.mockClear();
  mocks.testWebhookDelivery.mockClear();
  mocks.getEmailNotificationConfig.mockClear();
  mocks.saveEmailNotificationConfig.mockClear();
  mocks.testEmailDelivery.mockClear();
});

describe('IntegrationsTab - webhook', () => {
  it('carrega a configuracao existente e desabilita "Enviar teste" sem URL salva', async () => {
    renderWithProviders(<IntegrationsTab />);
    expect(await screen.findAllByText('Inativo')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Enviar teste' })[0]).toBeDisabled();
  });

  it('salva a URL, o segredo e o estado ativo informados', async () => {
    renderWithProviders(<IntegrationsTab />);
    await screen.findAllByText('Inativo');

    await userEvent.type(screen.getByPlaceholderText('https://exemplo.com/hooks/projecthub'), 'https://exemplo.com/hook');
    await userEvent.type(screen.getByPlaceholderText('Usado para assinar o payload (X-ProjectHub-Signature)'), 'segredo123');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ativar' })[0]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    await waitFor(() => expect(mocks.saveWebhookConfig).toHaveBeenCalledWith({
      url: 'https://exemplo.com/hook', secret: 'segredo123', enabled: true,
    }));
  });

  it('habilita "Enviar teste" quando ja existe uma URL salva e chama a RPC de teste', async () => {
    mocks.getWebhookConfig.mockResolvedValueOnce({ url: 'https://exemplo.com/hook', secret: '', enabled: true });
    renderWithProviders(<IntegrationsTab />);

    const testButtons = await screen.findAllByRole('button', { name: 'Enviar teste' });
    expect(testButtons[0]).not.toBeDisabled();

    await userEvent.click(testButtons[0]);
    await waitFor(() => expect(mocks.testWebhookDelivery).toHaveBeenCalled());
  });

  it('desabilita "Enviar teste" apos uma edicao nao salva, para nao testar contra config desatualizada', async () => {
    mocks.getWebhookConfig.mockResolvedValueOnce({ url: 'https://exemplo.com/hook', secret: '', enabled: true });
    renderWithProviders(<IntegrationsTab />);

    const testButtons = await screen.findAllByRole('button', { name: 'Enviar teste' });
    expect(testButtons[0]).not.toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('https://exemplo.com/hooks/projecthub'), '2');
    expect(testButtons[0]).toBeDisabled();
  });
});

describe('IntegrationsTab - e-mail', () => {
  it('carrega a configuracao existente e desabilita "Enviar teste" sem api key/remetente salvos', async () => {
    renderWithProviders(<IntegrationsTab />);
    expect(await screen.findAllByText('Inativo')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Enviar teste' })[1]).toBeDisabled();
  });

  it('salva o remetente, a api key e o estado ativo informados', async () => {
    renderWithProviders(<IntegrationsTab />);
    await screen.findAllByText('Inativo');

    await userEvent.type(screen.getByPlaceholderText('notificacoes@seudominio.com'), 'alertas@empresa.com');
    await userEvent.type(screen.getByPlaceholderText('re_...'), 'chave123');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ativar' })[1]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Salvar' })[1]);

    await waitFor(() => expect(mocks.saveEmailNotificationConfig).toHaveBeenCalledWith({
      apiKey: 'chave123', fromEmail: 'alertas@empresa.com', appBaseUrl: '', enabled: true,
    }));
  });

  it('habilita "Enviar teste" quando ja existe api key e remetente salvos e chama a RPC de teste', async () => {
    mocks.getEmailNotificationConfig.mockResolvedValueOnce({
      api_key: 'chave123', from_email: 'alertas@empresa.com', app_base_url: '', enabled: true,
    });
    renderWithProviders(<IntegrationsTab />);

    const testButtons = await screen.findAllByRole('button', { name: 'Enviar teste' });
    expect(testButtons[1]).not.toBeDisabled();

    await userEvent.click(testButtons[1]);
    await waitFor(() => expect(mocks.testEmailDelivery).toHaveBeenCalled());
  });

  it('desabilita "Enviar teste" apos uma edicao nao salva, para nao testar contra config desatualizada', async () => {
    mocks.getEmailNotificationConfig.mockResolvedValueOnce({
      api_key: 'chave123', from_email: 'alertas@empresa.com', app_base_url: '', enabled: true,
    });
    renderWithProviders(<IntegrationsTab />);

    const testButtons = await screen.findAllByRole('button', { name: 'Enviar teste' });
    expect(testButtons[1]).not.toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('notificacoes@seudominio.com'), '2');
    expect(testButtons[1]).toBeDisabled();
  });
});
