import { useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatDate, parseDateOnly, toISODate } from '@/utils/format';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState } from '@/components/ui/Feedback';

export type GanttScale = 'dia' | 'semana' | 'mes' | 'trimestre' | 'ano';

export interface GanttItem {
  id: string;
  label: string;
  sublabel?: string;
  start: string | null;
  end: string | null;
  /** Baseline para comparacao visual com o replanejamento. */
  baselineStart?: string | null;
  baselineEnd?: string | null;
  progress?: number;
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'strategic' | 'neutral';
  isMilestone?: boolean;
  isCritical?: boolean;
  level?: number;
  href?: string;
}

export interface GanttDependency { from: string; to: string; atRisk?: boolean }

/** Faixas destacadas no fundo (janelas criticas do calendario contabil). */
export interface GanttBand { start: string; end: string; label: string; tone?: 'warn' | 'danger' }

const toneClass: Record<NonNullable<GanttItem['tone']>, string> = {
  ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger',
  info: 'bg-info', strategic: 'bg-strategic', neutral: 'bg-neutral2',
};

const ROW_HEIGHT = 34;
const LABEL_WIDTH = 260;

export function GanttChart({
  items, dependencies = [], bands = [], scale = 'mes', onSelect, emptyText,
}: {
  items: GanttItem[];
  dependencies?: GanttDependency[];
  bands?: GanttBand[];
  scale?: GanttScale;
  onSelect?: (id: string) => void;
  emptyText?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const domain = useMemo(() => computeDomain(items, bands), [items, bands]);
  const ticks = useMemo(() => (domain ? buildTicks(domain.min, domain.max, scale) : []), [domain, scale]);

  if (!domain || items.length === 0) {
    return <EmptyState title="Sem itens no cronograma" description={emptyText ?? 'Cadastre tarefas ou marcos com datas para visualizar o Gantt.'} />;
  }

  const totalMs = domain.max.getTime() - domain.min.getTime() || 1;
  const pct = (date: Date) => ((date.getTime() - domain.min.getTime()) / totalMs) * 100;
  const rowIndex = new Map(items.map((it, i) => [it.id, i]));
  const minWidth = Math.max(720, ticks.length * (scale === 'dia' ? 42 : scale === 'semana' ? 56 : 90));

  return (
    <div className="overflow-x-auto" ref={containerRef}>
      <div style={{ minWidth: minWidth + LABEL_WIDTH }}>
        {/* Cabecalho da escala */}
        <div className="flex border-b border-border">
          <div className="shrink-0 px-3 py-2 text-xs font-semibold text-muted" style={{ width: LABEL_WIDTH }}>
            Item
          </div>
          <div className="relative flex-1">
            <div className="flex h-9 items-center">
              {ticks.map((t) => (
                <div
                  key={t.key}
                  className="border-l border-border/70 px-2 text-[10px] font-medium uppercase tracking-wide text-muted"
                  style={{ width: `${100 / ticks.length}%` }}
                >
                  {t.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Linhas */}
        <div className="relative">
          {/* Faixas de janela critica */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_WIDTH, right: 0 }}>
            {bands.map((b, i) => {
              const s = parseDateOnly(b.start);
              const e = parseDateOnly(b.end);
              if (!s || !e) return null;
              const left = pct(s);
              const width = Math.max(0.4, pct(e) - left);
              return (
                <div
                  key={i}
                  className={cn('absolute inset-y-0', b.tone === 'danger' ? 'bg-danger/10' : 'bg-warn/10')}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={b.label}
                />
              );
            })}
            {/* Linha de hoje */}
            {(() => {
              const today = new Date();
              if (today < domain.min || today > domain.max) return null;
              return (
                <div className="absolute inset-y-0 w-px bg-brand" style={{ left: `${pct(today)}%` }} title={`Hoje: ${formatDate(toISODate(today))}`} />
              );
            })()}
          </div>

          {/* Setas de dependencia */}
          <svg
            className="pointer-events-none absolute inset-y-0"
            style={{ left: LABEL_WIDTH, right: 0, width: `calc(100% - ${LABEL_WIDTH}px)`, height: items.length * ROW_HEIGHT }}
            aria-hidden
          >
            {dependencies.map((dep, i) => {
              const from = items.find((it) => it.id === dep.from);
              const to = items.find((it) => it.id === dep.to);
              const fromRow = rowIndex.get(dep.from);
              const toRow = rowIndex.get(dep.to);
              if (!from || !to || fromRow == null || toRow == null) return null;
              const fromEnd = parseDateOnly(from.end ?? from.start);
              const toStart = parseDateOnly(to.start ?? to.end);
              if (!fromEnd || !toStart) return null;
              const x1 = `${pct(fromEnd)}%`;
              const x2 = `${pct(toStart)}%`;
              const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
              const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
              return (
                <g key={i} opacity={0.7}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={dep.atRisk ? 'rgb(var(--c-danger))' : 'rgb(var(--c-muted))'}
                    strokeWidth={dep.atRisk ? 1.8 : 1}
                    strokeDasharray={dep.atRisk ? undefined : '3 3'}
                  />
                  <circle cx={x2} cy={y2} r={2.5} fill={dep.atRisk ? 'rgb(var(--c-danger))' : 'rgb(var(--c-muted))'} />
                </g>
              );
            })}
          </svg>

          {items.map((item) => {
            const start = parseDateOnly(item.start);
            const end = parseDateOnly(item.end ?? item.start);
            const bStart = parseDateOnly(item.baselineStart ?? null);
            const bEnd = parseDateOnly(item.baselineEnd ?? null);
            const left = start ? pct(start) : 0;
            const width = start && end ? Math.max(0.6, pct(end) - left) : 0;
            const shifted = bEnd && end && bEnd.getTime() !== end.getTime();

            return (
              <div
                key={item.id}
                className={cn(
                  'relative flex items-center border-b border-border/50 transition-colors',
                  hovered === item.id && 'bg-surface-2/70',
                  onSelect && 'cursor-pointer',
                )}
                style={{ height: ROW_HEIGHT }}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect?.(item.id)}
              >
                <div
                  className="shrink-0 truncate px-3 text-xs"
                  style={{ width: LABEL_WIDTH, paddingLeft: 12 + (item.level ?? 0) * 14 }}
                >
                  <span className={cn('truncate', item.isCritical && 'font-medium')}>{item.label}</span>
                  {item.sublabel && <span className="ml-1.5 text-muted">{item.sublabel}</span>}
                </div>

                <div className="relative h-full flex-1">
                  {start && (
                    <Tooltip
                      side="top"
                      content={
                        <span>
                          <b>{item.label}</b><br />
                          {formatDate(item.start)} → {formatDate(item.end)}
                          {item.progress != null && <><br />Progresso: {Math.round(item.progress)}%</>}
                          {shifted && <><br />Baseline: {formatDate(item.baselineEnd)}</>}
                        </span>
                      }
                    >
                      <span
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `${left}%`, width: item.isMilestone ? undefined : `${width}%` }}
                      >
                        {item.isMilestone ? (
                          <span
                            className={cn(
                              'block h-3 w-3 rotate-45 rounded-[2px]',
                              item.isCritical ? 'bg-danger' : 'bg-strategic',
                            )}
                          />
                        ) : (
                          <span className={cn('relative block h-3.5 overflow-hidden rounded-sm', toneClass[item.tone ?? 'info'], 'opacity-30')}>
                            <span
                              className={cn('absolute inset-y-0 left-0 rounded-sm opacity-100', toneClass[item.tone ?? 'info'])}
                              style={{ width: `${Math.min(100, Math.max(0, item.progress ?? 0))}%` }}
                            />
                          </span>
                        )}
                      </span>
                    </Tooltip>
                  )}

                  {/* Baseline como linha fina abaixo da barra atual */}
                  {bStart && bEnd && !item.isMilestone && (
                    <span
                      className="absolute bottom-1 h-0.5 rounded bg-fg/30"
                      style={{ left: `${pct(bStart)}%`, width: `${Math.max(0.4, pct(bEnd) - pct(bStart))}%` }}
                      title={`Baseline: ${formatDate(item.baselineStart)} → ${formatDate(item.baselineEnd)}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border px-3 py-2 text-[10px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-info" /> Barra: periodo e progresso</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-fg/30" /> Baseline</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-strategic" /> Marco</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-brand" /> Hoje</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-warn/30" /> Janela critica contabil</span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="rgb(var(--c-danger))" strokeWidth="1.8" /></svg>
            Dependencia em risco
          </span>
        </div>
      </div>
    </div>
  );
}

function computeDomain(items: GanttItem[], bands: GanttBand[]) {
  const dates: Date[] = [];
  for (const it of items) {
    for (const d of [it.start, it.end, it.baselineStart, it.baselineEnd]) {
      const parsed = parseDateOnly(d ?? null);
      if (parsed) dates.push(parsed);
    }
  }
  for (const b of bands) {
    const s = parseDateOnly(b.start);
    const e = parseDateOnly(b.end);
    if (s) dates.push(s);
    if (e) dates.push(e);
  }
  if (dates.length === 0) return null;

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Margem para o item nao encostar na borda do grafico.
  const pad = Math.max(3, Math.round((max.getTime() - min.getTime()) / 86_400_000 * 0.04));
  min.setDate(min.getDate() - pad);
  max.setDate(max.getDate() + pad);
  return { min, max };
}

function buildTicks(min: Date, max: Date, scale: GanttScale) {
  const ticks: { key: string; label: string }[] = [];
  const cursor = new Date(min);

  const push = (label: string) => ticks.push({ key: `${cursor.toISOString()}-${label}`, label });

  while (cursor <= max && ticks.length < 80) {
    switch (scale) {
      case 'dia':
        push(cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        cursor.setDate(cursor.getDate() + 1);
        break;
      case 'semana':
        push(`S${isoWeek(cursor)}`);
        cursor.setDate(cursor.getDate() + 7);
        break;
      case 'mes':
        push(cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''));
        cursor.setMonth(cursor.getMonth() + 1, 1);
        break;
      case 'trimestre':
        push(`T${Math.floor(cursor.getMonth() / 3) + 1}/${String(cursor.getFullYear()).slice(2)}`);
        cursor.setMonth(cursor.getMonth() + 3, 1);
        break;
      case 'ano':
        push(String(cursor.getFullYear()));
        cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
        break;
    }
  }
  return ticks;
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
