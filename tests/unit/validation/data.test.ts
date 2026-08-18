import { describe, it, expect } from 'vitest';
import {
  dataEntityNoFields,
  dataNamingViolation,
  dataRefMissing,
  dataEnumEmpty,
  dataBindingRefMissing,
  dataBindingModeUnsupported,
  dataTypeMismatch,
  dataRequiredNoDefault,
  dataUniqueDuplicates,
  dataUncastableType,
  dataUnreferencedEntity,
  dataListNoSort,
  dataFilterComponentRefMissing,
  dataLargeTableNoPagination,
} from '@/lib/validation/rules/data';
import { makeSpec, makeCtx, makeEntity, makeField, makeNode } from './fixtures';

const ctx = makeCtx();

describe('E-DATA-001 필드 0개', () => {
  it('통과: 필드 있음', () => expect(dataEntityNoFields.run(makeSpec({ entities: [makeEntity({ fields: [makeField()] })] }), ctx)).toEqual([]));
  it('위반: 필드 0개', () => expect(dataEntityNoFields.run(makeSpec({ entities: [makeEntity({ fields: [] })] }), ctx)).toHaveLength(1));
});

describe('E-DATA-002 이름 규칙', () => {
  it('통과: 정상', () => expect(dataNamingViolation.run(makeSpec({ entities: [makeEntity({ tableName: 'orders', fields: [makeField({ columnName: 'name' })] })] }), ctx)).toEqual([]));
  it('위반: 예약어 테이블명', () => expect(dataNamingViolation.run(makeSpec({ entities: [makeEntity({ tableName: 'select' })] }), ctx).length).toBeGreaterThan(0));
  it('위반: 컬럼명 중복', () =>
    expect(
      dataNamingViolation.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ id: 'f1', columnName: 'x' }), makeField({ id: 'f2', columnName: 'x' })] })] }), ctx)
    ).toHaveLength(2));
});

describe('E-DATA-003 REF 대상 없음', () => {
  it('통과: 유효한 대상', () =>
    expect(dataRefMissing.run(makeSpec({ entities: [makeEntity({ id: 'e1' }), makeEntity({ id: 'e2', fields: [makeField({ dataType: 'REF', refEntityId: 'e1' })] })] }), ctx)).toEqual([]));
  it('위반: 대상 없음', () => expect(dataRefMissing.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'REF', refEntityId: null })] })] }), ctx)).toHaveLength(1));
});

describe('E-DATA-004 ENUM 값 목록 비어있음', () => {
  it('통과: 값 있음', () => expect(dataEnumEmpty.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'ENUM', enumValues: ['a'] })] })] }), ctx)).toEqual([]));
  it('위반: 비어있음', () => expect(dataEnumEmpty.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'ENUM', enumValues: [] })] })] }), ctx)).toHaveLength(1));
});

describe('E-DATA-005 바인딩 참조 없음', () => {
  it('통과: 유효한 참조', () =>
    expect(
      dataBindingRefMissing.run(
        makeSpec({ entities: [makeEntity({ fields: [makeField({ id: 'f1' })] })], nodes: [makeNode({ binding: { mode: 'field', entityId: 'e1', fieldId: 'f1' } })] }),
        ctx
      )
    ).toEqual([]));
  it('위반: 없는 엔티티', () => expect(dataBindingRefMissing.run(makeSpec({ nodes: [makeNode({ binding: { mode: 'field', entityId: 'ghost', fieldId: 'f1' } })] }), ctx)).toHaveLength(1));
});

describe('E-DATA-006 바인딩 모드 미지원', () => {
  it('통과: 지원하는 모드', () =>
    expect(dataBindingModeUnsupported.run(makeSpec({ nodes: [makeNode({ binding: { mode: 'field' } })] }), makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: ['field'], events: [] }) }))).toEqual([]));
  it('위반: 미지원 모드', () =>
    expect(dataBindingModeUnsupported.run(makeSpec({ nodes: [makeNode({ binding: { mode: 'list' } })] }), makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: ['field'], events: [] }) }))).toHaveLength(1));
});

describe('E-DATA-007 타입 불일치', () => {
  it('통과: 호환됨', () =>
    expect(
      dataTypeMismatch.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ id: 'f1', dataType: 'BOOLEAN' })] })], nodes: [makeNode({ type: 'switch', binding: { mode: 'field', entityId: 'e1', fieldId: 'f1' } })] }), ctx)
    ).toEqual([]));
  it('위반: DATE 필드에 slider', () =>
    expect(
      dataTypeMismatch.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ id: 'f1', dataType: 'DATE' })] })], nodes: [makeNode({ type: 'slider', binding: { mode: 'field', entityId: 'e1', fieldId: 'f1' } })] }), ctx)
    ).toHaveLength(1));
});

