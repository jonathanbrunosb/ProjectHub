import { chartColors } from './chartTheme';

export interface GoalThermometerGaugeProps {
  /** Nota atual (realizada ou projetada). `null` mostra a trilha vazia, sem marcador. */
  value: number | null;
  /** Nota que caracteriza a Meta (ex.: 10). */
  target: number;
  /** Nota que caracteriza o Desafio - tambem define o teto visual da escala (ex.: 15). */
  challenge: number;
  /** Piso visual da escala. */
  min?: number;
  label?: string;
}

/**
 * Termometro horizontal: preenche a trilha ate a nota atual, deixando o
 * restante da escala vazio. As marcas de Meta e Desafio ficam fixas na
 * régua para dar contexto de onde o valor atual esta em relacao a elas.
 */
export function GoalThermometerGauge({ value, target, challenge, min = 0, label }: GoalThermometerGaugeProps) {
  const colors = chartColors();
  const max = Math.max(challenge, min + 0.01);
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const filledPct = value != null ? pct(value) : 0;
  const targetPct = pct(target);

  return (
    <div className="w-full">
      {label && <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>}
      <div className="relative h-7 rounded-full bg-surface-2 ring-1 ring-inset ring-border">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${filledPct}%`,
            background: `linear-gradient(90deg, ${colors.danger}, ${colors.warn} 55%, ${colors.ok})`,
          }}
        />
        <div
          className="absolute inset-y-0 border-l-2 border-dashed border-fg/40"
          style={{ left: `${targetPct}%` }}
          aria-hidden
        />
        {value != null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-pop"
            style={{ left: `${filledPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        <span className="absolute left-0">{min}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${targetPct}%` }}>Meta {target}</span>
        <span className="absolute right-0">Desafio {challenge}</span>
      </div>
      <p className="mt-2 text-sm font-semibold tabular-nums text-fg">
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  );
}
