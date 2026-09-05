import { describe, expect, it } from 'vitest';
import { resolveFinancialEnabled } from '../financialModule';

describe('resolveFinancialEnabled', () => {
  it('global ON + projeto ON (enabled) -> ativo', () => {
    expect(resolveFinancialEnabled('enabled', true)).toBe(true);
  });

  it('global ON + projeto OFF (disabled) -> inativo', () => {
    expect(resolveFinancialEnabled('disabled', true)).toBe(false);
  });

  it('global OFF + projeto ON (enabled) -> ativo (excecao por projeto)', () => {
    expect(resolveFinancialEnabled('enabled', false)).toBe(true);
  });

  it('global OFF + projeto OFF (disabled) -> inativo', () => {
    expect(resolveFinancialEnabled('disabled', false)).toBe(false);
  });

  it('inherit segue o global em ambos os sentidos', () => {
    expect(resolveFinancialEnabled('inherit', true)).toBe(true);
    expect(resolveFinancialEnabled('inherit', false)).toBe(false);
  });

  it('projeto sem modo definido (null/undefined) se comporta como inherit', () => {
    expect(resolveFinancialEnabled(null, true)).toBe(true);
    expect(resolveFinancialEnabled(undefined, false)).toBe(false);
  });
});
