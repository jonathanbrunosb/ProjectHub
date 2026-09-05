import type { SheetSpec } from '@/lib/export/xlsx';
import { listProjectOverview } from '@/services/projects';
import { listRisks, listActionPlans } from '@/services/risks';
import { listTasks, listMilestones } from '@/services/tasks';
import { listCapacity, listDecisions, listAuditLog } from '@/services/governance';
import { listAllTaskGoalScores } from '@/services/goalIndicators';
import { portfolioKpis, currentMonthKey, teamCapacity } from '@/features/dashboard/selectors';
import { daysBetween } from '@/utils/format';
import { auditActionLabel, projectStatusLabel } from '@/utils/domain-labels';

/**
 * Monta as abas de cada relatorio.
 *
 * Usa exatamente os mesmos servicos que a tela: a RLS do PostgreSQL continua
 * sendo o filtro de autorizacao, entao a planilha nunca contem uma linha que o
 * usuario nao poderia ver na interface.
 *
 * Relatorios com mais de uma dimensao viram workbooks de varias abas em vez de
 * uma unica planilha larga - e o formato que o analista consegue usar.
 */

const overdue = (date: string | null | undefined) =>
  date ? (daysBetween(new Date(), date) ?? 0) < 0 : false;

const daysLate = (date: string | null | undefined) =>
  Math.abs(daysBetween(new Date(), date ?? null) ?? 0);

function projectSheet(list: Awaited<ReturnType<typeof listProjectOverview>>): SheetSpec {
  return {
    name: 'Projetos',
    columns: [
      { key: 'codigo', header: 'Codigo', type: 'text' },
      { key: 'projeto', header: 'Projeto', type: 'text' },
      { key: 'categoria', header: 'Categoria', type: 'text' },
      { key: 'status', header: 'Status', type: 'text' },
      { key: 'saude', header: 'Saude', type: 'text' },
      { key: 'owner', header: 'Owner', type: 'text' },
      { key: 'sponsor', header: 'Sponsor', type: 'text' },
      { key: 'planejado', header: 'Avanco planejado', type: 'percent' },
      { key: 'realizado', header: 'Avanco realizado', type: 'percent' },
      { key: 'desvio', header: 'Desvio (p.p.)', type: 'number' },
      { key: 'orcamento', header: 'Orcamento', type: 'currency' },
      { key: 'atual', header: 'Realizado', type: 'currency' },
      { key: 'forecast', header: 'Forecast', type: 'currency' },
      { key: 'desvioFin', header: 'Desvio financeiro', type: 'percent' },
      { key: 'riscos', header: 'Riscos criticos', type: 'integer' },
      { key: 'proxima', header: 'Proxima entrega', type: 'date' },
      { key: 'alvo', header: 'Data-alvo', type: 'date' },
    ],
    // Projetos sem o modulo financeiro ativo ficam com as colunas financeiras
    // em branco, nunca em zero - zero pareceria "orcamento zerado", quando na
    // verdade o financeiro nem se aplica a esse projeto.
    rows: list.map((p) => ({
      codigo: p.code, projeto: p.name, categoria: p.category,
      status: projectStatusLabel[p.status], saude: p.health,
      owner: p.owner_name ?? '', sponsor: p.sponsor_name ?? '',
      planejado: Number(p.progress_planned), realizado: Number(p.progress_actual),
      desvio: Number(p.progress_deviation),
      orcamento: p.financial_effective_enabled ? Number(p.budget) : '',
      atual: p.financial_effective_enabled ? Number(p.actual) : '',
      forecast: p.financial_effective_enabled ? Number(p.forecast) : '',
      desvioFin: p.financial_effective_enabled ? Number(p.forecast_variance_pct) : '',
      riscos: Number(p.critical_risks),
      proxima: p.next_milestone_date ?? '', alvo: p.target_date ?? '',
    })),
  };
}

