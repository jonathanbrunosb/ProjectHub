/**
 * Paleta unica dos graficos, alinhada a semantica de status da plataforma.
 * Ler do CSS garante consistencia automatica entre tema claro e escuro.
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : fallback;
}

export function chartColors() {
  return {
    brand: cssVar('--c-brand', 'rgb(29,78,216)'),
    ok: cssVar('--c-ok', 'rgb(22,163,74)'),
    warn: cssVar('--c-warn', 'rgb(217,119,6)'),
    danger: cssVar('--c-danger', 'rgb(220,38,38)'),
    info: cssVar('--c-info', 'rgb(2,132,199)'),
    strategic: cssVar('--c-strategic', 'rgb(124,58,237)'),
    muted: cssVar('--c-muted', 'rgb(100,116,139)'),
    border: cssVar('--c-border', 'rgb(226,232,240)'),
    surface: cssVar('--c-surface', 'rgb(255,255,255)'),
    fg: cssVar('--c-fg', 'rgb(15,23,42)'),
  };
}

const categoricalPalette = [
  '--c-brand', '--c-info', '--c-strategic', '--c-ok', '--c-warn', '--c-danger',
];

export function categoricalColor(index: number): string {
  return cssVar(categoricalPalette[index % categoricalPalette.length], 'rgb(29,78,216)');
}
