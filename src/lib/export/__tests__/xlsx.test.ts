import { describe, it, expect } from 'vitest';
import {
  buildWorkbook, buildFileName, inferCellType, sanitizeFileName, sanitizeSheetName,
  type WorkbookSpec,
} from '../xlsx';

const meta = { environment: 'PRD' as const, title: 'Relatorio Financeiro', userEmail: 'ana@empresa.com.br' };

function spec(overrides: Partial<WorkbookSpec> = {}): WorkbookSpec {
  return {
    fileName: 'teste.xlsx',
    meta,
    sheets: [{
      name: 'Projetos',
      columns: [
        { key: 'projeto', header: 'Projeto', type: 'text' },
        { key: 'orcamento', header: 'Orcamento', type: 'currency' },
        { key: 'avanco', header: 'Avanco', type: 'percent' },
        { key: 'prazo', header: 'Prazo', type: 'date' },
      ],
      rows: [
        { projeto: 'IFRS 18', orcamento: 125450.22, avanco: 78.4, prazo: '2026-09-05' },
        { projeto: 'Reforma Tributaria', orcamento: 89000, avanco: 42, prazo: '2026-12-01' },
      ],
    }],
    ...overrides,
  };
}

describe('nome de arquivo e de aba', () => {
  it('carimba ambiente e data no nome do arquivo', () => {
    const name = buildFileName('Portfolio de Projetos', 'PRD', new Date('2026-09-05T12:00:00Z'));
    expect(name).toBe('portfolio_de_projetos_PRD_2026-09-05.xlsx');
  });

  it('remove acentos e caracteres que o sistema de arquivos rejeita', () => {
    expect(sanitizeFileName('Relatório: Riscos/Ações*')).toBe('relatorio_riscos_acoes');
  });

  it('respeita o limite de 31 caracteres e os caracteres proibidos do Excel', () => {
    const name = sanitizeSheetName('Planos de acao / revisao [2026]: consolidado');
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it('usa o fallback quando o nome fica vazio apos a limpeza', () => {
    expect(sanitizeSheetName('///')).toBe('Dados');
  });
});

describe('deducao de tipo', () => {
  it('distingue inteiro, decimal, data, datetime, booleano e texto', () => {
    expect(inferCellType([1, 2, 3])).toBe('integer');
    expect(inferCellType([1.5, 2])).toBe('number');
    expect(inferCellType(['2026-09-05', '2026-01-01'])).toBe('date');
    expect(inferCellType(['2026-09-05T10:32:41Z'])).toBe('datetime');
    expect(inferCellType([true, false])).toBe('boolean');
    expect(inferCellType(['IFRS 18', 'SAP'])).toBe('text');
  });

  it('trata coluna vazia como texto em vez de quebrar', () => {
    expect(inferCellType([null, undefined, ''])).toBe('text');
  });
});

describe('workbook gerado', () => {
  it('cria a aba de dados com cabecalhos e a contagem de linhas correta', async () => {
    const wb = await buildWorkbook(spec());
    const ws = wb.getWorksheet('Projetos');
    expect(ws).toBeDefined();
    // 1 cabecalho + 2 registros
    expect(ws!.rowCount).toBe(3);
    expect(ws!.columnCount).toBe(4);
    expect(ws!.getRow(1).values).toEqual([undefined, 'Projeto', 'Orcamento', 'Avanco', 'Prazo']);
  });

  it('preserva os tipos: moeda como numero, percentual como fracao, data como Date', async () => {
    const wb = await buildWorkbook(spec());
    const row = wb.getWorksheet('Projetos')!.getRow(2);

    expect(row.getCell(2).value).toBe(125450.22);
    expect(typeof row.getCell(2).value).toBe('number');

    // 78,4% e' gravado como 0,784 - representacao nativa do Excel, permite media
    expect(row.getCell(3).value).toBeCloseTo(0.784, 5);

    expect(row.getCell(4).value).toBeInstanceOf(Date);
  });

  it('aplica formato de moeda, percentual e data nas colunas', async () => {
    const ws = (await buildWorkbook(spec())).getWorksheet('Projetos')!;
    expect(ws.getColumn(2).numFmt).toBe('R$ #,##0.00');
    expect(ws.getColumn(3).numFmt).toBe('0.0%');
    expect(ws.getColumn(4).numFmt).toBe('dd/mm/yyyy');
  });

  it('congela o cabecalho e liga o filtro automatico', async () => {
    const ws = (await buildWorkbook(spec())).getWorksheet('Projetos')!;
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toEqual({ from: { row: 1, column: 1 }, to: { row: 1, column: 4 } });
  });

  it('destaca o cabecalho em negrito', async () => {
    const ws = (await buildWorkbook(spec())).getWorksheet('Projetos')!;
    expect(ws.getRow(1).font?.bold).toBe(true);
  });

  it('calcula larguras dentro de um intervalo legivel', async () => {
    const ws = (await buildWorkbook(spec())).getWorksheet('Projetos')!;
    for (const col of [1, 2, 3, 4]) {
      const width = ws.getColumn(col).width ?? 0;
      expect(width).toBeGreaterThanOrEqual(10);
      expect(width).toBeLessThanOrEqual(46);
    }
  });

  it('registra ambiente, titulo e usuario na aba de informacoes', async () => {
    const wb = await buildWorkbook(spec());
    const info = wb.getWorksheet('Informacoes');
    expect(info).toBeDefined();
    const texto = JSON.stringify(info!.getSheetValues());
    expect(texto).toContain('PRD');
    expect(texto).toContain('Relatorio Financeiro');
    expect(texto).toContain('ana@empresa.com.br');
  });

  it('avisa dentro da planilha quando os dados sao de QA', async () => {
    const wb = await buildWorkbook(spec({ meta: { ...meta, environment: 'QA' } }));
    const texto = JSON.stringify(wb.getWorksheet('Informacoes')!.getSheetValues());
    expect(texto).toContain('QA');
    expect(texto).toMatch(/nao utilizar como informacao oficial/i);
  });

  it('reflete os filtros da tela na aba de informacoes', async () => {
    const wb = await buildWorkbook(spec({
      meta: { ...meta, filters: { Status: 'Critico', Empresa: 'EQTL AL' } },
    }));
    const texto = JSON.stringify(wb.getWorksheet('Informacoes')!.getSheetValues());
    expect(texto).toContain('Critico');
    expect(texto).toContain('EQTL AL');
  });

  it('monta uma aba por secao do relatorio', async () => {
    const wb = await buildWorkbook(spec({
      sheets: [
        { name: 'Resumo', rows: [{ Indicador: 'Projetos', Valor: 6 }] },
        { name: 'Projetos', rows: [{ Codigo: 'PRJ-1' }] },
        { name: 'Riscos', rows: [{ Codigo: 'RSK-1' }] },
      ],
    }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Informacoes', 'Resumo', 'Projetos', 'Riscos']);
  });

  it('nao quebra quando uma secao vem sem registros', async () => {
    const wb = await buildWorkbook(spec({ sheets: [{ name: 'Riscos', rows: [] }] }));
    const ws = wb.getWorksheet('Riscos')!;
    expect(ws.rowCount).toBe(1);
    expect(String(ws.getRow(1).getCell(1).value)).toMatch(/nenhum registro/i);
    // sem linhas nao faz sentido oferecer filtro
    expect(ws.autoFilter).toBeFalsy();
  });

  it('gera um arquivo xlsx valido (assinatura ZIP do formato Office)', async () => {
    const wb = await buildWorkbook(spec());
    const buffer = await wb.xlsx.writeBuffer();
    const head = new Uint8Array(buffer as ArrayBuffer).slice(0, 2);
    expect(Array.from(head)).toEqual([0x50, 0x4b]); // "PK"
    expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });
});
