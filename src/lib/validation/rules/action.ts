import { issue } from '@/lib/validation/helpers';
import type { ValidationRule } from '@/lib/validation/types';

const MODAL_TYPES = new Set(['dialog', 'sheet', 'drawer', 'popover', 'hover-card']);

type ValueSourceLike = { from: string; nodeId?: string } | undefined;
type CreateUpdateConfig = { entityId?: string; fieldMap?: Record<string, ValueSourceLike>; keySource?: ValueSourceLike; onSuccess?: string; onError?: string };

export const actEventTargetMissing: ValidationRule = {
  code: 'E-ACT-001',
  run: (spec) => {
    const actionIds = new Set(spec.actions.map((a) => a.id));
    const issues = [];
    for (const n of spec.nodes) {
      for (const actionId of Object.values(n.events)) {
        if (!actionIds.has(actionId)) {
          issues.push(issue('E-ACT-001', 'error', 'action', `연결된 액션이 존재하지 않습니다.`, { type: 'COMPONENT', id: n.id }, true));
        }
      }
    }
    return issues;
  },
};

export const actRefMissing: ValidationRule = {
  code: 'E-ACT-002',
  run: (spec) => {
    const pageIds = new Set(spec.pages.map((p) => p.id));
    const entityIds = new Set(spec.entities.map((e) => e.id));
    const nodeIds = new Set(spec.nodes.map((n) => n.id));
    const issues = [];
    for (const a of spec.actions) {
      const c = a.config as { entityId?: string; pageId?: string; targetNodeId?: string };
      if (c.entityId && !entityIds.has(c.entityId)) issues.push(issue('E-ACT-002', 'error', 'action', `존재하지 않는 엔티티를 참조합니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
      if (c.pageId && !pageIds.has(c.pageId)) issues.push(issue('E-ACT-002', 'error', 'action', `존재하지 않는 페이지를 참조합니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
      if (c.targetNodeId && !nodeIds.has(c.targetNodeId)) issues.push(issue('E-ACT-002', 'error', 'action', `존재하지 않는 컴포넌트를 참조합니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
    }
    return issues;
  },
};

export const actCreateMissingRequired: ValidationRule = {
  code: 'E-ACT-003',
  run: (spec) => {
    const issues = [];
    for (const a of spec.actions) {
      if (a.kind !== 'CREATE') continue;
      const c = a.config as CreateUpdateConfig;
      const entity = spec.entities.find((e) => e.id === c.entityId);
      if (!entity) continue;
      const mapped = new Set(Object.keys(c.fieldMap ?? {}));
      for (const f of entity.fields) {
        if (f.isRequired && !f.defaultVal && !mapped.has(f.id)) {
          issues.push(issue('E-ACT-003', 'error', 'action', `필수 필드가 매핑되지 않았습니다: ${f.name}`, { type: 'ACTION', id: a.id }, false));
        }
      }
    }
    return issues;
  },
};

export const actFieldMapNodeMissing: ValidationRule = {
  code: 'E-ACT-004',
  run: (spec) => {
    const nodeIds = new Set(spec.nodes.map((n) => n.id));
    const issues = [];
    for (const a of spec.actions) {
      const c = a.config as CreateUpdateConfig;
      for (const src of Object.values(c.fieldMap ?? {})) {
        if (src && (src.from === 'component' || src.from === 'selection') && src.nodeId && !nodeIds.has(src.nodeId)) {
          issues.push(issue('E-ACT-004', 'error', 'action', `fieldMap이 존재하지 않는 노드를 참조합니다.`, { type: 'ACTION', id: a.id }, false));
        }
      }
    }
    return issues;
  },
};

export const actMissingKeySource: ValidationRule = {
  code: 'E-ACT-005',
  run: (spec) =>
    spec.actions
      .filter((a) => (a.kind === 'UPDATE' || a.kind === 'DELETE') && !(a.config as CreateUpdateConfig).keySource)
      .map((a) => issue('E-ACT-005', 'error', 'action', `${a.kind} 액션에 keySource가 없습니다: ${a.name}`, { type: 'ACTION', id: a.id }, false)),
};

export const actCompositeCycle: ValidationRule = {
  code: 'E-ACT-006',
  run: (spec) => {
    const issues = [];
    const byId = new Map(spec.actions.map((a) => [a.id, a]));
    for (const a of spec.actions) {
      if (a.kind !== 'COMPOSITE') continue;
      const visited = new Set<string>();
      const stack = [...((a.config as { steps?: string[] }).steps ?? [])];
      let cyclic = false;
      while (stack.length > 0) {
        const stepId = stack.pop()!;
        if (stepId === a.id) {
          cyclic = true;
          break;
        }
        if (visited.has(stepId)) continue;
        visited.add(stepId);
        const stepAction = byId.get(stepId);
        if (stepAction?.kind === 'COMPOSITE') stack.push(...((stepAction.config as { steps?: string[] }).steps ?? []));
      }
      if (cyclic) issues.push(issue('E-ACT-006', 'error', 'action', `COMPOSITE 액션에 순환 참조가 있습니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
    }
    return issues;
  },
};

export const actOpenModalTargetInvalid: ValidationRule = {
  code: 'E-ACT-007',
  run: (spec) => {
    const issues = [];
    const nodesById = new Map(spec.nodes.map((n) => [n.id, n]));
    for (const a of spec.actions) {
      if (a.kind !== 'OPEN_MODAL' && a.kind !== 'CLOSE_MODAL') continue;
      const targetNodeId = (a.config as { targetNodeId?: string }).targetNodeId;
      const target = targetNodeId ? nodesById.get(targetNodeId) : undefined;
      if (target && !MODAL_TYPES.has(target.type)) {
        issues.push(issue('E-ACT-007', 'error', 'action', `대상이 모달형 컴포넌트가 아닙니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
      }
    }
    return issues;
  },
};

export const actUnsupportedEvent: ValidationRule = {
  code: 'E-ACT-008',
  run: (spec, ctx) => {
    const issues = [];
    for (const n of spec.nodes) {
      const meta = ctx.getComponentMeta(n.type);
      if (!meta) continue;
      for (const eventName of Object.keys(n.events)) {
        if (!meta.events.includes(eventName)) {
          issues.push(issue('E-ACT-008', 'error', 'action', `이 컴포넌트가 지원하지 않는 이벤트입니다: ${eventName}`, { type: 'COMPONENT', id: n.id }, true));
        }
      }
    }
    return issues;
  },
};

export const actUnusedAction: ValidationRule = {
  code: 'W-ACT-009',
  run: (spec) => {
    const usedIds = new Set<string>();
    for (const n of spec.nodes) for (const actionId of Object.values(n.events)) usedIds.add(actionId);
    for (const a of spec.actions) for (const stepId of (a.config as { steps?: string[] }).steps ?? []) usedIds.add(stepId);
    for (const a of spec.actions) {
      const onSuccess = (a.config as CreateUpdateConfig).onSuccess;
      const onError = (a.config as CreateUpdateConfig).onError;
      if (onSuccess) usedIds.add(onSuccess);
      if (onError) usedIds.add(onError);
    }
    return spec.actions.filter((a) => !usedIds.has(a.id)).map((a) => issue('W-ACT-009', 'warning', 'action', `어떤 이벤트에도 연결되지 않은 액션입니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
  },
};

export const actDeleteNoConfirm: ValidationRule = {
  code: 'W-ACT-010',
  run: (spec) =>
    spec.actions
      .filter((a) => a.kind === 'DELETE' && !(a.config as { confirmText?: string }).confirmText)
      .map((a) => issue('W-ACT-010', 'warning', 'action', `DELETE 액션에 확인 문구가 없습니다: ${a.name}`, { type: 'ACTION', id: a.id }, true)),
};

export const actNoFollowUp: ValidationRule = {
  code: 'W-ACT-011',
  run: (spec) =>
    spec.actions
      .filter((a) => (a.kind === 'CREATE' || a.kind === 'UPDATE') && !(a.config as CreateUpdateConfig).onSuccess && !(a.config as CreateUpdateConfig).onError)
      .map((a) => issue('W-ACT-011', 'warning', 'action', `저장 액션에 성공/실패 후속 처리가 없습니다: ${a.name}`, { type: 'ACTION', id: a.id }, false)),
};

export const actUnusedFormInput: ValidationRule = {
  code: 'W-ACT-012',
  run: (spec, ctx) => {
    const usedNodeIds = new Set<string>();
    for (const a of spec.actions) {
      const c = a.config as CreateUpdateConfig;
      for (const src of Object.values(c.fieldMap ?? {})) {
        if (src?.from === 'component' && src.nodeId) usedNodeIds.add(src.nodeId);
      }
    }
    const issues: ReturnType<typeof issue>[] = [];
    for (const n of spec.nodes) {
      const meta = ctx.getComponentMeta(n.type);
      // "폼 입력 컴포넌트" = field 바인딩이 되면서 값 변경 이벤트가 있는 것. field 바인딩만으로
      // 판정하면 typography·badge·progress 같은 표시 전용 컴포넌트까지 입력으로 잡혀, 제목
      // 텍스트를 하나 놓을 때마다 경고가 뜬다(우측 패널 도입 후 실제로 13건까지 늘었다).
      if (!meta || meta.isContainer || !meta.bindingModes.includes('field') || meta.events.length === 0) continue;
      if (!usedNodeIds.has(n.id)) {
        issues.push(issue('W-ACT-012', 'warning', 'action', `폼 입력 컴포넌트가 어떤 액션에도 사용되지 않았습니다.`, { type: 'COMPONENT', id: n.id }, false));
      }
    }
    return issues;
  },
};

export const actionRules: ValidationRule[] = [
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
];
