const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact', maximumFractionDigits: 1,
});

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0));
}

/** R$ 1,4 mi - usado em KPIs executivos onde o espaco e' curto. */
export function formatCurrencyCompact(value: number | null | undefined): string {
  return `R$ ${compactFormatter.format(Number(value ?? 0))}`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value ?? 0))}%`;
}

/** Variacao com sinal explicito: +8,2% / -3,0%. */
export function formatDelta(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(n)}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseDateOnly(value) : value;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatMonth(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseDateOnly(value);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

/**
 * Datas do PostgreSQL vem como 'YYYY-MM-DD'. Interpretar com new Date() aplica
 * UTC e desloca o dia no fuso do Brasil - por isso a construcao explicita.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(from: string | Date | null, to: string | Date | null): number | null {
  const a = typeof from === 'string' ? parseDateOnly(from) : from;
  const b = typeof to === 'string' ? parseDateOnly(to) : to;
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function relativeFromNow(value: string | null | undefined): string {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const diff = Math.round((d.getTime() - Date.now()) / 60_000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diff, 'minute');
  if (abs < 1440) return rtf.format(Math.round(diff / 60), 'hour');
  if (abs < 43200) return rtf.format(Math.round(diff / 1440), 'day');
  return rtf.format(Math.round(diff / 43200), 'month');
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
