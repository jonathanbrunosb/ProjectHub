import { describe, expect, it } from 'vitest';
import {
  businessDaysBetween, calculateDeliveryScore, calculateProjectIndicator, equalWeights,
  validateWeightSum,
} from '../goalScore';

const base = {
  targetDate: '2026-10-10', challengeDays: 2, minimumDays: 5, dayBasis: 'corridos' as const,
};

describe('calculateDeliveryScore - Desafio ate Meta (racional minimo = 5 dias)', () => {
  it('2 dias antes = 15 (desafio)', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-08' }).score).toBe(15);
  });
  it('1 dia antes = 12,5', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-09' }).score).toBe(12.5);
  });
  it('no prazo = 10 (meta)', () => {
    const r = calculateDeliveryScore({ ...base, actualDate: '2026-10-10' });
    expect(r.score).toBe(10);
    expect(r.classification).toBe('meta');
  });
  it('mais de 2 dias antes ainda limita a 15 (nunca ultrapassa o desafio)', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-01' }).score).toBe(15);
  });
});

describe('calculateDeliveryScore - Meta ate Racional minimo de 5 dias', () => {
  it('+1 dia = 8,2', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-11' }).score).toBe(8.2);
  });
  it('+2 dias = 6,4', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-12' }).score).toBe(6.4);
  });
  it('+5 dias = 1 (racional minimo)', () => {
    const r = calculateDeliveryScore({ ...base, actualDate: '2026-10-15' });
    expect(r.score).toBe(1);
    expect(r.classification).toBe('racional_minimo');
  });
  it('+10 dias continua em 1 (nunca abaixo do minimo)', () => {
    expect(calculateDeliveryScore({ ...base, actualDate: '2026-10-20' }).score).toBe(1);
  });
});

describe('calculateDeliveryScore - Racional minimo de 10 dias', () => {
  const b10 = { ...base, minimumDays: 10 };
  it('+1 dia = 9,1', () => {
    expect(calculateDeliveryScore({ ...b10, actualDate: '2026-10-11' }).score).toBe(9.1);
  });
  it('+5 dias = 5,5', () => {
    expect(calculateDeliveryScore({ ...b10, actualDate: '2026-10-15' }).score).toBe(5.5);
  });
  it('+10 dias = 1', () => {
    expect(calculateDeliveryScore({ ...b10, actualDate: '2026-10-20' }).score).toBe(1);
  });
});

describe('calculateDeliveryScore - nota projetada', () => {
  it('entrega ainda aberta usa a data de hoje e marca isProjected', () => {
    const r = calculateDeliveryScore({
      ...base, actualDate: null, today: '2026-10-12',
    });
    expect(r.isProjected).toBe(true);
    expect(r.score).toBe(6.4);
  });

  it('entrega concluida nao e projetada', () => {
    const r = calculateDeliveryScore({ ...base, actualDate: '2026-10-10' });
    expect(r.isProjected).toBe(false);
  });
});

describe('businessDaysBetween - dias uteis', () => {
  it('sexta para segunda = 1 dia util de atraso (fim de semana nao conta)', () => {
    // 09/10/2026 e' sexta-feira; 12/10/2026 e' segunda-feira.
    expect(businessDaysBetween('2026-10-09', '2026-10-12')).toBe(1);
  });

  it('segunda para sexta = 4 dias uteis', () => {
    expect(businessDaysBetween('2026-10-05', '2026-10-09')).toBe(4);
  });

  it('respeita feriados cadastrados', () => {
    // 12/10 e' feriado nacional (Nossa Senhora Aparecida) - nao deve contar.
    const holidays = new Set(['2026-10-12']);
    expect(businessDaysBetween('2026-10-09', '2026-10-13', holidays)).toBe(1);
  });

  it('e simetrico e negativo quando a entrega e antes do prazo', () => {
    expect(businessDaysBetween('2026-10-12', '2026-10-09')).toBe(-1);
  });

  it('datas iguais = 0', () => {
    expect(businessDaysBetween('2026-10-10', '2026-10-10')).toBe(0);
  });
});

describe('calculateDeliveryScore - base de dias uteis', () => {
  it('atraso de fim de semana nao penaliza como dia corrido', () => {
    // Meta = sexta 09/10; entrega = segunda 12/10 -> 1 dia util, nao 3.
    const r = calculateDeliveryScore({
      targetDate: '2026-10-09', actualDate: '2026-10-12',
      challengeDays: 2, minimumDays: 5, dayBasis: 'uteis',
    });
    expect(r.differenceDays).toBe(1);
    expect(r.score).toBe(8.2);
  });
});

describe('calculateProjectIndicator', () => {
  it('exemplo do enunciado: 15x20% + 10x30% + 8x50% = 10', () => {
    const r = calculateProjectIndicator([
      { scoreRealized: 15, scoreProjected: 15, weight: 20 },
      { scoreRealized: 10, scoreProjected: 10, weight: 30 },
      { scoreRealized: 8, scoreProjected: 8, weight: 50 },
    ]);
    expect(r.indicatorRealized).toBe(10);
    expect(r.indicatorProjected).toBe(10);
  });

  it('realizado considera so entregas concluidas; projetado considera todas', () => {
    const r = calculateProjectIndicator([
      { scoreRealized: 15, scoreProjected: 15, weight: 10 },
      { scoreRealized: 12.5, scoreProjected: 12.5, weight: 20 },
      { scoreRealized: 10, scoreProjected: 10, weight: 30 },
      { scoreRealized: null, scoreProjected: 8.2, weight: 20 },
      { scoreRealized: null, scoreProjected: 10, weight: 20 },
    ]);
    expect(r.deliveriesDone).toBe(3);
    expect(r.deliveriesPending).toBe(2);
    // Realizado: (15*10 + 12.5*20 + 10*30) / 60 = 700/60
    expect(r.indicatorRealized).toBeCloseTo(11.67, 1);
    // Projetado: (15*10 + 12.5*20 + 10*30 + 8.2*20 + 10*20) / 100 = 1064/100
    expect(r.indicatorProjected).toBeCloseTo(10.64, 1);
  });

  it('nenhuma entrega concluida -> indicador realizado nulo (Pendente)', () => {
    const r = calculateProjectIndicator([{ scoreRealized: null, scoreProjected: 8, weight: 100 }]);
    expect(r.indicatorRealized).toBeNull();
    expect(r.indicatorProjected).toBe(8);
  });

  it('lista vazia -> ambos nulos', () => {
    const r = calculateProjectIndicator([]);
    expect(r.indicatorRealized).toBeNull();
    expect(r.indicatorProjected).toBeNull();
  });
});

describe('pesos', () => {
  it('soma 100% e valida', () => {
    expect(validateWeightSum([10, 25, 20, 20, 25])).toEqual({ sum: 100, valid: true });
  });

  it('soma abaixo de 100% e invalida', () => {
    const r = validateWeightSum([50, 45]);
    expect(r.sum).toBe(95);
    expect(r.valid).toBe(false);
  });

  it('soma acima de 100% e invalida', () => {
    const r = validateWeightSum([60, 60]);
    expect(r.sum).toBe(120);
    expect(r.valid).toBe(false);
  });

  it('distribuicao igual para 20 entregas da 5% cada', () => {
    expect(equalWeights(20)).toBe(5);
  });

  it('distribuicao igual com zero entregas nao divide por zero', () => {
    expect(equalWeights(0)).toBe(0);
  });
});
