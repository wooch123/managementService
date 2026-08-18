import { describe, it, expect } from 'vitest';
import { depDestructiveUnconfirmed, depMigrationDryRunFailed, depSpecParseFailed, depDeletedPagesSincePublish, depNoChanges } from '@/lib/validation/rules/deploy';
import { makeSpec, makeCtx, makePage, makeEntity, makeField, makeAction, makeRelation } from './fixtures';

const ctx = makeCtx();

describe('E-DEP-001 파괴적 변경 미확인', () => {
  it('통과: 확인됨', () =>
    expect(
      depDestructiveUnconfirmed.run(makeSpec(), makeCtx({ deploy: { ...ctx.deploy, pendingDestructiveChanges: [{ id: 'c1', description: '필드 삭제' }], acceptedDestructiveIds: new Set(['c1']) } }))
    ).toEqual([]));
  it('위반: 미확인', () =>
    expect(depDestructiveUnconfirmed.run(makeSpec(), makeCtx({ deploy: { ...ctx.deploy, pendingDestructiveChanges: [{ id: 'c1', description: '필드 삭제' }] } }))).toHaveLength(1));
});

describe('E-DEP-002 마이그레이션 드라이런 실패', () => {
  it('통과: 오류 없음', () => expect(depMigrationDryRunFailed.run(makeSpec(), ctx)).toEqual([]));
  it('위반: 오류 있음', () => expect(depMigrationDryRunFailed.run(makeSpec(), makeCtx({ deploy: { ...ctx.deploy, migrationDryRunError: 'SQL error' } }))).toHaveLength(1));
});

describe('E-DEP-003 드래프트 스펙 파싱 실패', () => {
  it('통과: 전부 유효', () => expect(depSpecParseFailed.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'TEXT' })] })] }), ctx)).toEqual([]));
  it('위반: 알 수 없는 dataType', () => expect(depSpecParseFailed.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'WEIRD' })] })] }), ctx)).toHaveLength(1));
  it('위반: 액션 config가 스키마에 안 맞음', () => expect(depSpecParseFailed.run(makeSpec({ actions: [makeAction({ config: { kind: 'CREATE' } as never })] }), ctx)).toHaveLength(1));
  it('위반: 알 수 없는 relation kind', () => expect(depSpecParseFailed.run(makeSpec({ relations: [makeRelation({ kind: 'WEIRD' })] }), ctx)).toHaveLength(1));
});

describe('W-DEP-004 이전 리비전 대비 삭제된 페이지', () => {
  it('통과: 이전 리비전 없음(최초 배포)', () => expect(depDeletedPagesSincePublish.run(makeSpec({ pages: [makePage({ slug: 'a' })] }), ctx)).toEqual([]));
  it('위반: 이전에 있던 페이지가 삭제됨', () =>
    expect(depDeletedPagesSincePublish.run(makeSpec({ pages: [makePage({ slug: 'a' })] }), makeCtx({ deploy: { ...ctx.deploy, previousRevisionPageSlugs: ['a', 'b'] } }))).toHaveLength(1));
});

describe('I-DEP-005 변경 사항 없음', () => {
  it('통과: 변경 있음 → 정보 없음', () => expect(depNoChanges.run(makeSpec(), ctx)).toEqual([]));
  it('발생: 변경 없음 → 정보성 이슈', () => expect(depNoChanges.run(makeSpec(), makeCtx({ deploy: { ...ctx.deploy, hasChangesSincePublish: false } }))).toHaveLength(1));
});
