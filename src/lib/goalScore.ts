import type { GoalDayBasis } from '@/types/domain';

/**
 * Motor de calculo do Indicador de Metas. Espelha exatamente
 * `app.calc_delivery_score`/`app.business_days_between` do Postgres (ver
 * migration 0017) - usado no frontend so' para preview instantaneo antes de
 * salvar; o resultado oficial (portfolio, dashboard, relatorios, fechamento de
 * periodo) sempre vem das views do banco, nunca deste calculo no navegador.
 */

const ONE_DAY_MS = 86_400_000;

function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const dow = date.getDay(); // 0=domingo, 6=sabado
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(toISODate(date));
}

/**
 * Dias uteis entre duas datas (positivo quando `to` e' depois de `from`,
 * negativo quando antes). Conta apenas os dias uteis no intervalo aberto no
 * inicio - sexta -> segunda da' 1 (so a segunda conta), nao 3.
 */
export function businessDaysBetween(from: string, to: string, holidays: ReadonlySet<string> = new Set()): number {
  if (from === to) return 0;
  const sign = to < from ? -1 : 1;
  let a = parseISODate(sign === 1 ? from : to);
  const b = parseISODate(sign === 1 ? to : from);
  let count = 0;
  while (a.getTime() < b.getTime()) {
    a = new Date(a.getTime() + ONE_DAY_MS);
    if (isBusinessDay(a, holidays)) count += 1;
  }
  return count * sign;
}

export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / ONE_DAY_MS);
}

export interface DeliveryScoreInput {
  targetDate: string;
  /** null = entrega ainda nao concluida (nota projetada usa a data de hoje). */
  actualDate: string | null;
  challengeDays: number;
  minimumDays: number;
  dayBasis: GoalDayBasis;
  challengeScore?: number;
  targetScore?: number;
  minimumScore?: number;
  holidays?: ReadonlySet<string>;
  /** Data de "hoje" para a nota projetada - parametrizavel para testes. */
  today?: string;
}

export type DeliveryClassification = 'desafio' | 'meta' | 'abaixo_da_meta' | 'racional_minimo';

export interface DeliveryScoreResult {
  score: number;
  differenceDays: number;
  /** true quando `actualDate` era null e o calculo usou a data de hoje. */
  isProjected: boolean;
  classification: DeliveryClassification;
}

function classify(score: number, targetScore: number, challengeScore: number, minimumScore: number): DeliveryClassification {
  if (score >= challengeScore) return 'desafio';
  if (score >= targetScore) return 'meta';
  if (score <= minimumScore) return 'racional_minimo';
  return 'abaixo_da_meta';
}

/**
 * Nota de 1 a 15 (por padrao) para uma unica entrega, dado o prazo-meta e a
 * data real (ou projetada) de conclusao. Formula: interpolacao linear entre
 * Desafio-Meta antes do prazo, e Meta-Racional mínimo depois - sempre limitada
 * ao intervalo [minimumScore, challengeScore].
 */
export function calculateDeliveryScore(input: DeliveryScoreInput): DeliveryScoreResult {
  const {
    targetDate, actualDate, challengeDays, minimumDays, dayBasis,
    challengeScore = 15, targetScore = 10, minimumScore = 1,
    holidays = new Set<string>(), today = toISODate(new Date()),
  } = input;

  const isProjected = actualDate == null;
  const effectiveActual = actualDate ?? today;

  const diff = dayBasis === 'uteis'
    ? businessDaysBetween(targetDate, effectiveActual, holidays)
    : calendarDaysBetween(targetDate, effectiveActual);

  let score: number;
  if (diff <= 0) {
    score = challengeDays > 0
      ? targetScore + (challengeScore - targetScore) * (Math.min(-diff, challengeDays) / challengeDays)
      : targetScore;
    score = Math.min(score, challengeScore);
  } else {
    score = minimumDays > 0
      ? targetScore - (targetScore - minimumScore) * (Math.min(diff, minimumDays) / minimumDays)
      : minimumScore;
    score = Math.max(score, minimumScore);
  }
  score = Math.round(score * 100) / 100;

  return {
    score, differenceDays: diff, isProjected,
    classification: classify(score, targetScore, challengeScore, minimumScore),
  };
}

export interface WeightedDelivery {
  /** null = entrega ainda pendente (nao entra no indicador Realizado). */
  scoreRealized: number | null;
  scoreProjected: number;
  weight: number;
}

export interface ProjectIndicatorResult {
  indicatorRealized: number | null;
  indicatorProjected: number | null;
  deliveriesTotal: number;
  deliveriesDone: number;
  deliveriesPending: number;
}

/**
 * Media ponderada do projeto. Realizado considera so' as entregas concluidas
 * (renormalizado pelo peso de quem ja entregou); Projetado usa o conjunto
 * inteiro, com a nota projetada nas pendentes.
 */
export function calculateProjectIndicator(deliveries: WeightedDelivery[]): ProjectIndicatorResult {
  const done = deliveries.filter((d) => d.scoreRealized != null);
  const doneWeightSum = done.reduce((sum, d) => sum + d.weight, 0);
  const totalWeightSum = deliveries.reduce((sum, d) => sum + d.weight, 0);

  const indicatorRealized = doneWeightSum > 0
    ? round2(done.reduce((sum, d) => sum + (d.scoreRealized as number) * d.weight, 0) / doneWeightSum)
    : null;

  const indicatorProjected = totalWeightSum > 0
    ? round2(deliveries.reduce((sum, d) => sum + d.scoreProjected * d.weight, 0) / totalWeightSum)
    : null;

  return {
    indicatorRealized, indicatorProjected,
    deliveriesTotal: deliveries.length,
    deliveriesDone: done.length,
    deliveriesPending: deliveries.length - done.length,
  };
}

/** Distribui peso igual entre N entregas (modo "Distribuir pesos igualmente"). */
export function equalWeights(count: number): number {
  return count > 0 ? round2(100 / count) : 0;
}

export function validateWeightSum(weights: number[]): { sum: number; valid: boolean } {
  const sum = round2(weights.reduce((s, w) => s + w, 0));
  return { sum, valid: Math.abs(sum - 100) < 0.01 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