describe('E-DATA-008 required+기본값 없음+기존 행', () => {
  it('통과: 행이 없으면', () => expect(dataRequiredNoDefault.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ isRequired: true, defaultVal: null })] })] }), ctx)).toEqual([]));
  it('위반: 행이 있는데 컬럼이 아직 없으면(= 새 required 필드 추가)', () =>
    expect(dataRequiredNoDefault.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ isRequired: true, defaultVal: null })] })] }), makeCtx({ getRowCount: () => 5 }))).toHaveLength(1));
  it('통과: 행이 있어도 컬럼이 이미 app.db에 있으면(기존 required 컬럼)', () =>
    expect(
      dataRequiredNoDefault.run(
        makeSpec({ entities: [makeEntity({ fields: [makeField({ isRequired: true, defaultVal: null })] })] }),
        makeCtx({ getRowCount: () => 5, getColumnType: () => 'TEXT' })
      )
    ).toEqual([]));
});

describe('E-DATA-009 UNIQUE인데 중복 존재', () => {
  it('통과: 중복 없음', () => expect(dataUniqueDuplicates.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ isUnique: true })] })] }), ctx)).toEqual([]));
  it('위반: 중복 있음', () =>
    expect(dataUniqueDuplicates.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ isUnique: true })] })] }), makeCtx({ hasDuplicateValues: () => true }))).toHaveLength(1));
});

describe('E-DATA-010 캐스팅 불가 행', () => {
  it('통과: 타입 일치(드리프트 없음)', () =>
    expect(dataUncastableType.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'TEXT' })] })] }), makeCtx({ getColumnType: () => 'TEXT' }))).toEqual([]));
  it('위반: 타입 드리프트 + 캐스팅 불가 값', () =>
    expect(
      dataUncastableType.run(
        makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'INTEGER' })] })] }),
        makeCtx({ getColumnType: () => 'TEXT', hasUncastableValues: () => true })
      )
    ).toHaveLength(1));
});

describe('W-DATA-011 참조되지 않는 엔티티', () => {
  it('통과: 컴포넌트가 참조', () => expect(dataUnreferencedEntity.run(makeSpec({ entities: [makeEntity()], nodes: [makeNode({ binding: { mode: 'field', entityId: 'e1' } })] }), ctx)).toEqual([]));
  it('위반: 아무도 참조 안 함', () => expect(dataUnreferencedEntity.run(makeSpec({ entities: [makeEntity()] }), ctx)).toHaveLength(1));
});

describe('W-DATA-012 list 바인딩 정렬 미지정', () => {
  it('통과: 정렬 있음', () => expect(dataListNoSort.run(makeSpec({ nodes: [makeNode({ binding: { mode: 'list', sort: [{ fieldId: 'f1', dir: 'asc' }] } })] }), ctx)).toEqual([]));
  it('위반: 정렬 없음', () => expect(dataListNoSort.run(makeSpec({ nodes: [makeNode({ binding: { mode: 'list', sort: [] } })] }), ctx)).toHaveLength(1));
});

describe('W-DATA-013 필터의 component 참조 대상 없음', () => {
  it('통과: 같은 페이지에 있음', () =>
    expect(
      dataFilterComponentRefMissing.run(makeSpec({ nodes: [makeNode({ id: 'n1', pageId: 'p1', binding: { mode: 'list', filters: [{ source: 'component', ref: 'n2' }] } }), makeNode({ id: 'n2', pageId: 'p1' })] }), ctx)
    ).toEqual([]));
  it('위반: 같은 페이지에 없음', () =>
    expect(dataFilterComponentRefMissing.run(makeSpec({ nodes: [makeNode({ id: 'n1', pageId: 'p1', binding: { mode: 'list', filters: [{ source: 'component', ref: 'ghost' }] } })] }), ctx)).toHaveLength(1));
});

describe('W-DATA-014 1000행 이상인데 페이지네이션 없음', () => {
  it('통과: 행이 적으면', () =>
    expect(dataLargeTableNoPagination.run(makeSpec({ entities: [makeEntity()], nodes: [makeNode({ type: 'table', binding: { mode: 'list', entityId: 'e1' } })] }), makeCtx({ getRowCount: () => 10 }))).toEqual([]));
  it('위반: 1000행 이상', () =>
    expect(
      dataLargeTableNoPagination.run(makeSpec({ entities: [makeEntity()], nodes: [makeNode({ type: 'table', binding: { mode: 'list', entityId: 'e1' } })] }), makeCtx({ getRowCount: () => 1200 }))
    ).toHaveLength(1));
});
