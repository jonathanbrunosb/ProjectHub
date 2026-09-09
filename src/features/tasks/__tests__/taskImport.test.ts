import ExcelJS from 'exceljs';
import { buildTaskImportTemplate, parseTaskImportSheet, taskImportHeaders } from '../taskImport';

const context = {
  projectId: 'project-1',
  existingTasks: [{ code: 'T002', position: 3 }],
  profiles: [{ id: 'profile-1', email: 'ana@empresa.com.br' }],
};

function sheetWith(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tarefas');
  sheet.addRow(taskImportHeaders);
  rows.forEach((row) => sheet.addRow(row));
  return sheet;
}

describe('importação de tarefas por Excel', () => {
  it('gera um modelo xlsx que pode ser aberto novamente pelo importador', async () => {
    const template = await buildTaskImportTemplate();
    const buffer = await template.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);

    const sheet = reopened.getWorksheet('Tarefas')!;
    expect(sheet.getRow(4).values).toEqual([undefined, ...taskImportHeaders]);
    expect(sheet.getCell('E5').dataValidation.type).toBe('list');
    expect(sheet.getCell('K5').dataValidation.type).toBe('decimal');
    expect(parseTaskImportSheet(sheet, context).issues[0].message).toMatch(/nenhuma tarefa/i);
  });

  it('converte uma linha válida e gera o próximo código quando ele fica vazio', () => {
    const sheet = sheetWith([[
      '', 'Preparar relatório', 'Descrição', 'ANA@empresa.com.br', 'Alta', 'Em andamento',
      '01/09/2026', '10/09/2026', '', '2,5', 35, 'Sim', 'Não', 12,
    ]]);

    const result = parseTaskImportSheet(sheet, context);

    expect(result.issues).toEqual([]);
    expect(result.tasks).toEqual([expect.objectContaining({
      project_id: 'project-1',
      code: 'T003',
      title: 'Preparar relatório',
      assignee_id: 'profile-1',
      priority: 'alta',
      status: 'em_andamento',
      start_date: '2026-09-01',
      due_date: '2026-09-10',
      weight: 2.5,
      progress: 35,
      is_milestone: true,
      is_critical: false,
      estimated_hours: 12,
      position: 4,
    })]);
  });

  it('aplica os mesmos padrões do cadastro manual aos campos opcionais', () => {
    const result = parseTaskImportSheet(sheetWith([['T010', 'Tarefa simples']]), context);

    expect(result.issues).toEqual([]);
    expect(result.tasks[0]).toMatchObject({
      code: 'T010', priority: 'media', status: 'nao_iniciada', weight: 1, progress: 0,
      assignee_id: null, is_milestone: false, is_critical: false, estimated_hours: null,
    });
  });

  it('reserva códigos explícitos antes de gerar códigos para linhas vazias', () => {
    const result = parseTaskImportSheet(sheetWith([
      ['', 'Código automático'],
      ['T003', 'Código informado'],
    ]), context);

    expect(result.issues).toEqual([]);
    expect(result.tasks.map((task) => task.code)).toEqual(['T004', 'T003']);
  });

  it('impede toda a importação quando há campos inválidos ou código duplicado', () => {
    const result = parseTaskImportSheet(sheetWith([
      ['T002', '', '', 'inexistente@empresa.com.br', 'Urgente', 'Em andamento', '10/09/2026', '01/09/2026'],
    ]), context);

    expect(result.tasks).toEqual([]);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Título é obrigatório.',
      'Prioridade inválida.',
      'Data de término deve ser igual ou posterior à data de início.',
      'E-mail do responsável não corresponde a um usuário ativo.',
      'Código T002 já existe no projeto ou está repetido no arquivo.',
    ]));
  });

  it('força progresso 100 para tarefas concluídas e preserva a data de conclusão', () => {
    const result = parseTaskImportSheet(sheetWith([[
      'T020', 'Entrega final', '', '', 'Crítica', 'Concluída', '01/09/2026', '08/09/2026', '08/09/2026', 1, 80,
    ]]), context);

    expect(result.issues).toEqual([]);
    expect(result.tasks[0]).toMatchObject({ status: 'concluida', progress: 100, completed_at: '2026-09-08' });
  });

  it('rejeita planilha sem os cabeçalhos do modelo', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dados');
    sheet.addRow(['Nome', 'Prazo']);

    const result = parseTaskImportSheet(sheet, context);

    expect(result.tasks).toEqual([]);
    expect(result.issues[0].message).toMatch(/cabeçalhos não reconhecidos/i);
  });
});
