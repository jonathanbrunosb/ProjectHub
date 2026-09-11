import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GanttChart, type GanttItem } from '../GanttChart';

const items: GanttItem[] = [
  {
    id: 'T001',
    label: 'T001 · Execucao de inventario',
    start: '2026-10-05',
    end: '2026-10-15',
    progress: 0,
    tone: 'neutral',
  },
  {
    id: 'T002',
    label: 'T002 · Execucao de inventario',
    start: '2026-10-19',
    end: '2026-10-23',
    progress: 0,
    tone: 'neutral',
  },
];

/** Spans de barra: os unicos com `left` no style inline dentro das linhas. */
function positionedBars(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('span[style*="left"]')];
}

describe('GanttChart', () => {
  it('desenha uma barra por item com data', () => {
    const { container } = render(<GanttChart items={items} scale="mes" />);
    expect(positionedBars(container)).toHaveLength(items.length);
  });

  it('ancora a barra no trilho da linha, nunca dentro do wrapper do Tooltip', () => {
    // Regressao real: o Tooltip renderiza `<span class="relative inline-flex">`.
    // Com a barra (position:absolute) dentro dele, o wrapper ficava com largura
    // zero - seu unico filho estava fora do fluxo - e a barra era dimensionada
    // contra esse zero, sumindo do cronograma. jsdom nao resolve layout, entao
    // a checagem e' estrutural: o pai posicionador precisa ser o trilho.
    const { container } = render(<GanttChart items={items} scale="mes" />);

    for (const bar of positionedBars(container)) {
      const parentClass = bar.parentElement?.className ?? '';
      expect(parentClass).toContain('flex-1');
      expect(parentClass).not.toContain('inline-flex');
    }
  });

  it('mantem a barra visivel com progresso zero', () => {
    const { container } = render(<GanttChart items={items} scale="mes" />);
    const [bar] = positionedBars(container);
    // A trilha de fundo continua renderizada mesmo sem preenchimento algum.
    expect(bar.querySelector('span')).not.toBeNull();
    expect(bar.style.width).not.toBe('');
    expect(bar.style.width).not.toBe('0%');
  });

  it('mostra o estado vazio quando nenhum item tem data', () => {
    render(<GanttChart items={[{ id: 'X', label: 'Sem data', start: null, end: null }]} />);
    expect(screen.getByText('Sem itens no cronograma')).toBeInTheDocument();
  });
});
