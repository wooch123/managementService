import { describe, it, expect, vi } from 'vitest';
import type { Filter } from '@/types/binding';
import type { ResolvedEntity } from '@/lib/data-engine/query';

// 이 파일은 필터 해석(순수 로직)만 본다 — 조회 계층은 열지 않는다.
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/app-db', () => ({ getAppDb: () => { throw new Error('DB를 열면 안 되는 테스트다'); } }));

const { resolveRuntimeFilters } = await import('@/lib/runtime/binding-query');

/**
 * 필터 값 소스 해석 — 기간 필터가 주소에 심은 값이 바인딩 조건이 되는 지점.
 *
 * 가장 중요한 규칙: **값이 없으면 조건을 걸지 않는다**. 빈 값을 그대로 바인딩하면
 * `received_date >= ''`가 되어 아무 행도 안 맞고, 기간을 고르지 않은 사용자에게 빈 대시보드를
 * 보여주게 된다.
 */
const ENTITY = {
  id: 'e1',
  tableName: 'claims',
  fields: [
    { id: 'f-date', columnName: 'received_date', dataType: 'DATE' },
    { id: 'f-at', columnName: 'written_at', dataType: 'DATETIME' },
    { id: 'f-status', columnName: 'claim_status', dataType: 'ENUM' },
  ],
} as unknown as ResolvedEntity;

const from: Filter = { fieldId: 'f-date', op: 'gte', source: 'query', ref: 'from' };
const to: Filter = { fieldId: 'f-date', op: 'lte', source: 'query', ref: 'to' };
const fixed: Filter = { fieldId: 'f-status', op: 'eq', source: 'fixed', value: '분석중' };

describe('필터 값 소스 해석', () => {
  it('고정값 조건은 그대로 남는다', () => {
    expect(resolveRuntimeFilters(ENTITY, [fixed], {})).toEqual([fixed]);
  });

  it('주소 쿼리 값이 있으면 그 값으로 조건을 만든다', () => {
    expect(resolveRuntimeFilters(ENTITY, [from, to], { from: '2026-05-19', to: '2026-08-19' })).toEqual([
      { ...from, value: '2026-05-19' },
      { ...to, value: '2026-08-19' },
    ]);
  });

  it('주소 쿼리 값이 없으면 조건 자체를 뺀다 (전체 조회가 된다)', () => {
    expect(resolveRuntimeFilters(ENTITY, [from, to, fixed], {})).toEqual([fixed]);
    expect(resolveRuntimeFilters(ENTITY, [from, to], { from: '' })).toEqual([]);
  });

  it('한쪽 경계만 있으면 그 조건만 남는다', () => {
    expect(resolveRuntimeFilters(ENTITY, [from, to], { from: '2026-01-01' })).toEqual([{ ...from, value: '2026-01-01' }]);
  });

  it('ref가 비어 있는 주소 쿼리 조건은 뺀다', () => {
    expect(resolveRuntimeFilters(ENTITY, [{ ...from, ref: undefined }], { from: '2026-05-19' })).toEqual([]);
  });

  it('컴포넌트 값 조건은 서버 초기 조회 시점에 값이 없으므로 뺀다', () => {
    expect(resolveRuntimeFilters(ENTITY, [{ fieldId: 'f-status', op: 'eq', source: 'component', ref: 'node1' }], {})).toEqual([]);
  });

  it('DATETIME 컬럼의 상한은 그날 끝까지 올린다 (하루가 통째로 빠지지 않게)', () => {
    const dtTo: Filter = { fieldId: 'f-at', op: 'lte', source: 'query', ref: 'to' };
    expect(resolveRuntimeFilters(ENTITY, [dtTo], { to: '2026-08-19' })).toEqual([
      { ...dtTo, value: '2026-08-19T23:59:59.999Z' },
    ]);
  });

  it('DATE 컬럼의 상한과 DATETIME의 하한은 손대지 않는다', () => {
    expect(resolveRuntimeFilters(ENTITY, [to], { to: '2026-08-19' })?.[0].value).toBe('2026-08-19');
    const dtFrom: Filter = { fieldId: 'f-at', op: 'gte', source: 'query', ref: 'from' };
    expect(resolveRuntimeFilters(ENTITY, [dtFrom], { from: '2026-08-19' })?.[0].value).toBe('2026-08-19');
  });

  // 선택 상세(record-detail)가 쓰는 규칙. 조건을 빼 버리면 아무것도 고르지 않았는데 표의 첫 행이
  // 상세 패널에 나와, 고르지도 않은 항목이 선택된 것처럼 보인다.
  it("whenMissing: 'empty'는 값이 없으면 '결과 없음'(null)을 돌려준다", () => {
    const selection: Filter = { fieldId: 'f-status', op: 'eq', source: 'query', ref: 'sel', whenMissing: 'empty' };
    expect(resolveRuntimeFilters(ENTITY, [selection], {})).toBeNull();
    expect(resolveRuntimeFilters(ENTITY, [selection], { sel: '' })).toBeNull();
    expect(resolveRuntimeFilters(ENTITY, [selection], { sel: 'FAR-26-4514' })).toEqual([
      { ...selection, value: 'FAR-26-4514' },
    ]);
  });

  it("whenMissing이 없으면 지금까지처럼 조건을 뺀다(제한 없음)", () => {
    const optional: Filter = { fieldId: 'f-status', op: 'eq', source: 'query', ref: 'status' };
    expect(resolveRuntimeFilters(ENTITY, [optional], {})).toEqual([]);
  });
});
