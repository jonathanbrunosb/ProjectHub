import type { Cell, Worksheet } from 'exceljs';
import type { Profile, Task, Priority, TaskStatus } from '@/types/domain';
import type { CreateTaskInput } from '@/services/tasks';

export const TASK_IMPORT_FILE_NAME = 'modelo-importacao-tarefas.xlsx';
export const TASK_IMPORT_MAX_ROWS = 500;

export const taskImportHeaders = [
  'Código', 'Título', 'Descrição', 'E-mail do responsável', 'Prioridade', 'Status',
  'Data de início', 'Data de término', 'Data de conclusão', 'Peso', 'Progresso (%)',
  'Marco', 'Crítica', 'Horas estimadas',
] as const;

type HeaderKey =
  | 'code' | 'title' | 'description' | 'assigneeEmail' | 'priority' | 'status'
  | 'startDate' | 'dueDate' | 'completedAt' | 'weight' | 'progress'
  | 'isMilestone' | 'isCritical' | 'estimatedHours';

export interface TaskImportIssue {
  row: number;
  message: string;
}

export interface TaskImportResult {
  tasks: CreateTaskInput[];
  issues: TaskImportIssue[];
}

export interface TaskImportContext {
  projectId: string;
  existingTasks: Pick<Task, 'code' | 'position'>[];
  profiles: Pick<Profile, 'id' | 'email'>[];
}

const headerKeys: Record<string, HeaderKey> = {
  codigo: 'code',
  titulo: 'title',
  descricao: 'description',
  'e-mail do responsavel': 'assigneeEmail',
  'email do responsavel': 'assigneeEmail',
  prioridade: 'priority',
  status: 'status',
  'data de inicio': 'startDate',
  'data de termino': 'dueDate',
  'data de conclusao': 'completedAt',
  peso: 'weight',
  'progresso (%)': 'progress',
  progresso: 'progress',
  marco: 'isMilestone',
  critica: 'isCritical',
  'horas estimadas': 'estimatedHours',
};

const priorityValues: Record<string, Priority> = {
  baixa: 'baixa', media: 'media', alta: 'alta', critica: 'critica',
};

const statusValues: Record<string, TaskStatus> = {
  'nao iniciada': 'nao_iniciada',
  nao_iniciada: 'nao_iniciada',
  'em andamento': 'em_andamento',
  em_andamento: 'em_andamento',
  bloqueada: 'bloqueada',
  'em revisao': 'em_revisao',
  em_revisao: 'em_revisao',
  concluida: 'concluida',
  cancelada: 'cancelada',
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cellValue(cell: Cell): unknown {
  const value = cell.value;
  if (value == null || value instanceof Date || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }
  if (typeof value === 'object' && 'result' in value) return value.result;
  if (typeof value === 'object' && 'text' in value) return value.text;
  return cell.text;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const source = text(value).replace(/\s/g, '');
  const normalized = source.includes(',') ? source.replace(/\./g, '').replace(',', '.') : source;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, '0'), String(value.getUTCDate()).padStart(2, '0')].join('-');
  }
  const source = text(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  if (!match) return null;
  const [year, month, day] = source.includes('/') ? [match[3], match[2], match[1]] : [match[1], match[2], match[3]];
  const candidate = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    Number.isNaN(candidate.getTime())
    || candidate.getUTCFullYear() !== Number(year)
    || candidate.getUTCMonth() + 1 !== Number(month)
    || candidate.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function booleanValue(value: unknown): boolean | null {
  if (value == null || value === '') return false;
  if (typeof value === 'boolean') return value;
  const normalized = normalize(value);
  if (['sim', 'true', '1'].includes(normalized)) return true;
  if (['nao', 'false', '0'].includes(normalized)) return false;
  return null;
}

function findHeaders(sheet: Worksheet): { row: number; columns: Map<HeaderKey, number> } | null {
  for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
    const columns = new Map<HeaderKey, number>();
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const key = headerKeys[normalize(cell.text)];
      if (key && !columns.has(key)) columns.set(key, columnNumber);
    });
    if (columns.size === taskImportHeaders.length) return { row: rowNumber, columns };
  }
  return null;
}

