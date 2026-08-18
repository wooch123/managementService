import { describe, it, expect } from 'vitest';
import {
  structPagesEmpty,
  structHomeCount,
  structSlug,
  structPageCycle,
  structPageDepth,
  structNodeCycle,
  structUnknownType,
  structNonContainerChildren,
  structAllowedChildren,
  structEmptyVisiblePage,
  structGridOverflow,
  structGridOverlap,
  structTopPageNoIcon,
} from '@/lib/validation/rules/structure';
import { makeSpec, makeCtx, makePage, makeNode } from './fixtures';

const ctx = makeCtx();

describe('E-STRUCT-001 페이지 0개', () => {
  it('통과: 페이지가 있으면', () => expect(structPagesEmpty.run(makeSpec({ pages: [makePage()] }), ctx)).toEqual([]));
  it('위반: 페이지가 0개면', () => expect(structPagesEmpty.run(makeSpec(), ctx)).toHaveLength(1));
});

describe('E-STRUCT-002 isHome 정확히 1개', () => {
  it('통과: 정확히 1개', () => expect(structHomeCount.run(makeSpec({ pages: [makePage({ isHome: true })] }), ctx)).toEqual([]));
  it('위반: 0개', () => expect(structHomeCount.run(makeSpec({ pages: [makePage({ isHome: false })] }), ctx)).toHaveLength(1));
  it('위반: 2개', () =>
    expect(
      structHomeCount.run(makeSpec({ pages: [makePage({ id: 'p1', isHome: true }), makePage({ id: 'p2', isHome: true })] }), ctx)
    ).toHaveLength(1));
});

describe('E-STRUCT-003 slug 중복/형식', () => {
  it('통과: 유효하고 유일한 slug', () => expect(structSlug.run(makeSpec({ pages: [makePage({ slug: 'ok-slug' })] }), ctx)).toEqual([]));
  it('위반: 형식 오류', () => expect(structSlug.run(makeSpec({ pages: [makePage({ slug: 'Bad Slug!' })] }), ctx)).toHaveLength(1));
  it('위반: 중복', () =>
    expect(structSlug.run(makeSpec({ pages: [makePage({ id: 'p1', slug: 'dup' }), makePage({ id: 'p2', slug: 'dup' })] }), ctx)).toHaveLength(2));
});

describe('E-STRUCT-004 페이지 순환 참조', () => {
  it('통과: 정상 계층', () => expect(structPageCycle.run(makeSpec({ pages: [makePage({ id: 'p1' }), makePage({ id: 'p2', parentId: 'p1' })] }), ctx)).toEqual([]));
  it('위반: 순환', () =>
    expect(
      structPageCycle.run(makeSpec({ pages: [makePage({ id: 'p1', parentId: 'p2' }), makePage({ id: 'p2', parentId: 'p1' })] }), ctx)
    ).toHaveLength(2));
});

describe('E-STRUCT-005 계층 깊이 > 2', () => {
  it('통과: 2단', () => expect(structPageDepth.run(makeSpec({ pages: [makePage({ id: 'p1' }), makePage({ id: 'p2', parentId: 'p1' })] }), ctx)).toEqual([]));
  it('위반: 3단', () =>
    expect(
      structPageDepth.run(
        makeSpec({ pages: [makePage({ id: 'p1' }), makePage({ id: 'p2', parentId: 'p1' }), makePage({ id: 'p3', parentId: 'p2' })] }),
        ctx
      )
    ).toHaveLength(1));
});

describe('E-STRUCT-006 컴포넌트 순환 참조', () => {
  it('통과: 정상 트리', () => expect(structNodeCycle.run(makeSpec({ nodes: [makeNode({ id: 'n1' }), makeNode({ id: 'n2', parentNodeId: 'n1' })] }), ctx)).toEqual([]));
  it('위반: 순환', () =>
    expect(
      structNodeCycle.run(makeSpec({ nodes: [makeNode({ id: 'n1', parentNodeId: 'n2' }), makeNode({ id: 'n2', parentNodeId: 'n1' })] }), ctx)
    ).toHaveLength(2));
});

