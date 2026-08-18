import { describe, it, expect } from 'vitest';
import {
  actEventTargetMissing,
  actRefMissing,
  actCreateMissingRequired,
  actFieldMapNodeMissing,
  actMissingKeySource,
  actCompositeCycle,
  actOpenModalTargetInvalid,
  actUnsupportedEvent,
  actUnusedAction,
  actDeleteNoConfirm,
  actNoFollowUp,
  actUnusedFormInput,
} from '@/lib/validation/rules/action';
import { makeSpec, makeCtx, makeNode, makeAction, makeEntity, makeField } from './fixtures';

const ctx = makeCtx();

describe('E-ACT-001 이벤트에 연결된 actionId 없음', () => {
  it('통과: 존재하는 액션', () => expect(actEventTargetMissing.run(makeSpec({ nodes: [makeNode({ events: { onClick: 'a1' } })], actions: [makeAction({ id: 'a1' })] }), ctx)).toEqual([]));
  it('위반: 없는 액션', () => expect(actEventTargetMissing.run(makeSpec({ nodes: [makeNode({ events: { onClick: 'ghost' } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-002 액션 참조 없음', () => {
  it('통과: 유효한 엔티티', () => expect(actRefMissing.run(makeSpec({ entities: [makeEntity({ id: 'e1' })], actions: [makeAction({ config: { kind: 'CREATE', entityId: 'e1' } })] }), ctx)).toEqual([]));
  it('위반: 없는 엔티티', () => expect(actRefMissing.run(makeSpec({ actions: [makeAction({ config: { kind: 'CREATE', entityId: 'ghost' } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-003 CREATE required 필드 누락', () => {
  it('통과: 매핑됨', () =>
    expect(
      actCreateMissingRequired.run(
        makeSpec({ entities: [makeEntity({ id: 'e1', fields: [makeField({ id: 'f1', isRequired: true })] })], actions: [makeAction({ kind: 'CREATE', config: { kind: 'CREATE', entityId: 'e1', fieldMap: { f1: { from: 'literal', value: 1 } } } })] }),
        ctx
      )
    ).toEqual([]));
  it('위반: 누락', () =>
    expect(
      actCreateMissingRequired.run(
        makeSpec({ entities: [makeEntity({ id: 'e1', fields: [makeField({ id: 'f1', isRequired: true })] })], actions: [makeAction({ kind: 'CREATE', config: { kind: 'CREATE', entityId: 'e1', fieldMap: {} } })] }),
        ctx
      )
    ).toHaveLength(1));
});

describe('E-ACT-004 fieldMap이 없는 노드 참조', () => {
  it('통과: 존재하는 노드', () =>
    expect(actFieldMapNodeMissing.run(makeSpec({ nodes: [makeNode({ id: 'n1' })], actions: [makeAction({ config: { kind: 'CREATE', fieldMap: { f1: { from: 'component', nodeId: 'n1' } } } })] }), ctx)).toEqual([]));
  it('위반: 없는 노드', () => expect(actFieldMapNodeMissing.run(makeSpec({ actions: [makeAction({ config: { kind: 'CREATE', fieldMap: { f1: { from: 'component', nodeId: 'ghost' } } } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-005 UPDATE/DELETE에 keySource 없음', () => {
  it('통과: keySource 있음', () => expect(actMissingKeySource.run(makeSpec({ actions: [makeAction({ kind: 'DELETE', config: { kind: 'DELETE', keySource: { from: 'literal', value: 1 } } })] }), ctx)).toEqual([]));
  it('위반: keySource 없음', () => expect(actMissingKeySource.run(makeSpec({ actions: [makeAction({ kind: 'DELETE', config: { kind: 'DELETE' } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-006 COMPOSITE 순환 참조', () => {
  it('통과: 순환 없음', () =>
    expect(
      actCompositeCycle.run(makeSpec({ actions: [makeAction({ id: 'a1', kind: 'COMPOSITE', config: { kind: 'COMPOSITE', steps: ['a2'] } }), makeAction({ id: 'a2', kind: 'TOAST' })] }), ctx)
    ).toEqual([]));
  it('위반: 자기 자신을 스텝으로', () =>
    expect(actCompositeCycle.run(makeSpec({ actions: [makeAction({ id: 'a1', kind: 'COMPOSITE', config: { kind: 'COMPOSITE', steps: ['a1'] } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-007 OPEN_MODAL 대상이 모달 아님', () => {
  it('통과: dialog 대상', () =>
    expect(actOpenModalTargetInvalid.run(makeSpec({ nodes: [makeNode({ id: 'n1', type: 'dialog' })], actions: [makeAction({ kind: 'OPEN_MODAL', config: { kind: 'OPEN_MODAL', targetNodeId: 'n1' } })] }), ctx)).toEqual([]));
  it('위반: button 대상', () =>
    expect(actOpenModalTargetInvalid.run(makeSpec({ nodes: [makeNode({ id: 'n1', type: 'button' })], actions: [makeAction({ kind: 'OPEN_MODAL', config: { kind: 'OPEN_MODAL', targetNodeId: 'n1' } })] }), ctx)).toHaveLength(1));
});

describe('E-ACT-008 컴포넌트가 미지원 이벤트에 연결', () => {
  const eventCtx = makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: [], events: ['onClick'] }) });
  it('통과: 지원하는 이벤트', () => expect(actUnsupportedEvent.run(makeSpec({ nodes: [makeNode({ events: { onClick: 'a1' } })] }), eventCtx)).toEqual([]));
  it('위반: 미지원 이벤트', () => expect(actUnsupportedEvent.run(makeSpec({ nodes: [makeNode({ events: { onChange: 'a1' } })] }), eventCtx)).toHaveLength(1));
});

describe('W-ACT-009 어디에도 연결 안 된 액션', () => {
  it('통과: 이벤트에 연결됨', () => expect(actUnusedAction.run(makeSpec({ nodes: [makeNode({ events: { onClick: 'a1' } })], actions: [makeAction({ id: 'a1' })] }), ctx)).toEqual([]));
  it('위반: 아무데도 연결 안 됨', () => expect(actUnusedAction.run(makeSpec({ actions: [makeAction({ id: 'a1' })] }), ctx)).toHaveLength(1));
});

describe('W-ACT-010 DELETE에 확인 문구 없음', () => {
  it('통과: 확인 문구 있음', () => expect(actDeleteNoConfirm.run(makeSpec({ actions: [makeAction({ kind: 'DELETE', config: { kind: 'DELETE', confirmText: '확인?' } })] }), ctx)).toEqual([]));
  it('위반: 없음', () => expect(actDeleteNoConfirm.run(makeSpec({ actions: [makeAction({ kind: 'DELETE', config: { kind: 'DELETE' } })] }), ctx)).toHaveLength(1));
});

describe('W-ACT-011 저장 액션에 후속 처리 없음', () => {
  it('통과: onSuccess 있음', () => expect(actNoFollowUp.run(makeSpec({ actions: [makeAction({ kind: 'CREATE', config: { kind: 'CREATE', onSuccess: 'a2' } })] }), ctx)).toEqual([]));
  it('위반: 둘 다 없음', () => expect(actNoFollowUp.run(makeSpec({ actions: [makeAction({ kind: 'CREATE', config: { kind: 'CREATE' } })] }), ctx)).toHaveLength(1));
});

describe('W-ACT-012 폼 입력이 어떤 액션에도 안 쓰임', () => {
  // 실제 입력 컴포넌트: field 바인딩 + 값 변경 이벤트
  const inputCtx = makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: ['field'], events: ['onChange'] }) });
  // 표시 전용(typography 등): field 바인딩은 되지만 이벤트가 없다
  it('통과: fieldMap에서 사용됨', () =>
    expect(actUnusedFormInput.run(makeSpec({ nodes: [makeNode({ id: 'n1' })], actions: [makeAction({ config: { kind: 'CREATE', fieldMap: { f1: { from: 'component', nodeId: 'n1' } } } })] }), inputCtx)).toEqual([]));
  it('위반: 사용 안 됨', () => expect(actUnusedFormInput.run(makeSpec({ nodes: [makeNode({ id: 'n1' })] }), inputCtx)).toHaveLength(1));
  it('통과: 표시 전용 컴포넌트는 폼 입력으로 보지 않는다', () => {
    const displayCtx = makeCtx({ getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: ['field'], events: [] }) });
    expect(actUnusedFormInput.run(makeSpec({ nodes: [makeNode({ id: 'n1', type: 'typography' })] }), displayCtx)).toEqual([]);
  });
});
