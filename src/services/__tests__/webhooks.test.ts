import { describe, it, expect, vi, beforeEach } from 'vitest';

const single = vi.fn(async () => ({ data: { url: 'https://exemplo.com/hook', secret: 'shh', enabled: true }, error: null as Error | null }));
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const updateEq = vi.fn(async () => ({ error: null as Error | null }));
const update = vi.fn(() => ({ eq: updateEq }));
const from = vi.fn(() => ({ select, update }));
const rpc = vi.fn(async () => ({ error: null as Error | null }));
const logAppEvent = vi.fn(async () => undefined);

vi.mock('@/lib/supabase/client', () => ({ supabase: { from, rpc } }));
vi.mock('@/lib/supabase/audit', () => ({ logAppEvent }));

const { getWebhookConfig, saveWebhookConfig, testWebhookDelivery } = await import('../webhooks');

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

describe('getWebhookConfig', () => {
  it('busca a configuracao singleton (id = true)', async () => {
    const config = await getWebhookConfig();
    expect(from).toHaveBeenCalledWith('webhook_config');
    expect(eq).toHaveBeenCalledWith('id', true);
    expect(config).toEqual({ url: 'https://exemplo.com/hook', secret: 'shh', enabled: true });
  });

  it('propaga o erro do Supabase', async () => {
    single.mockResolvedValueOnce({ data: {} as never, error: new Error('falhou') });
    await expect(getWebhookConfig()).rejects.toThrow('falhou');
  });
});

describe('saveWebhookConfig', () => {
  it('atualiza a configuracao e registra config_change na auditoria, sem o segredo', async () => {
    await saveWebhookConfig({ url: 'https://exemplo.com/hook', secret: 'shh', enabled: true });
    expect(update).toHaveBeenCalledWith({ url: 'https://exemplo.com/hook', secret: 'shh', enabled: true });
    expect(logAppEvent).toHaveBeenCalledWith('config_change', 'webhook_config', {
      data: { enabled: true, url: 'https://exemplo.com/hook' },
    });
  });

  it('converte string vazia em null para url e segredo', async () => {
    await saveWebhookConfig({ url: '', secret: '', enabled: false });
    expect(update).toHaveBeenCalledWith({ url: null, secret: null, enabled: false });
  });

  it('propaga o erro do Supabase sem registrar auditoria', async () => {
    updateEq.mockResolvedValueOnce({ error: new Error('sem permissao') });
    await expect(saveWebhookConfig({ url: 'x', secret: '', enabled: true })).rejects.toThrow('sem permissao');
    expect(logAppEvent).not.toHaveBeenCalled();
  });
});

describe('testWebhookDelivery', () => {
  it('chama a RPC test_webhook_delivery', async () => {
    await testWebhookDelivery();
    expect(rpc).toHaveBeenCalledWith('test_webhook_delivery');
  });

  it('propaga o erro da RPC', async () => {
    rpc.mockResolvedValueOnce({ error: new Error('Configure e salve a URL do webhook antes de testar.') });
    await expect(testWebhookDelivery()).rejects.toThrow('Configure e salve a URL');
  });
});
