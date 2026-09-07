import { describe, expect, it } from 'vitest';
import { fromTypedValue, toTypedValue } from '../customFields';
import type { CustomFieldValue } from '@/types/domain';

function value(overrides: Partial<CustomFieldValue> = {}): CustomFieldValue {
  return {
    id: '1', definition_id: 'd1', project_id: 'p1', entity: 'project', record_id: 'r1',
    value_text: null, value_number: null, value_date: null, value_timestamp: null,
    value_boolean: null, value_uuid: null, value_json: null,
    ...overrides,
  };
}

describe('toTypedValue', () => {
  it('grava numeros na coluna numerica', () => {
    expect(toTypedValue('moeda', '1500.5')).toMatchObject({ value_number: 1500.5, value_text: null });
    expect(toTypedValue('percentual', 42)).toMatchObject({ value_number: 42 });
  });

  it('grava datas na coluna de data', () => {
    expect(toTypedValue('data', '2026-03-10')).toMatchObject({ value_date: '2026-03-10' });
  });

  it('grava referencias de usuario e area como uuid', () => {
    const uuid = '11111111-1111-4111-8111-000000000001';
    expect(toTypedValue('usuario', uuid)).toMatchObject({ value_uuid: uuid });
    expect(toTypedValue('area', uuid)).toMatchObject({ value_uuid: uuid });
  });

  it('grava multipla escolha como array json', () => {
    expect(toTypedValue('multipla_escolha', ['a', 'b'])).toMatchObject({ value_json: ['a', 'b'] });
    expect(toTypedValue('multipla_escolha', 'a')).toMatchObject({ value_json: ['a'] });
  });

  it('limpa todas as colunas quando o valor e vazio', () => {
    const cleared = toTypedValue('texto', '');
    expect(Object.values(cleared).every((v) => v === null)).toBe(true);
  });

  it('usa a coluna de texto como padrao', () => {
    expect(toTypedValue('texto', 'IFRS 18')).toMatchObject({ value_text: 'IFRS 18' });
    expect(toTypedValue('url', 'https://x.com')).toMatchObject({ value_text: 'https://x.com' });
  });
});

describe('fromTypedValue', () => {
  it('le a coluna correta para cada tipo', () => {
    expect(fromTypedValue('numero', value({ value_number: 12 }))).toBe(12);
    expect(fromTypedValue('data', value({ value_date: '2026-03-10' }))).toBe('2026-03-10');
    expect(fromTypedValue('boolean', value({ value_boolean: true }))).toBe(true);
    expect(fromTypedValue('texto', value({ value_text: 'ok' }))).toBe('ok');
    expect(fromTypedValue('multipla_escolha', value({ value_json: ['a'] }))).toEqual(['a']);
  });

  it('devolve vazio quando nao ha valor gravado', () => {
    expect(fromTypedValue('texto', undefined)).toBe('');
    expect(fromTypedValue('boolean', undefined)).toBe(false);
  });

  it('faz round-trip preservando o valor', () => {
    const typed = toTypedValue('moeda', '2500');
    expect(fromTypedValue('moeda', value(typed))).toBe(2500);
  });
});
