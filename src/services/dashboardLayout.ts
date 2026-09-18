import { getColumnPreference, saveColumnPreference } from '@/services/views';

export const DASHBOARD_MODULE = 'dashboard';

export interface DashboardWidgetMeta {
  id: string;
  label: string;
}

/** Catalogo fixo, na ordem padrao exibida quando o usuario nunca personalizou. */
export const DASHBOARD_WIDGETS: DashboardWidgetMeta[] = [
  { id: 'kpis_execucao', label: 'KPIs de execucao' },
  { id: 'kpis_financeiro_governanca', label: 'KPIs financeiros e de governanca' },
  { id: 'kpis_prazos', label: 'KPIs de prazos e conflitos' },
  { id: 'grafico_saude_avanco', label: 'Saude do portfolio e avanco por projeto' },
  { id: 'grafico_financeiro', label: 'Evolucao financeira do portfolio' },
  { id: 'grafico_distribuicao', label: 'Distribuicao por categoria, responsavel e capacidade' },
  { id: 'listas_operacionais', label: 'Riscos, marcos, decisoes e atividade recente' },
  { id: 'alerta_calendario', label: 'Conflitos com o calendario contabil' },
];

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

const DEFAULT_LAYOUT: DashboardLayout = { order: DASHBOARD_WIDGETS.map((w) => w.id), hidden: [] };

/**
 * Ordem efetiva de renderizacao: widgets do layout salvo (na ordem salva),
 * seguidos de qualquer widget novo do catalogo que o usuario ainda nao viu
 * (widget adicionado numa versao futura) - nunca some um bloco por causa de
 * um layout salvo antigo, so aparece ao final ate o usuario reordenar.
 */
export function resolveDashboardOrder(layout: DashboardLayout): string[] {
  const known = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
  const saved = layout.order.filter((id) => known.has(id));
  const missing = DASHBOARD_WIDGETS.map((w) => w.id).filter((id) => !saved.includes(id));
  return [...saved, ...missing];
}

export async function getDashboardLayout(profileId: string): Promise<DashboardLayout> {
  const config = await getColumnPreference(profileId, DASHBOARD_MODULE);
  if (!config) return DEFAULT_LAYOUT;
  return {
    order: config.order ?? DEFAULT_LAYOUT.order,
    hidden: Object.entries(config.visible ?? {}).filter(([, v]) => v === false).map(([id]) => id),
  };
}

export async function saveDashboardLayout(profileId: string, layout: DashboardLayout): Promise<void> {
  const visible = Object.fromEntries(layout.hidden.map((id) => [id, false]));
  await saveColumnPreference(profileId, DASHBOARD_MODULE, { order: layout.order, visible });
}

export async function resetDashboardLayout(profileId: string): Promise<void> {
  await saveColumnPreference(profileId, DASHBOARD_MODULE, {});
}
