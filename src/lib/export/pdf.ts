import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from '@/utils/format';
import { environmentFullLabel, type CellType, type ExportDocument, type SheetSpec } from './types';

/**
 * Geracao de PDF no browser, carregada sob demanda (`await import`) para nao
 * pesar no carregamento inicial - mesma estrategia do Excel.
 *
 * PDF e Excel partem da MESMA definicao de secoes (`ExportDocument`), entao os
 * dois arquivos mostram o mesmo conteudo. A diferenca e' de proposito: no Excel
 * a celula guarda o valor nativo para o analista calcular; aqui ela vira texto
 * ja formatado em pt-BR, porque PDF e' para leitura e apresentacao.
 *
 * Nao usamos `window.print()`: o dialogo do navegador acrescenta cabecalho e
 * rodape proprios, varia entre navegadores e nao permite paginacao nem marca
 * corporativa - inadequado para um documento que vai a comite.
 */

const BRAND: [number, number, number] = [30, 58, 95];
const MUTED: [number, number, number] = [110, 120, 135];
const WARN: [number, number, number] = [180, 83, 9];

const MARGIN = 36;
/** Acima disso a tabela nao cabe legivel em retrato. */
const LANDSCAPE_COLUMN_THRESHOLD = 6;

/** Formata para leitura. Diferente do Excel, aqui o valor final e' texto. */
export function formatForPdf(raw: unknown, type: CellType = 'text'): string {
  if (raw == null || raw === '') return '-';
  switch (type) {
    case 'currency': return formatCurrency(Number(raw));
    case 'percent': return formatPercent(Number(raw));
    case 'number': return formatNumber(Number(raw));
    case 'integer': return formatNumber(Number(raw), 0);
    case 'date': return formatDate(String(raw));
    case 'datetime': return formatDateTime(String(raw));
    case 'boolean': return raw ? 'Sim' : 'Nao';
    default: return String(raw);
  }
}

function columnsOf(sheet: SheetSpec) {
  if (sheet.columns?.length) return sheet.columns;
  const first = sheet.rows[0];
  return first ? Object.keys(first).map((key) => ({ key, header: key, type: undefined })) : [];
}

/**
 * O logo vem de `public/`, entao so existe em runtime no browser. Se a busca
 * falhar (teste, offline, arquivo ausente), o documento sai sem ele em vez de
 * falhar a exportacao inteira.
 */
async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/logo-equatorial.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Monta o documento em memoria. Separado do download para poder ser verificado
 * em teste - mesma simetria de `buildWorkbook` no modulo do Excel.
 */
export async function buildPdf(spec: ExportDocument): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, autoTableModule, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogo(),
  ]);
  const autoTable = autoTableModule.default;

  const widest = Math.max(0, ...spec.sheets.map((s) => columnsOf(s).length));
  const doc = new jsPDF({
    orientation: widest > LANDSCAPE_COLUMN_THRESHOLD ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = MARGIN;

  // ---- Cabecalho institucional -------------------------------------------
  if (logo) {
    try {
      // 4,11:1 e' a proporcao do logo oficial - fixar os dois lados evita distorcao.
      // A compressao e' obrigatoria: sem ela o jsPDF embute o PNG como bitmap cru
      // e o relatorio sai com 2 MB em vez de 54 KB, inviabilizando envio por e-mail.
      // MEDIUM foi medido como o melhor equilibrio (97 ms, mesmo custo do FAST).
      doc.addImage(logo, 'PNG', MARGIN, cursorY, 74, 18, undefined, 'MEDIUM');
    } catch { /* formato inesperado: segue sem o logo */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('ProjectHub', MARGIN + (logo ? 84 : 0), cursorY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Gestao Integrada de Projetos', MARGIN + (logo ? 84 : 0), cursorY + 17);

  cursorY += 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...BRAND);
  doc.text(spec.meta.title, MARGIN, cursorY);

  cursorY += 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const info = [
    `Ambiente: ${environmentFullLabel[spec.meta.environment]}`,
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    spec.meta.userEmail ? `Por ${spec.meta.userEmail}` : null,
  ].filter(Boolean).join('   ·   ');
  doc.text(info, MARGIN, cursorY);

  const filters = Object.entries(spec.meta.filters ?? {}).filter(([, v]) => v != null && v !== '');
  if (filters.length > 0) {
    cursorY += 11;
    doc.text(
      `Filtros: ${filters.map(([k, v]) => `${k} = ${String(v)}`).join('   ·   ')}`,
      MARGIN, cursorY, { maxWidth: pageWidth - MARGIN * 2 },
    );
  }

  // Em QA o documento precisa se identificar: relatorio de teste nunca deve
  // circular como numero oficial.
  if (spec.meta.environment === 'QA') {
    cursorY += 16;
    doc.setFillColor(254, 243, 199);
    doc.rect(MARGIN, cursorY - 9, pageWidth - MARGIN * 2, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WARN);
    doc.text('DADOS DE QA (AMBIENTE DE TESTES) - NAO UTILIZAR COMO INFORMACAO OFICIAL', MARGIN + 6, cursorY + 2);
    doc.setFont('helvetica', 'normal');
  }

  cursorY += 20;

  // ---- Secoes -------------------------------------------------------------
  for (const sheet of spec.sheets) {
    const columns = columnsOf(sheet);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND);
    doc.text(sheet.name, MARGIN, cursorY + 14);
    cursorY += 20;

    if (sheet.rows.length === 0 || columns.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text('Nenhum registro no escopo atual.', MARGIN, cursorY + 10);
      cursorY += 26;
      continue;
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 14 },
      head: [columns.map((c) => c.header)],
      body: sheet.rows.map((row) => columns.map((c) => formatForPdf(row[c.key], c.type))),
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      columnStyles: Object.fromEntries(columns.map((c, i) => [
        i,
        ['currency', 'percent', 'number', 'integer'].includes(c.type ?? '')
          ? { halign: 'right' as const }
          : {},
      ])),
      // Repete o cabecalho a cada pagina: tabela longa continua legivel.
      showHead: 'everyPage',
    });

    const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursorY = (table?.finalY ?? cursorY) + 24;
  }

  // ---- Rodape em todas as paginas ----------------------------------------
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `ProjectHub  ·  ${spec.meta.title}  ·  ${spec.meta.environment}`,
      MARGIN, pageHeight - 18,
    );
    doc.text(`Pagina ${page} de ${total}`, pageWidth - MARGIN, pageHeight - 18, { align: 'right' });
  }

  return doc;
}

export async function downloadPdf(spec: ExportDocument): Promise<void> {
  const doc = await buildPdf(spec);
  doc.save(spec.fileName);
}
