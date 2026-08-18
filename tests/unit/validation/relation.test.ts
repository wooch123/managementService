import { describe, it, expect } from 'vitest';
import {
  relEndpointMissing,
  relCombinationNotAllowed,
  relReferencesMismatch,
  relTriggersMismatch,
  relOrphanNode,
  relManyToManyNoJunction,
  relUnreachablePage,
} from '@/lib/validation/rules/relation';
import { makeSpec, makeCtx, makeNode, makeEntity, makeField, makeRelation, makePage } from './fixtures';

const ctx = makeCtx();

describe('E-REL-001 엣지 endpoint 없음', () => {
  it('통과: 둘 다 존재', () => expect(relEndpointMissing.run(makeSpec({ nodes: [makeNode({ id: 'n1' })], entities: [makeEntity({ id: 'e1' })], relations: [makeRelation({ fromId: 'n1', toId: 'e1' })] }), ctx)).toEqual([]));
  it('위반: from 없음', () => expect(relEndpointMissing.run(makeSpec({ entities: [makeEntity({ id: 'e1' })], relations: [makeRelation({ fromId: 'ghost', toId: 'e1' })] }), ctx)).toHaveLength(1));
});

describe('E-REL-002 허용 안 된 조합', () => {
  it('통과: COMPONENT→ENTITY READS', () => expect(relCombinationNotAllowed.run(makeSpec({ relations: [makeRelation({ fromType: 'COMPONENT', toType: 'ENTITY', kind: 'READS' })] }), ctx)).toEqual([]));
  it('위반: COMPONENT→COMPONENT WRITES', () => expect(relCombinationNotAllowed.run(makeSpec({ relations: [makeRelation({ fromType: 'COMPONENT', toType: 'COMPONENT', kind: 'WRITES' })] }), ctx)).toHaveLength(1));
});

describe('E-REL-003 REFERENCES와 REF 필드 불일치', () => {
  it('통과: 대상 엔티티 존재', () => expect(relReferencesMismatch.run(makeSpec({ entities: [makeEntity({ id: 'e1' }), makeEntity({ id: 'e2', fields: [makeField({ dataType: 'REF', refEntityId: 'e1' })] })] }), ctx)).toEqual([]));
  it('위반: 대상 없음', () => expect(relReferencesMismatch.run(makeSpec({ entities: [makeEntity({ fields: [makeField({ dataType: 'REF', refEntityId: null })] })] }), ctx)).toHaveLength(1));
});

describe('E-REL-004 TRIGGERS와 eventsJson 불일치', () => {
  it('통과: 이벤트에 실제로 연결됨', () =>
    expect(relTriggersMismatch.run(makeSpec({ nodes: [makeNode({ id: 'n1', events: { onClick: 'a1' } })], relations: [makeRelation({ fromType: 'COMPONENT', fromId: 'n1', toType: 'ACTION', toId: 'a1', kind: 'TRIGGERS' })] }), ctx)).toEqual([]));
  it('위반: 이벤트에 연결 안 됨', () =>
    expect(relTriggersMismatch.run(makeSpec({ nodes: [makeNode({ id: 'n1', events: {} })], relations: [makeRelation({ fromType: 'COMPONENT', fromId: 'n1', toType: 'ACTION', toId: 'a1', kind: 'TRIGGERS' })] }), ctx)).toHaveLength(1));
});

describe('W-REL-005 고아 노드', () => {
  it('통과: 루트 컴포넌트(페이지에 CONTAINS로 연결됨)', () => expect(relOrphanNode.run(makeSpec({ nodes: [makeNode({ id: 'n1', pageId: 'p1', parentNodeId: null })] }), ctx)).toEqual([]));
  it('위반: 엔티티가 아무 연결도 없음', () => expect(relOrphanNode.run(makeSpec({ entities: [makeEntity({ id: 'e1' })] }), ctx)).toHaveLength(1));
});

describe('W-REL-006 N:M인데 연결 테이블 없음', () => {
  it('통과: 연결 테이블 존재', () =>
    expect(
      relManyToManyNoJunction.run(
        makeSpec({
          entities: [
            makeEntity({ id: 'e1' }),
            makeEntity({ id: 'e2' }),
            makeEntity({ id: 'e3', fields: [makeField({ id: 'f1', dataType: 'REF', refEntityId: 'e1' }), makeField({ id: 'f2', dataType: 'REF', refEntityId: 'e2' })] }),
          ],
          relations: [makeRelation({ fromType: 'ENTITY', fromId: 'e1', toType: 'ENTITY', toId: 'e2', kind: 'REFERENCES', cardinality: 'MANY_TO_MANY' })],
        }),
        ctx
      )
    ).toEqual([]));
  it('위반: 연결 테이블 없음', () =>
    expect(relManyToManyNoJunction.run(makeSpec({ relations: [makeRelation({ fromType: 'ENTITY', fromId: 'e1', toType: 'ENTITY', toId: 'e2', kind: 'REFERENCES', cardinality: 'MANY_TO_MANY' })] }), ctx)).toHaveLength(1));
});

describe('W-REL-007 도달 불가능한 페이지', () => {
  it('통과: NAVIGATES로 도달 가능', () =>
    expect(
      relUnreachablePage.run(
        makeSpec({
          pages: [makePage({ id: 'home', isHome: true }), makePage({ id: 'p2' })],
          nodes: [makeNode({ id: 'n1', pageId: 'home' })],
          relations: [makeRelation({ fromType: 'COMPONENT', fromId: 'n1', toType: 'PAGE', toId: 'p2', kind: 'NAVIGATES' })],
        }),
        ctx
      )
    ).toEqual([]));
  it('위반: 도달 불가', () => expect(relUnreachablePage.run(makeSpec({ pages: [makePage({ id: 'home', isHome: true }), makePage({ id: 'p2', isVisible: true })] }), ctx)).toHaveLength(1));
});
