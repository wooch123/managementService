import { describe, it, expect } from 'vitest';
import { quoteIdent, isValidIdentifierFormat, isReservedIdentifier, toSnakeCase } from '@/lib/data-engine/identifiers';

describe('quoteIdent — 식별자 화이트리스트 게이트', () => {
  it('정상 식별자는 따옴표로 감싸 반환한다', () => {
    expect(quoteIdent('status')).toBe('"status"');
    expect(quoteIdent('order_amount')).toBe('"order_amount"');
  });

  it('SQL 인젝션을 시도하는 문자열은 형식 위반으로 차단한다', () => {
    expect(() => quoteIdent('status"; DROP TABLE orders; --')).toThrow();
    expect(() => quoteIdent("status' OR '1'='1")).toThrow();
    expect(() => quoteIdent('status; DELETE FROM orders')).toThrow();
    expect(() => quoteIdent('a b')).toThrow();
    expect(() => quoteIdent('1abc')).toThrow();
  });

  it('id/created_at/updated_at은 암묵 컬럼이라 quoteIdent를 통과한다 — 예약어 차단은 필드명 검증(entity.ts) 몫', () => {
    expect(quoteIdent('id')).toBe('"id"');
    expect(quoteIdent('created_at')).toBe('"created_at"');
    expect(quoteIdent('select')).toBe('"select"'); // 따옴표로 감싸면 SQLite에서 키워드와 충돌하지 않는다
  });
});

describe('toSnakeCase', () => {
  it('공백/하이픈을 밑줄로, 대문자를 소문자로 정규화한다', () => {
    expect(toSnakeCase('Order Amount')).toBe('order_amount');
    expect(toSnakeCase('order-amount')).toBe('order_amount');
  });

  it('라틴 문자가 하나도 남지 않으면 임의 접미사로 대체한다', () => {
    expect(toSnakeCase('주문')).toMatch(/^f_/);
  });

  it('숫자로 시작하면 임의 접미사로 대체한다', () => {
    expect(toSnakeCase('123field')).toMatch(/^f_/);
  });
});

describe('isValidIdentifierFormat / isReservedIdentifier', () => {
  it('형식 검사', () => {
    expect(isValidIdentifierFormat('order_amount')).toBe(true);
    expect(isValidIdentifierFormat('Order')).toBe(false);
    expect(isValidIdentifierFormat('1order')).toBe(false);
    expect(isValidIdentifierFormat('order amount')).toBe(false);
  });

  it('예약어 검사는 대소문자를 구분하지 않는다', () => {
    expect(isReservedIdentifier('SELECT')).toBe(true);
    expect(isReservedIdentifier('select')).toBe(true);
    expect(isReservedIdentifier('order_amount')).toBe(false);
  });
});
