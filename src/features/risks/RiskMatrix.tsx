import { cn } from '@/utils/cn';
import type { RiskWithContext } from '@/services/risks';
import { riskCriticality } from '@/utils/domain-labels';

const cellTone: Record<string, string> = {
  critico: 'bg-danger/25 hover:bg-danger/35',
  alto: 'bg-warn/25 hover:bg-warn/35',
  moderado: 'bg-info/20 hover:bg-info/30',
  baixo: 'bg-ok/15 hover:bg-ok/25',
};

/**
 * Matriz 5x5 probabilidade x impacto. Cada celula abre o conjunto de riscos
 * que a compoe - drill-down exigido para leitura executiva.
 */
export function RiskMatrix({
  risks, onSelectCell,
}: { risks: RiskWithContext[]; onSelectCell?: (probability: number, impact: number) => void }) {
  const grid = new Map<string, RiskWithContext[]>();
  for (const r of risks) {
    if (r.status === 'encerrado') continue;
    const key = `${r.probability}-${r.impact}`;
    grid.set(key, [...(grid.get(key) ?? []), r]);
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <caption className="sr-only">Matriz de risco 5 por 5</caption>
        <thead>
          <tr>
            <th className="w-24" />
            {[1, 2, 3, 4, 5].map((i) => (
              <th key={i} className="w-20 pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted">
                Impacto {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((p) => (
            <tr key={p}>
              <th className="pr-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted">
                Prob. {p}
              </th>
              {[1, 2, 3, 4, 5].map((i) => {
                const items = grid.get(`${p}-${i}`) ?? [];
                const level = riskCriticality(p * i);
                return (
                  <td key={i}>
                    <button
                      type="button"
                      onClick={() => onSelectCell?.(p, i)}
                      title={`Probabilidade ${p} x Impacto ${i} = score ${p * i} (${level})`}
                      className={cn(
                        'grid h-14 w-20 place-items-center rounded-md text-sm font-semibold transition-colors focus-ring',
                        cellTone[level],
                        items.length === 0 && 'opacity-45',
                      )}
                    >
                      <span className="tabular-nums">{items.length || ''}</span>
                      <span className="text-[9px] font-normal text-muted">{p * i}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-danger/40" /> Critico (15-25)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-warn/40" /> Alto (9-14)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-info/40" /> Moderado (4-8)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-ok/30" /> Baixo (1-3)</span>
      </div>
    </div>
  );
}
