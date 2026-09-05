import {
  LayoutDashboard, FolderKanban, ListChecks, CalendarRange, ShieldAlert, Users,
  FileBarChart, ScrollText, Settings, CalendarClock, Bell, Target, type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@/app/AuthProvider';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
  end?: boolean;
}

export interface NavGroup { title: string; items: NavItem[] }

export const navigation: NavGroup[] = [
  {
    title: 'Gestao',
    items: [
      { to: '/', label: 'Visao Executiva', icon: LayoutDashboard, end: true },
      { to: '/portfolio', label: 'Portfolio de Projetos', icon: FolderKanban },
      { to: '/tarefas', label: 'Tarefas & Entregas', icon: ListChecks },
      { to: '/cronograma', label: 'Cronograma Corporativo', icon: CalendarRange },
      { to: '/indicadores-metas', label: 'Indicadores de Metas', icon: Target },
      { to: '/riscos', label: 'Riscos & Planos de Acao', icon: ShieldAlert },
      { to: '/recursos', label: 'Recursos & Capacidade', icon: Users },
      { to: '/calendario', label: 'Calendario Critico', icon: CalendarClock },
    ],
  },
  {
    title: 'Governanca',
    items: [
      { to: '/relatorios', label: 'Relatorios', icon: FileBarChart },
      { to: '/auditoria', label: 'Trilha de Auditoria', icon: ScrollText, capability: 'audit.read' },
      { to: '/notificacoes', label: 'Central de Notificacoes', icon: Bell },
      { to: '/configuracoes', label: 'Configuracoes', icon: Settings },
    ],
  },
];
