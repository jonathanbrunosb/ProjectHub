import { describe, expect, it } from 'vitest';
import {
  daysBetween, formatCurrency, formatDate, formatPercent, initials, parseDateOnly, toISODate,
} from '../format';
import { riskCriticality } from '../domain-labels';

describe('parseDateOnly', () => {
  it('interpreta YYYY-MM-DD no fuso local, sem deslocar o dia', () => {
    // new Date('2026-03-10') seria UTC e viraria 09/03 no Brasil.
    const d = parseDateOnly('2026-03-10')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(10);
  });

  it('devolve null para valor ausente', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });
});

describe('formatadores', () => {
  it('formata moeda em BRL', () => {
    // O Intl usa espaco nao separavel (NBSP) depois do simbolo da moeda.
    const normalize = (v: string) => v.replace(/\s/g, ' ');
    expect(normalize(formatCurrency(1450000))).toBe('R$ 1.450.000,00');
    expect(normalize(formatCurrency(null))).toBe('R$ 0,00');
  });

  it('formata percentual com casas controladas', () => {
    expect(formatPercent(52.456)).toBe('52,5%');
    expect(formatPercent(52.456, 0)).toBe('52%');
  });

  it('formata data e trata nulo com travessao', () => {
    expect(formatDate('2026-03-10')).toBe('10/03/2026');
    expect(formatDate(null)).toBe('—');
  });

  it('gera iniciais a partir do nome', () => {
    expect(initials('Rafael Souza')).toBe('RS');
    expect(initials('Ana')).toBe('AN');
    expect(initials(null)).toBe('?');
  });

  it('converte Date para ISO sem deslocamento de fuso', () => {
    expect(toISODate(new Date(2026, 2, 10))).toBe('2026-03-10');
  });
});

describe('daysBetween', () => {
  it('calcula a diferenca em dias', () => {
    expect(daysBetween('2026-03-01', '2026-03-10')).toBe(9);
    expect(daysBetween('2026-03-10', '2026-03-01')).toBe(-9);
  });

  it('devolve null quando falta uma das datas', () => {
    expect(daysBetween(null, '2026-03-01')).toBeNull();
  });
});

describe('riskCriticality (matriz 5x5)', () => {
  it('classifica pelas faixas de score', () => {
    expect(riskCriticality(25)).toBe('critico');
    expect(riskCriticality(15)).toBe('critico');
    expect(riskCriticality(14)).toBe('alto');
    expect(riskCriticality(9)).toBe('alto');
    expect(riskCriticality(8)).toBe('moderado');
    expect(riskCriticality(4)).toBe('moderado');
    expect(riskCriticality(3)).toBe('baixo');
    expect(riskCriticality(1)).toBe('baixo');
  });
});
