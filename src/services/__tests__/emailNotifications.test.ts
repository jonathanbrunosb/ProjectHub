import { describe, it, expect, vi, beforeEach } from 'vitest';

const single = vi.fn(async () => ({
  data: { api_key: 'chave123', from_email: 'alertas@empresa.com', app_base_url: 'https://app.empresa.com', enabled: true },
  error: null as Error | null,
}));
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const updateEq = vi.fn(async () => ({ error: null as Error | null }));
const update = vi.fn(() => ({ eq: updateEq }));
const from = vi.fn(() => ({ select, update }));
const rpc = vi.fn(async () => ({ error: null as Error | null }));
const logAppEvent = vi.fn(async () => undefined);

vi.mock('@/lib/supabase/client', () => ({ supabase: { from, rpc } }));
vi.mock('@/lib/supabase/audit', () => ({ logAppEvent }));

const { getEmailNotificationConfig, saveEmailNotificationConfig, testEmailDelivery } = await import('../emailNotifications');

beforeEach(() => {
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  single.mockClear();
  update.mockClear();
  updateEq.mockClear();
  rpc.mockClear();
  logAppEvent.mockClear();
});

describe('getEmailNotificationConfig', () => {
  it('busca a configuracao singleton (id = true)', async () => {
    const config = await getEmailNotificationConfig();
    expect(from).toHaveBeenCalledWith('email_notification_config');
    expect(eq).toHaveBeenCalledWith('id', true);
    expect(config).toEqual({
      api_key: 'chave123', from_email: 'alertas@empresa.com', app_base_url: 'https://app.empresa.com', enabled: true,
    });
  });

  it('propaga o erro do Supabase', async () => {
    single.mockResolvedValueOnce({ data: {} as never, error: new Error('falhou') });
    await expect(getEmailNotificationConfig()).rejects.toThrow('falhou');
  });
});

describe('saveEmailNotificationConfig', () => {
  it('atualiza a configuracao e registra config_change na auditoria, sem a api key', async () => {
    await saveEmailNotificationConfig({
      apiKey: 'chave123', fromEmail: 'alertas@empresa.com', appBaseUrl: 'https://app.empresa.com', enabled: true,
    });
    expect(update).toHaveBeenCalledWith({
      api_key: 'chave123', from_email: 'alertas@empresa.com', app_base_url: 'https://app.empresa.com', enabled: true,
    });
    expect(logAppEvent).toHaveBeenCalledWith('config_change', 'email_notification_config', {
      data: { enabled: true, from_email: 'alertas@empresa.com' },
    });
  });

  it('converte string vazia em null para remetente, api key e url base', async () => {
    await saveEmailNotificationConfig({ apiKey: '', fromEmail: '', appBaseUrl: '', enabled: false });
    expect(update).toHaveBeenCalledWith({ api_key: null, from_email: null, app_base_url: null, enabled: false });
  });

  it('propaga o erro do Supabase sem registrar auditoria', async () => {
    updateEq.mockResolvedValueOnce({ error: new Error('sem permissao') });
    await expect(saveEmailNotificationConfig({ apiKey: 'x', fromEmail: 'a@b.com', appBaseUrl: '', enabled: true }))
      .rejects.toThrow('sem permissao');
    expect(logAppEvent).not.toHaveBeenCalled();
  });
});

describe('testEmailDelivery', () => {
  it('chama a RPC test_email_delivery', async () => {
    await testEmailDelivery();
    expect(rpc).toHaveBeenCalledWith('test_email_delivery');
  });

  it('propaga o erro da RPC', async () => {
    rpc.mockResolvedValueOnce({ error: new Error('Configure e salve a API key e o remetente antes de testar.') });
    await expect(testEmailDelivery()).rejects.toThrow('Configure e salve a API key');
  });
});
