import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { reports } from '../reportDefinitions';

const can = vi.fn(() => true);
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ can, profile: { email: 'ana@empresa.com.br' } }),
}));

const buildReportSheets = vi.fn(async () => ([
  { name: 'Projetos', rows: [{ Codigo: 'PRJ-1' }] },
]));
vi.mock('../reportWorkbook', () => ({ buildReportSheets: () => buildReportSheets() }));

const downloadWorkbook = vi.fn(async () => {});
vi.mock('@/lib/export/xlsx', async () => {
  const actual = await vi.importActual<typeof import('@/lib/export/xlsx')>('@/lib/export/xlsx');
  return { ...actual, downloadWorkbook: () => downloadWorkbook() };
});

const logAppEvent = vi.fn(async () => {});
vi.mock('@/lib/supabase/audit', () => ({ logAppEvent: () => logAppEvent() }));

const { ReportsPage } = await import('../ReportsPage');
const { useBreadcrumbs } = await import('@/components/layout/AppShell');
vi.mock('@/components/layout/AppShell', () => ({ useBreadcrumbs: vi.fn() }));

function render() {
  return renderWithProviders(<MemoryRouter><ReportsPage /></MemoryRouter>);
}

beforeEach(() => {
  can.mockReturnValue(true);
  buildReportSheets.mockClear();
  downloadWorkbook.mockClear();
  logAppEvent.mockClear();
  vi.mocked(useBreadcrumbs).mockImplementation(() => {});
});

describe('janela Relatorios', () => {
  it('oferece Visualizar e Excel em todos os relatorios, nao so no primeiro', () => {
    render();
    expect(screen.getAllByRole('link', { name: /visualizar/i })).toHaveLength(reports.length);
    expect(screen.getAllByRole('button', { name: /excel/i })).toHaveLength(reports.length);
  });

  it('mantem Visualizar como link - permite abrir em nova aba', () => {
    render();
    const first = screen.getAllByRole('link', { name: /visualizar/i })[0];
    expect(first).toHaveAttribute('href', `/relatorios/${reports[0].key}`);
  });

  it('gera a planilha e registra a exportacao na trilha ao clicar em Excel', async () => {
    render();
    await userEvent.click(screen.getAllByRole('button', { name: /excel/i })[0]);
    await waitFor(() => expect(downloadWorkbook).toHaveBeenCalledOnce());
    expect(buildReportSheets).toHaveBeenCalledOnce();
    expect(logAppEvent).toHaveBeenCalledOnce();
  });

  it('nao oferece exportacao a quem nao tem a permissao', () => {
    can.mockReturnValue(false);
    render();
    expect(screen.queryByRole('button', { name: /excel/i })).toBeNull();
    // a visualizacao continua disponivel - a permissao restringe apenas o export
    expect(screen.getAllByRole('link', { name: /visualizar/i })).toHaveLength(reports.length);
  });

  it('avisa quando o relatorio nao tem linhas, sem baixar arquivo vazio', async () => {
    buildReportSheets.mockResolvedValueOnce([{ name: 'Projetos', rows: [] }]);
    render();
    await userEvent.click(screen.getAllByRole('button', { name: /excel/i })[0]);
    await waitFor(() => expect(screen.getByText(/nada a exportar/i)).toBeInTheDocument());
    expect(downloadWorkbook).not.toHaveBeenCalled();
  });

  it('mostra erro claro quando a geracao falha, sem stack trace', async () => {
    downloadWorkbook.mockRejectedValueOnce(new Error('quota exceeded'));
    render();
    await userEvent.click(screen.getAllByRole('button', { name: /excel/i })[0]);
    await waitFor(() => expect(screen.getByText(/nao foi possivel gerar o arquivo excel/i)).toBeInTheDocument());
  });
});
