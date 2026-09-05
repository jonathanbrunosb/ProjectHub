import { parseDateOnly } from '@/utils/format';
import type { Environment } from '@/lib/supabase/client';
import { environmentFullLabel, type CellType, type ExportDocument, type SheetColumn } from './types';
import { buildExportFileName } from './fileName';

export { sanitizeFileName } from './fileName';

/** Compatibilidade: os chamadores existentes pedem sempre .xlsx aqui. */
export function buildFileName(base: string, environment: Environment, date = new Date()): string {
  return buildExportFileName(base, environment, 'xlsx', date);
}

export type { CellType, SheetColumn, SheetSpec, ExportDocument } from './types';
/** Mantido pelo nome antigo para nao quebrar quem ja consumia a API. */
export type WorkbookSpec = ExportDocument;

/**
 * Geracao de planilhas Excel (.xlsx) no browser.
 *
 * O ExcelJS e' carregado sob demanda (`await import`), entao ele fica em um
 * chunk proprio: quem nunca exporta nada nao paga o custo no carregamento
 * inicial da aplicacao.
 *
 * Por que ExcelJS e nao SheetJS: a versao community do `xlsx` nao aplica
 * estilos (negrito de cabecalho, largura, formato de numero sao recursos da
 * versao paga). Sem isso o arquivo seria um CSV com outra extensao, que e'
 * exatamente o que esta melhoria queria eliminar.
 */

const numberFormats: Record<CellType, string | undefined> = {
  text: undefined,
  boolean: undefined,
  integer: '#,##0',
  number: '#,##0.00',
  currency: 'R$ #,##0.00',
  percent: '0.0%',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Deduz o tipo da coluna a partir dos valores. Usado quando quem chama nao
 * declara os tipos (tabelas genericas). Percentual e moeda nao sao deduzidos:
 * `12,5` sozinho nao diz se e' porcentagem, reais ou horas - quem conhece o
 * dominio declara explicitamente.
 */
export function inferCellType(values: unknown[]): CellType {
  const sample = values.filter((v) => v != null && v !== '');
  if (sample.length === 0) return 'text';
  if (sample.every((v) => typeof v === 'boolean')) return 'boolean';
  if (sample.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return sample.every((v) => Number.isInteger(v)) ? 'integer' : 'number';
  }
  if (sample.every((v) => typeof v === 'string' && ISO_DATE.test(v))) return 'date';
  if (sample.every((v) => typeof v === 'string' && ISO_DATETIME.test(v))) return 'datetime';
  return 'text';
}

export function columnsFromRows(rows: Record<string, unknown>[]): SheetColumn[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((key) => ({
    key,
    header: key,
    type: inferCellType(rows.map((r) => r[key])),
  }));
}

/** O Excel recusa abas com mais de 31 caracteres ou com : \ / ? * [ ] */
export function sanitizeSheetName(name: string, fallback = 'Dados'): string {
  const clean = name.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, 31);
}

function columnWidth(column: SheetColumn, rows: Record<string, unknown>[]): number {
  if (column.width) return column.width;
  const sample = rows.slice(0, 200).map((r) => {
    const v = r[column.key];
    if (v == null) return 0;
    if (column.type === 'currency') return 14;
    if (column.type === 'date') return 10;
    if (column.type === 'datetime') return 16;
    if (column.type === 'percent') return 8;
    return String(v).length;
  });
  const longest = Math.max(column.header.length, ...sample, 0);
  return Math.min(46, Math.max(10, longest + 2));
}

/**
 * Converte o valor para o que o Excel entende como aquele tipo. Percentual e'
 * gravado como fracao (0,784 com formato 0.0%), que e' a representacao nativa:
 * assim media e soma percentual funcionam dentro da planilha.
 */
function toCellValue(raw: unknown, type: CellType): string | number | boolean | Date | null {
  if (raw == null || raw === '') return null;
  switch (type) {
    case 'percent': {
      const n = Number(raw);
      return Number.isFinite(n) ? n / 100 : null;
    }
    case 'currency':
    case 'number':
    case 'integer': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date': {
      const d = raw instanceof Date ? raw : parseDateOnly(String(raw));
      return d && !Number.isNaN(d.getTime()) ? d : null;
    }
    case 'datetime': {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : String(raw) === 'true';
    default:
      return String(raw);
  }
}

/**
 * Monta o workbook em memoria. Separado do download para poder ser verificado
 * em teste (linhas, tipos, formatos) sem depender de DOM.
 */
export async function buildWorkbook(spec: ExportDocument): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProjectHub';
  workbook.created = new Date();

  addInfoSheet(workbook, spec);

  const used = new Set<string>(['Informacoes']);
  for (const sheet of spec.sheets) {
    let name = sanitizeSheetName(sheet.name);
    let i = 2;
    while (used.has(name)) name = sanitizeSheetName(`${sheet.name} ${i++}`);
    used.add(name);

    const ws = workbook.addWorksheet(name);
    const columns = sheet.columns?.length ? sheet.columns : columnsFromRows(sheet.rows);
    if (columns.length === 0) {
      ws.addRow(['Nenhum registro no escopo atual.']);
      continue;
    }

    ws.columns = columns.map((c) => ({
      key: c.key,
      header: c.header,
      width: columnWidth(c, sheet.rows),
    }));

    for (const row of sheet.rows) {
      const values: Record<string, unknown> = {};
      for (const c of columns) values[c.key] = toCellValue(row[c.key], c.type ?? 'text');
      ws.addRow(values);
    }

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 20;

    columns.forEach((c, idx) => {
      const fmt = numberFormats[c.type ?? 'text'];
      if (fmt) ws.getColumn(idx + 1).numFmt = fmt;
    });

    // Congela o cabecalho e liga o filtro: o usuario continua a analise no Excel.
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };
    }
  }

  return workbook;
}

/**
 * Monta e dispara o download. Lanca em caso de falha para que a tela possa
 * exibir a mensagem de erro e sair do estado de carregamento.
 */
export async function downloadWorkbook(spec: ExportDocument): Promise<void> {
  const workbook = await buildWorkbook(spec);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), spec.fileName);
}

function addInfoSheet(workbook: import('exceljs').Workbook, spec: ExportDocument) {
  const ws = workbook.addWorksheet('Informacoes');
  ws.columns = [{ key: 'campo', width: 24 }, { key: 'valor', width: 62 }];

  const lines: [string, string][] = [
    ['Relatorio', spec.meta.title],
    ['Ambiente', environmentFullLabel[spec.meta.environment]],
    ['Data de geracao', new Date().toLocaleString('pt-BR')],
  ];
  if (spec.meta.userEmail) lines.push(['Usuario', spec.meta.userEmail]);
  for (const [k, v] of Object.entries(spec.meta.filters ?? {})) {
    if (v != null && v !== '') lines.push([`Filtro: ${k}`, String(v)]);
  }
  lines.push(['Registros', String(spec.sheets.reduce((sum, s) => sum + s.rows.length, 0))]);

  ws.addRow(['ProjectHub - Gestao Integrada de Projetos']).font = { bold: true, size: 13 };
  ws.addRow([]);
  for (const [campo, valor] of lines) {
    const row = ws.addRow({ campo, valor });
    row.getCell(1).font = { bold: true };
  }

  if (spec.meta.environment === 'QA') {
    ws.addRow([]);
    const warn = ws.addRow(['ATENCAO: dados de QA (ambiente de testes). Nao utilizar como informacao oficial.']);
    warn.font = { bold: true, color: { argb: 'FFB45309' } };
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
