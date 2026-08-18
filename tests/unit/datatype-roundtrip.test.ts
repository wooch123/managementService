import { describe, it, expect } from 'vitest';
import { toStorageValue, fromStorageValue } from '@/lib/data-engine/crud';
import { DATA_TYPES } from '@/types/entity';

describe('§6.2 데이터 타입 왕복 변환 (저장 → 조회)', () => {
  it('9개 dataType 전체를 다룬다', () => {
    expect(DATA_TYPES.length).toBe(9);
  });

  it('TEXT', () => {
    const stored = toStorageValue('TEXT', '안녕하세요');
    expect(fromStorageValue('TEXT', stored)).toBe('안녕하세요');
  });

  it('INTEGER', () => {
    const stored = toStorageValue('INTEGER', 42);
    expect(fromStorageValue('INTEGER', stored)).toBe(42);
  });

  it('INTEGER — 정수가 아니면 에러', () => {
    expect(() => toStorageValue('INTEGER', 3.14)).toThrow();
  });

  it('REAL', () => {
    const stored = toStorageValue('REAL', 3.14);
    expect(fromStorageValue('REAL', stored)).toBe(3.14);
  });

  it('BOOLEAN', () => {
    expect(fromStorageValue('BOOLEAN', toStorageValue('BOOLEAN', true))).toBe(true);
    expect(fromStorageValue('BOOLEAN', toStorageValue('BOOLEAN', false))).toBe(false);
  });

  it('DATE', () => {
    const stored = toStorageValue('DATE', '2026-08-18');
    expect(stored).toBe('2026-08-18');
    expect(fromStorageValue('DATE', stored)).toBe('2026-08-18');
  });

  it('DATETIME — ISO 8601 UTC로 정규화된다', () => {
    const stored = toStorageValue('DATETIME', '2026-08-18T03:00:00.000Z');
    expect(stored).toBe('2026-08-18T03:00:00.000Z');
    expect(fromStorageValue('DATETIME', stored)).toBe('2026-08-18T03:00:00.000Z');
  });

  it('JSON', () => {
    const original = { a: 1, b: [1, 2, 3], c: { nested: true } };
    const stored = toStorageValue('JSON', original);
    expect(typeof stored).toBe('string');
    expect(fromStorageValue('JSON', stored)).toEqual(original);
  });

  it('ENUM', () => {
    const stored = toStorageValue('ENUM', 'active');
    expect(fromStorageValue('ENUM', stored)).toBe('active');
  });

  it('REF', () => {
    const stored = toStorageValue('REF', 'cus_abc123');
    expect(fromStorageValue('REF', stored)).toBe('cus_abc123');
  });

  it('null 값은 타입에 관계없이 null을 유지한다', () => {
    for (const t of DATA_TYPES) {
      expect(toStorageValue(t, null)).toBeNull();
      expect(fromStorageValue(t, null)).toBeNull();
    }
  });
});