function riskSheet(risks: Awaited<ReturnType<typeof listRisks>>, name = 'Riscos'): SheetSpec {
  return {
    name,
    columns: [
      { key: 'projeto', header: 'Projeto', type: 'text' },
      { key: 'id', header: 'ID', type: 'text' },
      { key: 'tipo', header: 'Tipo', type: 'text' },
      { key: 'titulo', header: 'Titulo', type: 'text' },
      { key: 'categoria', header: 'Categoria', type: 'text' },
      { key: 'probabilidade', header: 'Probabilidade', type: 'integer' },
      { key: 'impacto', header: 'Impacto', type: 'integer' },
      { key: 'score', header: 'Score', type: 'integer' },
      { key: 'estrategia', header: 'Estrategia', type: 'text' },
      { key: 'responsavel', header: 'Responsavel', type: 'text' },
      { key: 'prazo', header: 'Prazo', type: 'date' },
      { key: 'status', header: 'Status', type: 'text' },
      { key: 'revisao', header: 'Ultima revisao', type: 'date' },
      { key: 'plano', header: 'Plano de mitigacao', type: 'text' },
    ],
    rows: risks.map((r) => ({
      projeto: r.project?.code ?? '', id: r.code, tipo: r.kind, titulo: r.title,
      categoria: r.category ?? '', probabilidade: r.probability, impacto: r.impact, score: r.score,
      estrategia: r.strategy ?? '', responsavel: r.owner?.full_name ?? '',
      prazo: r.due_date ?? '', status: r.status, revisao: r.last_review_at ?? '',
      plano: r.mitigation_plan ?? '',
    })),
  };
}

function milestoneSheet(milestones: Awaited<ReturnType<typeof listMilestones>>): SheetSpec {
  return {
    name: 'Marcos',
    columns: [
      { key: 'projeto', header: 'Projeto', type: 'text' },
      { key: 'marco', header: 'Marco', type: 'text' },
      { key: 'prazo', header: 'Prazo', type: 'date' },
      { key: 'concluido', header: 'Concluido em', type: 'date' },
      { key: 'situacao', header: 'Situacao', type: 'text' },
    ],
    rows: milestones.map((m) => ({
      projeto: m.project?.code ?? '', marco: m.name, prazo: m.due_date,
      concluido: m.completed_at ?? '',
      situacao: m.completed_at ? 'Concluido' : overdue(m.due_date) ? 'Vencido' : 'Previsto',
    })),
  };
}

function kpiSheet(list: Awaited<ReturnType<typeof listProjectOverview>>): SheetSpec {
  const k = portfolioKpis(list);
  return {
    name: 'Resumo',
    columns: [
      { key: 'indicador', header: 'Indicador', type: 'text' },
      { key: 'valor', header: 'Valor', type: 'number' },
    ],
    rows: [
      { indicador: 'Projetos ativos', valor: k.active },
      { indicador: 'No prazo', valor: k.onTrack },
      { indicador: 'Em atencao', valor: k.attention },
      { indicador: 'Criticos', valor: k.critical },
      { indicador: 'Avanco medio (%)', valor: k.avgProgress },
      { indicador: 'Budget total (R$)', valor: k.budget },
      { indicador: 'Realizado (R$)', valor: k.actual },
      { indicador: 'Comprometido (R$)', valor: k.committed },
      { indicador: 'Forecast (R$)', valor: k.forecast },
      { indicador: 'Variacao forecast (R$)', valor: k.forecastVariance },
      { indicador: 'Variacao forecast (%)', valor: k.forecastVariancePct },
    ],
  };
}

