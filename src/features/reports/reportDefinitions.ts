import type { LucideIcon } from 'lucide-react';
import {
  FileBarChart, ShieldAlert, Wallet, Users, Clock, Gavel, History, Presentation, LayoutDashboard, Target,
} from 'lucide-react';

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Para quem o relatorio foi desenhado - orienta o nivel de detalhe. */
  audience: string;
}

export const reports: ReportDefinition[] = [
  {
    key: 'status-report-executivo',
    title: 'Status Report Executivo',
    description: 'Saude, avanco, financeiro, riscos e decisoes por projeto, no formato de leitura rapida.',
    icon: Presentation,
    audience: 'Gerencia e Diretoria',
  },
  {
    key: 'portfolio-review',
    title: 'Portfolio Review',
    description: 'Consolidacao da carteira: distribuicao por saude, categoria, avanco e desvio financeiro.',
    icon: LayoutDashboard,
    audience: 'PMO e Gerencia',
  },
  {
    key: 'steering-committee',
    title: 'Steering Committee',
    description: 'Pauta consolidada: projetos criticos, decisoes pendentes, riscos e marcos do periodo.',
    icon: FileBarChart,
    audience: 'Comite executivo',
  },
  {
    key: 'riscos',
    title: 'Relatorio de Riscos',
    description: 'Riscos e issues por criticidade, com plano, responsavel, prazo e risco residual.',
    icon: ShieldAlert,
    audience: 'PMO, Auditoria e Controles Internos',
  },
  {
    key: 'financeiro',
    title: 'Relatorio Financeiro',
    description: 'Budget, realizado, comprometido, forecast e variacao por projeto e consolidado.',
    icon: Wallet,
    audience: 'Controladoria e Gerencia',
  },
  {
    key: 'indicador-metas',
    title: 'Indicadores de Metas',
    description: 'Nota de aderencia a prazo (1 a 15) por entrega e por projeto, realizada e projetada.',
    icon: Target,
    audience: 'PMO, Gerencia e Project Owners',
  },
  {
    key: 'capacidade',
    title: 'Relatorio de Capacidade',
    description: 'Capacidade x alocacao por equipe e colaborador, com sobrecarga identificada.',
    icon: Users,
    audience: 'Gerencia e lideres de equipe',
  },
  {
    key: 'entregas-vencidas',
    title: 'Entregas Vencidas',
    description: 'Tarefas, marcos e planos de acao com prazo expirado, por projeto e responsavel.',
    icon: Clock,
    audience: 'PMO e Project Owners',
  },
  {
    key: 'decisoes-pendentes',
    title: 'Decisoes Pendentes',
    description: 'Decisoes aguardando deliberacao, com decisor, prazo e criticidade.',
    icon: Gavel,
    audience: 'Sponsors e Steering Committee',
  },
  {
    key: 'historico-mudancas',
    title: 'Historico de Mudancas',
    description: 'Alteracoes relevantes de status, saude, prazo, orcamento e responsaveis.',
    icon: History,
    audience: 'Auditoria e Compliance',
  },
];
