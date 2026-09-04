import type { TooltipProps } from 'recharts';

/** Tooltip com tokens do tema - o padrao do Recharts ignora o modo escuro. */
export function ChartTooltip({
  active, payload, label, formatter,
}: TooltipProps<number, string> & { formatter?: (value: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-pop">
      {label != null && <p className="mb-1 text-xs font-medium text-fg">{String(label)}</p>}
      <ul className="space-y-0.5">
        {payload.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} aria-hidden />
            <span className="text-muted">{item.name}</span>
            <span className="ml-auto font-medium tabular-nums text-fg">
              {formatter
                ? formatter(Number(item.value), String(item.name))
                : Number(item.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