export async function buildReportSheets(reportKey: string): Promise<SheetSpec[]> {
  switch (reportKey) {
    case 'status-report-executivo':
    case 'portfolio-review': {
      const [list, risks, milestones] = await Promise.all([
        listProjectOverview(), listRisks(), listMilestones(),
      ]);
      return [
        kpiSheet(list),
        projectSheet(list),
        milestoneSheet(milestones),
        riskSheet(risks.filter((r) => r.status !== 'encerrado')),
      ];
    }

    case 'steering-committee': {
      const [list, risks, decisions, milestones] = await Promise.all([
        listProjectOverview(), listRisks(), listDecisions(), listMilestones(),
      ]);
      const critical = list.filter((p) => p.health === 'vermelho' || Number(p.critical_risks) > 0);
      const pending = decisions.filter((d) => d.status === 'aguardando_decisao');
      const topRisks = risks.filter((r) => r.score >= 15 && r.status !== 'encerrado');
      const next = milestones.filter((m) => !m.completed_at && !overdue(m.due_date));
      return [
        { ...projectSheet(critical), name: 'Projetos criticos' },
        decisionSheet(pending),
        riskSheet(topRisks, 'Riscos criticos'),
        { ...milestoneSheet(next), name: 'Proximos marcos' },
      ];
    }

    case 'riscos': {
      const [risks, actions] = await Promise.all([listRisks(), listActionPlans()]);
      return [
        riskSheet(risks.filter((r) => r.status !== 'encerrado').sort((a, b) => b.score - a.score)),
        {
          name: 'Planos de Acao',
          columns: [
            { key: 'projeto', header: 'Projeto', type: 'text' },
            { key: 'id', header: 'ID', type: 'text' },
            { key: 'acao', header: 'Acao', type: 'text' },
            { key: 'responsavel', header: 'Responsavel', type: 'text' },
            { key: 'prazo', header: 'Prazo', type: 'date' },
            { key: 'status', header: 'Status', type: 'text' },
            { key: 'prioridade', header: 'Prioridade', type: 'text' },
            { key: 'conclusao', header: 'Conclusao', type: 'date' },
          ],
          rows: actions.map((a) => ({
            projeto: a.project?.code ?? '', id: a.code, acao: a.title,
            responsavel: a.owner?.full_name ?? '', prazo: a.due_date ?? '',
            status: a.status, prioridade: a.priority, conclusao: a.completed_at ?? '',
          })),
        },
      ];
    }

    case 'financeiro': {
      const list = await listProjectOverview();
      const k = portfolioKpis(list);
      // A planilha de projetos do relatorio financeiro so' faz sentido para
      // quem usa o modulo - misturar projetos sem financeiro exigiria linhas
      // de orcamento zero que nao existem de verdade.
      const financial = list.filter((p) => p.financial_effective_enabled);
      return [
        {
          name: 'Resumo Financeiro',
          columns: [
            { key: 'indicador', header: 'Indicador', type: 'text' },
            { key: 'valor', header: 'Valor', type: 'currency' },
          ],
          rows: [
            { indicador: 'Budget total', valor: k.budget },
            { indicador: 'Realizado', valor: k.actual },
            { indicador: 'Comprometido', valor: k.committed },
            { indicador: 'Forecast', valor: k.forecast },
            { indicador: 'Variacao', valor: k.forecastVariance },
          ],
        },
        {
          name: 'Projetos',
          columns: [
            { key: 'codigo', header: 'Codigo', type: 'text' },
            { key: 'projeto', header: 'Projeto', type: 'text' },
            { key: 'orcamento', header: 'Orcamento', type: 'currency' },
            { key: 'realizado', header: 'Realizado', type: 'currency' },
            { key: 'comprometido', header: 'Comprometido', type: 'currency' },
            { key: 'forecast', header: 'Forecast', type: 'currency' },
            { key: 'saldo', header: 'Saldo', type: 'currency' },
            { key: 'variacao', header: 'Variacao (R$)', type: 'currency' },
            { key: 'variacaoPct', header: 'Variacao (%)', type: 'percent' },
          ],
          rows: financial.map((p) => ({
            codigo: p.code, projeto: p.name,
            orcamento: Number(p.budget), realizado: Number(p.actual),
            comprometido: Number(p.committed), forecast: Number(p.forecast),
            saldo: Number(p.remaining), variacao: Number(p.forecast_variance),
            variacaoPct: Number(p.forecast_variance_pct),
          })),
        },
      ];
    }

    case 'indicador-metas': {
      const list = await listProjectOverview();
      const measured = list.filter((p) => p.goal_indicator_enabled);
      const scores = await listAllTaskGoalScores();
      return [
        {
          name: 'Resumo',
          columns: [
            { key: 'indicador', header: 'Indicador', type: 'text' },
            { key: 'valor', header: 'Valor', type: 'number' },
          ],
          rows: [
            { indicador: 'Projetos mensurados', valor: measured.length },
            { indicador: 'Projetos com indicador >= Meta (10)', valor: measured.filter((p) => (p.goal_indicator_realized ?? p.goal_indicator_projected ?? 0) >= 10).length },
            { indicador: 'Entregas pendentes', valor: measured.reduce((s, p) => s + (p.goal_deliveries_pending ?? 0), 0) },
          ],
        },
        {
          name: 'Projetos',
          columns: [
            { key: 'codigo', header: 'Codigo', type: 'text' },
            { key: 'projeto', header: 'Projeto', type: 'text' },
            { key: 'owner', header: 'Owner', type: 'text' },
            { key: 'realizado', header: 'Indicador Realizado', type: 'number' },
            { key: 'projetado', header: 'Indicador Projetado', type: 'number' },
            { key: 'pendentes', header: 'Entregas pendentes', type: 'integer' },
          ],
          rows: measured.map((p) => ({
            codigo: p.code, projeto: p.name, owner: p.owner_name ?? '',
            realizado: p.goal_indicator_realized ?? '', projetado: p.goal_indicator_projected ?? '',
            pendentes: p.goal_deliveries_pending ?? 0,
          })),
        },
        {
          name: 'Entregas',
          columns: [
            { key: 'codigo', header: 'Codigo', type: 'text' },
            { key: 'entrega', header: 'Entrega', type: 'text' },
            { key: 'peso', header: 'Peso (%)', type: 'number' },
            { key: 'meta', header: 'Data Meta', type: 'date' },
            { key: 'realizada', header: 'Data Realizada', type: 'date' },
            { key: 'nota', header: 'Nota', type: 'number' },
            { key: 'notaProjetada', header: 'Nota Projetada', type: 'number' },
          ],
          rows: scores.map((s) => ({
            codigo: s.code, entrega: s.title, peso: Number(s.weight),
            meta: s.target_date ?? '', realizada: s.actual_date ?? '',
            nota: s.score_realized ?? '', notaProjetada: s.score_projected ?? '',
          })),
        },
      ];
    }

    case 'capacidade': {
      const month = currentMonthKey();
      const capacity = await listCapacity();
      const rows = capacity.filter((r) => r.reference_month === month);
      const byTeam = teamCapacity(capacity, month);
      return [
        {
          name: 'Resumo',
          columns: [
            { key: 'equipe', header: 'Equipe', type: 'text' },
            { key: 'capacidade', header: 'Capacidade (h)', type: 'number' },
            { key: 'alocado', header: 'Alocado (h)', type: 'number' },
            { key: 'alocacao', header: 'Alocacao', type: 'percent' },
            { key: 'situacao', header: 'Situacao', type: 'text' },
          ],
          rows: byTeam.map((t) => ({
            equipe: t.team, capacidade: t.capacity, alocado: t.allocated, alocacao: t.pct,
            situacao: t.pct > 100 ? 'Sobrecarga' : t.pct > 85 ? 'Atencao' : 'Adequada',
          })),
        },
        {
          name: 'Colaboradores',
          columns: [
            { key: 'colaborador', header: 'Colaborador', type: 'text' },
            { key: 'equipe', header: 'Equipe', type: 'text' },
            { key: 'capacidade', header: 'Capacidade (h)', type: 'number' },
            { key: 'alocado', header: 'Alocado (h)', type: 'number' },
            { key: 'alocacao', header: 'Alocacao', type: 'percent' },
            { key: 'projetos', header: 'Projetos', type: 'integer' },
          ],
          rows: rows.map((r) => ({
            colaborador: r.full_name, equipe: r.team_name ?? '',
            capacidade: Number(r.capacity_hours), alocado: Number(r.allocated_hours),
            alocacao: Number(r.allocation_pct), projetos: r.project_count,
          })),
        },
      ];
    }

    case 'entregas-vencidas': {
      const [tasks, milestones, actions] = await Promise.all([
        listTasks(), listMilestones(), listActionPlans(),
      ]);
      const done = ['concluida', 'cancelada'];
      const rows = [
        ...tasks.filter((t) => t.due_date && !done.includes(t.status) && overdue(t.due_date))
          .map((t) => ({
            tipo: 'Tarefa', projeto: t.project?.code ?? '', item: t.title,
            responsavel: t.assignee?.full_name ?? '', prazo: t.due_date ?? '',
            atraso: daysLate(t.due_date),
          })),
        ...milestones.filter((m) => !m.completed_at && overdue(m.due_date))
          .map((m) => ({
            tipo: 'Marco', projeto: m.project?.code ?? '', item: m.name,
            responsavel: '', prazo: m.due_date, atraso: daysLate(m.due_date),
          })),
        ...actions.filter((a) => a.due_date && !done.includes(a.status) && overdue(a.due_date))
          .map((a) => ({
            tipo: 'Plano de acao', projeto: a.project?.code ?? '', item: a.title,
            responsavel: a.owner?.full_name ?? '', prazo: a.due_date ?? '',
            atraso: daysLate(a.due_date),
          })),
      ].sort((a, b) => b.atraso - a.atraso);

      return [{
        name: 'Entregas vencidas',
        columns: [
          { key: 'tipo', header: 'Tipo', type: 'text' },
          { key: 'projeto', header: 'Projeto', type: 'text' },
          { key: 'item', header: 'Item', type: 'text' },
          { key: 'responsavel', header: 'Responsavel', type: 'text' },
          { key: 'prazo', header: 'Prazo', type: 'date' },
          { key: 'atraso', header: 'Atraso (dias)', type: 'integer' },
        ],
        rows,
      }];
    }

    case 'decisoes-pendentes': {
      const decisions = await listDecisions();
      const pending = decisions
        .filter((d) => d.status === 'aguardando_decisao' || d.status === 'em_preparacao')
        .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
      return [decisionSheet(pending)];
    }

    case 'historico-mudancas': {
      const entries = await listAuditLog({ limit: 300 });
      const relevant = entries.filter((e) => [
        'status_change', 'health_change', 'financial_change',
        'schedule_change', 'ownership_change', 'permission_change',
      ].includes(e.action));
      return [{
        name: 'Historico',
        columns: [
          { key: 'quando', header: 'Data/hora (UTC)', type: 'datetime' },
          { key: 'usuario', header: 'Usuario', type: 'text' },
          { key: 'acao', header: 'Acao', type: 'text' },
          { key: 'entidade', header: 'Entidade', type: 'text' },
          { key: 'campos', header: 'Campos alterados', type: 'text' },
        ],
        rows: relevant.map((e) => ({
          quando: e.occurred_at, usuario: e.user_name ?? 'Sistema',
          acao: auditActionLabel[e.action], entidade: e.entity,
          campos: (e.changed_fields ?? []).join(', '),
        })),
      }];
    }

    default:
      return [];
  }
}

function decisionSheet(decisions: Awaited<ReturnType<typeof listDecisions>>): SheetSpec {
  return {
    name: 'Decisoes',
    columns: [
      { key: 'projeto', header: 'Projeto', type: 'text' },
      { key: 'codigo', header: 'Codigo', type: 'text' },
      { key: 'assunto', header: 'Assunto', type: 'text' },
      { key: 'decisor', header: 'Decisor', type: 'text' },
      { key: 'prazo', header: 'Prazo', type: 'date' },
      { key: 'status', header: 'Status', type: 'text' },
      { key: 'recomendacao', header: 'Recomendacao', type: 'text' },
    ],
    rows: decisions.map((d) => ({
      projeto: d.project?.code ?? '', codigo: d.code, assunto: d.subject,
      decisor: d.decider?.full_name ?? '', prazo: d.deadline ?? '',
      status: d.status, recomendacao: d.recommendation ?? '',
    })),
  };
}
