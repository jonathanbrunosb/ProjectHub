import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatForPdf } from '../pdf';
import { buildExportFileName, sanitizeFileName } from '../fileName';
import type { ExportDocument } from '../types';

describe('formatacao para leitura', () => {
  it('formata moeda, percentual, numero e data no padrao brasileiro', () => {
    expect(formatForPdf(125450.22, 'currency')).toMatch(/125\.450,22/);
    expect(formatForPdf(78.4, 'percent')).toBe('78,4%');
    expect(formatForPdf(1234.5, 'number')).toBe('1.234,5');
    expect(formatForPdf(1234, 'integer')).toBe('1.234');
    expect(formatForPdf('2026-09-05', 'date')).toBe('05/09/2026');
  });

  it('nao usa a string tecnica ISO em data/hora', () => {
    const out = formatForPdf('2026-09-05T10:32:41.583Z', 'datetime');
    expect(out).not.toContain('T');
    expect(out).not.toContain('Z');
    expect(out).toMatch(/05\/09\/2026/);
  });

  it('traduz booleano e trata valor ausente sem quebrar', () => {
    expect(formatForPdf(true, 'boolean')).toBe('Sim');
    // "Nao" e' diferente de ausente: exibir "-" perderia a informacao
    expect(formatForPdf(false, 'boolean')).toBe('Nao');
    expect(formatForPdf(null, 'currency')).toBe('-');
    expect(formatForPdf('', 'text')).toBe('-');
  });
});

describe('nome do arquivo', () => {
  it('usa a extensao pedida e carimba ambiente e data', () => {
    const date = new Date('2026-09-05T12:00:00Z');
    expect(buildExportFileName('Relatorio de Riscos', 'PRD', 'pdf', date))
      .toBe('relatorio_de_riscos_PRD_2026-09-05.pdf');
    expect(buildExportFileName('Relatorio de Riscos', 'QA', 'xlsx', date))
      .toBe('relatorio_de_riscos_QA_2026-09-05.xlsx');
  });

  it('remove acentos e caracteres invalidos', () => {
    expect(sanitizeFileName('Relatório: Riscos/Ações*')).toBe('relatorio_riscos_acoes');
  });
});

// ---------------------------------------------------------------------------
// Documento gerado: jsPDF roda em jsdom, entao da' para inspecionar o PDF real.
// ---------------------------------------------------------------------------

const save = vi.fn();
const addImage = vi.fn();
const text = vi.fn();
const autoTable = vi.fn();
let capturedDoc: Record<string, unknown> | null = null;

// `new` usa o objeto devolvido pelo construtor, entao da' para montar a
// instancia aqui e guardar a referencia sem precisar de alias de `this`.
vi.mock('jspdf', () => ({
  jsPDF: vi.fn((options: unknown) => {
    const instance = {
      options,
      internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
      setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), setFillColor: vi.fn(),
      rect: vi.fn(), setPage: vi.fn(), getNumberOfPages: () => 2,
      text, addImage, save,
      lastAutoTable: { finalY: 200 },
    };
    capturedDoc = instance;
    return instance;
  }),
}));

vi.mock('jspdf-autotable', () => ({ default: (...args: unknown[]) => autoTable(...args) }));

const { downloadPdf } = await import('../pdf');