function maxTaskSequence(tasks: Pick<Task, 'code'>[]): number {
  return tasks.reduce((max, task) => {
    const match = /^T(\d+)$/i.exec(task.code.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

export function parseTaskImportSheet(sheet: Worksheet, context: TaskImportContext): TaskImportResult {
  const headers = findHeaders(sheet);
  if (!headers) {
    return { tasks: [], issues: [{ row: 0, message: 'Cabeçalhos não reconhecidos. Use o modelo fornecido pelo sistema.' }] };
  }

  const profilesByEmail = new Map(context.profiles.map((profile) => [normalize(profile.email), profile.id]));
  const usedCodes = new Set(context.existingTasks.map((task) => normalize(task.code)));
  const fileCodeCounts = new Map<string, number>();
  let sequence = maxTaskSequence(context.existingTasks);
  const basePosition = context.existingTasks.reduce((max, task) => Math.max(max, task.position), -1) + 1;
  const tasks: CreateTaskInput[] = [];
  const issues: TaskImportIssue[] = [];
  const populatedRows: number[] = [];

  for (let rowNumber = headers.row + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = [...headers.columns.entries()].map(([key, column]) => ({ key, value: cellValue(row.getCell(column)) }));
    if (!values.some(({ value }) => text(value) !== '')) continue;
    populatedRows.push(rowNumber);
    const explicitCode = normalize(values.find(({ key }) => key === 'code')?.value);
    if (explicitCode) fileCodeCounts.set(explicitCode, (fileCodeCounts.get(explicitCode) ?? 0) + 1);
  }

  if (populatedRows.length > TASK_IMPORT_MAX_ROWS) {
    return {
      tasks: [],
      issues: [{ row: 0, message: `O arquivo excede o limite de ${TASK_IMPORT_MAX_ROWS} tarefas por importação.` }],
    };
  }

  for (const rowNumber of populatedRows) {
    const row = sheet.getRow(rowNumber);
    const get = (key: HeaderKey): unknown => {
      const column = headers.columns.get(key);
      return column ? cellValue(row.getCell(column)) : null;
    };
    const rowIssues: string[] = [];
    const title = text(get('title'));
    if (!title) rowIssues.push('Título é obrigatório.');

    const priorityRaw = get('priority');
    const priority = priorityRaw == null || text(priorityRaw) === '' ? 'media' : priorityValues[normalize(priorityRaw)];
    if (!priority) rowIssues.push('Prioridade inválida.');

    const statusRaw = get('status');
    const status = statusRaw == null || text(statusRaw) === '' ? 'nao_iniciada' : statusValues[normalize(statusRaw)];
    if (!status) rowIssues.push('Status inválido.');

    const parseDate = (key: HeaderKey, label: string) => {
      const raw = get(key);
      const parsed = isoDate(raw);
      if (raw != null && text(raw) !== '' && !parsed) rowIssues.push(`${label} inválida; use dd/mm/aaaa.`);
      return parsed;
    };
    const startDate = parseDate('startDate', 'Data de início');
    const dueDate = parseDate('dueDate', 'Data de término');
    const completedAt = parseDate('completedAt', 'Data de conclusão');
    if (startDate && dueDate && dueDate < startDate) rowIssues.push('Data de término deve ser igual ou posterior à data de início.');
    if (completedAt && status !== 'concluida') rowIssues.push('Data de conclusão só pode ser informada para tarefa concluída.');

    const weightRaw = get('weight');
    const weight = weightRaw == null || text(weightRaw) === '' ? 1 : numberValue(weightRaw);
    if (weight == null || weight <= 0) rowIssues.push('Peso deve ser maior que zero.');

    const progressRaw = get('progress');
    const progress = progressRaw == null || text(progressRaw) === '' ? 0 : numberValue(progressRaw);
    if (progress == null || progress < 0 || progress > 100) rowIssues.push('Progresso deve estar entre 0 e 100.');

    const estimatedRaw = get('estimatedHours');
    const estimatedHours = estimatedRaw == null || text(estimatedRaw) === '' ? null : numberValue(estimatedRaw);
    if (estimatedRaw != null && text(estimatedRaw) !== '' && (estimatedHours == null || estimatedHours < 0)) {
      rowIssues.push('Horas estimadas deve ser zero ou um número positivo.');
    }

    const isMilestone = booleanValue(get('isMilestone'));
    if (isMilestone == null) rowIssues.push('Marco deve ser Sim ou Não.');
    const isCritical = booleanValue(get('isCritical'));
    if (isCritical == null) rowIssues.push('Crítica deve ser Sim ou Não.');

    const assigneeEmail = normalize(get('assigneeEmail'));
    const assigneeId = assigneeEmail ? profilesByEmail.get(assigneeEmail) : null;
    if (assigneeEmail && !assigneeId) rowIssues.push('E-mail do responsável não corresponde a um usuário ativo.');

    let code = text(get('code')).toUpperCase();
    if (code && (usedCodes.has(normalize(code)) || (fileCodeCounts.get(normalize(code)) ?? 0) > 1)) {
      rowIssues.push(`Código ${code} já existe no projeto ou está repetido no arquivo.`);
    }

    if (rowIssues.length > 0) {
      issues.push(...rowIssues.map((message) => ({ row: rowNumber, message })));
      continue;
    }

    if (!code) {
      do {
        sequence += 1;
        code = `T${String(sequence).padStart(3, '0')}`;
      } while (usedCodes.has(normalize(code)) || fileCodeCounts.has(normalize(code)));
    }
    usedCodes.add(normalize(code));

    tasks.push({
      project_id: context.projectId,
      code,
      title,
      description: text(get('description')) || null,
      assignee_id: assigneeId ?? null,
      priority,
      status,
      start_date: startDate,
      due_date: dueDate,
      completed_at: status === 'concluida' ? completedAt : null,
      weight: weight as number,
      progress: status === 'concluida' ? 100 : progress as number,
      is_milestone: isMilestone as boolean,
      is_critical: isCritical as boolean,
      estimated_hours: estimatedHours,
      position: basePosition + tasks.length,
    });
  }

  if (populatedRows.length === 0) issues.push({ row: 0, message: 'Nenhuma tarefa preenchida foi encontrada no arquivo.' });
  return { tasks, issues };
}

export async function parseTaskImportFile(file: File, context: TaskImportContext): Promise<TaskImportResult> {
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.xlsx')) {
    throw new Error('Selecione um arquivo no formato .xlsx.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 5 MB.');

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('Tarefas') ?? workbook.worksheets[0];
  if (!sheet) throw new Error('O arquivo não possui nenhuma planilha.');
  return parseTaskImportSheet(sheet, context);
}

export async function buildTaskImportTemplate(): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProjectHub';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Tarefas', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  const lists = workbook.addWorksheet('Listas');
  lists.state = 'veryHidden';
  lists.getColumn(1).values = ['Baixa', 'Média', 'Alta', 'Crítica'];
  lists.getColumn(2).values = ['Não iniciada', 'Em andamento', 'Bloqueada', 'Em revisão', 'Concluída', 'Cancelada'];
  lists.getColumn(3).values = ['Não', 'Sim'];

  sheet.mergeCells('A1:N1');
  sheet.getCell('A1').value = 'Modelo de importação de tarefas';
  sheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF172033' } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:N2');
  sheet.getCell('A2').value = 'Preencha uma tarefa por linha. Título é obrigatório. Código vazio será gerado automaticamente. Não altere os cabeçalhos.';
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF526071' } };
  sheet.getCell('A2').alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 32;

  sheet.mergeCells('A3:N3');
  sheet.getCell('A3').value = 'Datas: dd/mm/aaaa. Responsável: use o e-mail de um usuário ativo. Prioridade, status e campos Sim/Não possuem listas.';
  sheet.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: 'FF526071' } };

  sheet.getRow(4).values = [...taskImportHeaders];
  sheet.getRow(4).height = 32;
  sheet.getRow(4).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  const widths = [14, 34, 42, 30, 14, 18, 16, 16, 18, 10, 15, 11, 11, 18];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  for (let rowNumber = 5; rowNumber <= 204; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 20;
    for (let columnNumber = 1; columnNumber <= taskImportHeaders.length; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF172033' } };
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E9F0' } } };
    }
    row.getCell(5).dataValidation = { type: 'list', allowBlank: true, formulae: ['Listas!$A$1:$A$4'] };
    row.getCell(6).dataValidation = { type: 'list', allowBlank: true, formulae: ['Listas!$B$1:$B$6'] };
    row.getCell(12).dataValidation = { type: 'list', allowBlank: true, formulae: ['Listas!$C$1:$C$2'] };
    row.getCell(13).dataValidation = { type: 'list', allowBlank: true, formulae: ['Listas!$C$1:$C$2'] };
    row.getCell(10).dataValidation = { type: 'decimal', operator: 'greaterThan', allowBlank: true, formulae: [0] };
    row.getCell(11).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100] };
    row.getCell(14).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0] };
  }

  ['G', 'H', 'I'].forEach((column) => { sheet.getColumn(column).numFmt = 'dd/mm/yyyy'; });
  ['J', 'K', 'N'].forEach((column) => { sheet.getColumn(column).numFmt = '0.00'; });
  sheet.autoFilter = { from: 'A4', to: 'N204' };
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  return workbook;
}

export async function downloadTaskImportTemplate(): Promise<void> {
  const workbook = await buildTaskImportTemplate();
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = TASK_IMPORT_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