describe('E-STRUCT-007 카탈로그에 없는 타입', () => {
  it('통과: 알려진 타입', () => expect(structUnknownType.run(makeSpec({ nodes: [makeNode({ type: 'button' })] }), ctx)).toEqual([]));
  it('위반: 모르는 타입', () =>
    expect(structUnknownType.run(makeSpec({ nodes: [makeNode({ type: 'nope' })] }), makeCtx({ getComponentMeta: () => undefined }))).toHaveLength(1));
});

describe('E-STRUCT-008 비컨테이너에 자식', () => {
  const nonContainerCtx = makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: [], events: [] }) });
  it('통과: 자식 없음', () => expect(structNonContainerChildren.run(makeSpec({ nodes: [makeNode({ id: 'n1' })] }), nonContainerCtx)).toEqual([]));
  it('위반: 비컨테이너에 자식', () =>
    expect(structNonContainerChildren.run(makeSpec({ nodes: [makeNode({ id: 'n1' }), makeNode({ id: 'n2', parentNodeId: 'n1' })] }), nonContainerCtx)).toHaveLength(1));
});

describe('E-STRUCT-009 allowedChildren 위반', () => {
  const restrictiveCtx = makeCtx({ getComponentMeta: (t) => (t === 'card' ? { isContainer: true, allowedChildren: ['button'], bindingModes: [], events: [] } : { isContainer: false, allowedChildren: null, bindingModes: [], events: [] }) });
  it('통과: 허용된 자식', () =>
    expect(structAllowedChildren.run(makeSpec({ nodes: [makeNode({ id: 'n1', type: 'card' }), makeNode({ id: 'n2', type: 'button', parentNodeId: 'n1' })] }), restrictiveCtx)).toEqual([]));
  it('위반: 허용 안 된 자식', () =>
    expect(structAllowedChildren.run(makeSpec({ nodes: [makeNode({ id: 'n1', type: 'card' }), makeNode({ id: 'n2', type: 'input', parentNodeId: 'n1' })] }), restrictiveCtx)).toHaveLength(1));
});

describe('W-STRUCT-010 컴포넌트 0개인 표시 페이지', () => {
  it('통과: 컴포넌트 있음', () => expect(structEmptyVisiblePage.run(makeSpec({ pages: [makePage()], nodes: [makeNode({ pageId: 'p1' })] }), ctx)).toEqual([]));
  it('위반: 표시되는데 컴포넌트 없음', () => expect(structEmptyVisiblePage.run(makeSpec({ pages: [makePage({ isVisible: true })] }), ctx)).toHaveLength(1));
});

describe('W-STRUCT-011 그리드 12칼럼 초과', () => {
  it('통과: 12 이내', () => expect(structGridOverflow.run(makeSpec({ nodes: [makeNode({ grid: { col: 10, span: 2, row: 1, rowSpan: 1 } })] }), ctx)).toEqual([]));
  it('위반: 초과', () => expect(structGridOverflow.run(makeSpec({ nodes: [makeNode({ grid: { col: 11, span: 5, row: 1, rowSpan: 1 } })] }), ctx)).toHaveLength(1));
});

describe('W-STRUCT-012 그리드 완전 겹침', () => {
  it('통과: 안 겹침', () =>
    expect(
      structGridOverlap.run(makeSpec({ nodes: [makeNode({ id: 'n1', grid: { col: 1, span: 2, row: 1, rowSpan: 1 } }), makeNode({ id: 'n2', grid: { col: 3, span: 2, row: 1, rowSpan: 1 } })] }), ctx)
    ).toEqual([]));
  it('위반: 완전히 겹침', () =>
    expect(
      structGridOverlap.run(makeSpec({ nodes: [makeNode({ id: 'n1', grid: { col: 1, span: 2, row: 1, rowSpan: 1 } }), makeNode({ id: 'n2', grid: { col: 1, span: 2, row: 1, rowSpan: 1 } })] }), ctx)
    ).toHaveLength(1));
});

describe('W-STRUCT-013 아이콘 없는 최상위 페이지', () => {
  it('통과: 아이콘 있음', () => expect(structTopPageNoIcon.run(makeSpec({ pages: [makePage({ icon: 'home' })] }), ctx)).toEqual([]));
  it('위반: 아이콘 없음', () => expect(structTopPageNoIcon.run(makeSpec({ pages: [makePage({ icon: null })] }), ctx)).toHaveLength(1));
});