function doc(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    fileName: 'relatorio_PRD_2026-09-05.pdf',
    meta: { environment: 'PRD', title: 'Relatorio Financeiro', userEmail: 'ana@empresa.com.br' },
    sheets: [{
      name: 'Projetos',
      columns: [
        { key: 'projeto', header: 'Projeto', type: 'text' },
        { key: 'orcamento', header: 'Orcamento', type: 'currency' },
        { key: 'avanco', header: 'Avanco', type: 'percent' },
      ],
      rows: [{ projeto: 'IFRS 18', orcamento: 125450.22, avanco: 78.4 }],
    }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sem rede'))));
  [save, addImage, text, autoTable].forEach((m) => m.mockClear());
  capturedDoc = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('documento PDF', () => {
  it('salva com o nome informado', async () => {
    await downloadPdf(doc());
    expect(save).toHaveBeenCalledWith('relatorio_PRD_2026-09-05.pdf');
  });

  it('escreve os valores ja formatados, nao os numeros crus', async () => {
    await downloadPdf(doc());
    const body = (autoTable.mock.calls[0][1] as { body: string[][] }).body;
    expect(body[0][1]).toMatch(/125\.450,22/);
    expect(body[0][2]).toBe('78,4%');
  });

  it('alinha colunas numericas a direita', async () => {
    await downloadPdf(doc());
    const styles = (autoTable.mock.calls[0][1] as { columnStyles: Record<number, { halign?: string }> }).columnStyles;
    expect(styles[0]).toEqual({});
    expect(styles[1]).toEqual({ halign: 'right' });
    expect(styles[2]).toEqual({ halign: 'right' });
  });

  it('repete o cabecalho da tabela em cada pagina', async () => {
    await downloadPdf(doc());
    expect((autoTable.mock.calls[0][1] as { showHead: string }).showHead).toBe('everyPage');
  });

  it('gera uma tabela por secao do relatorio', async () => {
    await downloadPdf(doc({
      sheets: [
        { name: 'Resumo', rows: [{ Indicador: 'Projetos', Valor: 6 }] },
        { name: 'Projetos', rows: [{ Codigo: 'PRJ-1' }] },
        { name: 'Riscos', rows: [{ Codigo: 'RSK-1' }] },
      ],
    }));
    expect(autoTable).toHaveBeenCalledTimes(3);
  });

  it('usa paisagem quando a tabela tem muitas colunas', async () => {
    const columns = Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, header: `C${i}` }));
    await downloadPdf(doc({ sheets: [{ name: 'Larga', columns, rows: [{ c0: 'x' }] }] }));
    expect((capturedDoc as unknown as { options: { orientation: string } }).options.orientation).toBe('landscape');
  });

  it('usa retrato quando a tabela e estreita', async () => {
    await downloadPdf(doc());
    expect((capturedDoc as unknown as { options: { orientation: string } }).options.orientation).toBe('portrait');
  });

  it('identifica no documento quando os dados sao de QA', async () => {
    await downloadPdf(doc({ meta: { environment: 'QA', title: 'Relatorio Financeiro' } }));
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).toMatch(/DADOS DE QA/i);
    expect(escrito).toMatch(/NAO UTILIZAR COMO INFORMACAO OFICIAL/i);
  });

  it('nao marca aviso de teste em documento de Producao', async () => {
    await downloadPdf(doc());
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).not.toMatch(/DADOS DE QA/i);
  });

  it('registra ambiente, usuario e identidade do produto no cabecalho', async () => {
    await downloadPdf(doc());
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).toContain('ProjectHub');
    expect(escrito).toContain('Relatorio Financeiro');
    expect(escrito).toContain('PRD');
    expect(escrito).toContain('ana@empresa.com.br');
  });

  it('numera as paginas no rodape', async () => {
    await downloadPdf(doc());
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).toMatch(/Pagina 1 de 2/);
    expect(escrito).toMatch(/Pagina 2 de 2/);
  });

  it('reflete os filtros da tela no documento', async () => {
    await downloadPdf(doc({
      meta: { environment: 'PRD', title: 'Riscos', filters: { Status: 'Critico' } },
    }));
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).toMatch(/Filtros:.*Status = Critico/);
  });

  it('comprime o logo ao embutir - sem isso o arquivo passa de 2 MB', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['fake'], { type: 'image/png' }),
    })));
    // FileReader do jsdom resolve o dataURL de forma assincrona
    await downloadPdf(doc());
    expect(addImage).toHaveBeenCalledOnce();
    const args = addImage.mock.calls[0];
    expect(args[7]).toBe('MEDIUM');
  });

  it('gera o documento mesmo sem conseguir carregar o logo', async () => {
    await downloadPdf(doc());
    expect(addImage).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it('informa a secao vazia em vez de deixar a pagina em branco', async () => {
    await downloadPdf(doc({ sheets: [{ name: 'Riscos', rows: [] }] }));
    const escrito = text.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(escrito).toMatch(/Nenhum registro no escopo atual/i);
    expect(autoTable).not.toHaveBeenCalled();
  });
});
