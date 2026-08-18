import { issue } from '@/lib/validation/helpers';
import { isRelationAllowed, type RefType } from '@/types/graph';
import type { ValidationRule, DraftSpec, ValidationTargetType } from '@/lib/validation/types';

function existsInSpec(spec: DraftSpec, type: ValidationTargetType, id: string): boolean {
  switch (type) {
    case 'PAGE':
      return spec.pages.some((p) => p.id === id);
    case 'COMPONENT':
      return spec.nodes.some((n) => n.id === id);
    case 'ENTITY':
      return spec.entities.some((e) => e.id === id);
    case 'ACTION':
      return spec.actions.some((a) => a.id === id);
    default:
      return true;
  }
}

export const relEndpointMissing: ValidationRule = {
  code: 'E-REL-001',
  run: (spec) =>
    spec.relations
      .filter((r) => !existsInSpec(spec, r.fromType, r.fromId) || !existsInSpec(spec, r.toType, r.toId))
      .map((r) => issue('E-REL-001', 'error', 'relation', `연결의 시작/끝 요소가 존재하지 않습니다.`, { type: 'RELATION', id: r.id }, false)),
};

const EDITABLE_KINDS = new Set(['READS', 'WRITES', 'TRIGGERS', 'NAVIGATES']);

export const relCombinationNotAllowed: ValidationRule = {
  code: 'E-REL-002',
  run: (spec) =>
    spec.relations
      .filter((r) => EDITABLE_KINDS.has(r.kind) && !isRelationAllowed(r.kind as 'READS' | 'WRITES' | 'TRIGGERS' | 'NAVIGATES', r.fromType as RefType, r.toType as RefType))
      .map((r) => issue('E-REL-002', 'error', 'relation', `허용되지 않은 연결 조합입니다: ${r.fromType}→${r.toType} (${r.kind})`, { type: 'RELATION', id: r.id }, false)),
};

export const relReferencesMismatch: ValidationRule = {
  code: 'E-REL-003',
  run: (spec) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (f.dataType !== 'REF') continue;
        if (!f.refEntityId || !spec.entities.some((t) => t.id === f.refEntityId)) {
          issues.push(issue('E-REL-003', 'error', 'relation', `REFERENCES 연결이 실제 REF 필드와 일치하지 않습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    return issues;
  },
};

export const relTriggersMismatch: ValidationRule = {
  code: 'E-REL-004',
  run: (spec) => {
    const issues = [];
    const nodesById = new Map(spec.nodes.map((n) => [n.id, n]));
    for (const r of spec.relations) {
      if (r.kind !== 'TRIGGERS') continue;
      const node = nodesById.get(r.fromId);
      const linked = node && Object.values(node.events).includes(r.toId);
      if (!linked) {
        issues.push(issue('E-REL-004', 'error', 'relation', `TRIGGERS 연결이 컴포넌트의 이벤트 설정과 일치하지 않습니다.`, { type: 'RELATION', id: r.id }, false));
      }
    }
    return issues;
  },
};

export const relOrphanNode: ValidationRule = {
  code: 'W-REL-005',
  run: (spec) => {
    const connected = new Set<string>();
    for (const r of spec.relations) {
      connected.add(r.fromId);
      connected.add(r.toId);
    }
    for (const n of spec.nodes) {
      // 파생 CONTAINS 엣지: 자식 노드는 부모 노드와, 루트 노드는 자신의 페이지와 연결된다
      // (§5 lib/db/graph.ts의 CONTAINS 파생 로직과 동일한 연결 판정 — 노드 자신의 id를
      // 반드시 넣어야 한다, 그 반대편(부모 노드/페이지)만 넣으면 노드 자신은 여전히 고아로 남는다).
      connected.add(n.id);
      if (n.parentNodeId) connected.add(n.parentNodeId);
      else connected.add(n.pageId);
    }
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (f.dataType === 'REF' && f.refEntityId) {
          connected.add(e.id);
          connected.add(f.refEntityId);
        }
      }
    }
    const issues = [];
    for (const n of spec.nodes) if (!connected.has(n.id)) issues.push(issue('W-REL-005', 'warning', 'relation', `연결이 하나도 없는 고아 컴포넌트입니다.`, { type: 'COMPONENT', id: n.id }, false));
    for (const e of spec.entities) if (!connected.has(e.id)) issues.push(issue('W-REL-005', 'warning', 'relation', `연결이 하나도 없는 고아 엔티티입니다: ${e.name}`, { type: 'ENTITY', id: e.id }, false));
    for (const a of spec.actions) {
      const usedAsTarget = spec.relations.some((r) => r.toId === a.id);
      if (!usedAsTarget) issues.push(issue('W-REL-005', 'warning', 'relation', `연결이 하나도 없는 고아 액션입니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
    }
    return issues;
  },
};

export const relManyToManyNoJunction: ValidationRule = {
  code: 'W-REL-006',
  run: (spec) => {
    const issues = [];
    for (const r of spec.relations) {
      if (r.kind !== 'REFERENCES' || r.cardinality !== 'MANY_TO_MANY') continue;
      const hasJunction = spec.entities.some(
        (e) => e.id !== r.fromId && e.id !== r.toId && e.fields.some((f) => f.refEntityId === r.fromId) && e.fields.some((f) => f.refEntityId === r.toId)
      );
      if (!hasJunction) issues.push(issue('W-REL-006', 'warning', 'relation', `N:M 관계인데 연결 테이블 엔티티가 없습니다.`, { type: 'RELATION', id: r.id }, false));
    }
    return issues;
  },
};

export const relUnreachablePage: ValidationRule = {
  code: 'W-REL-007',
  run: (spec) => {
    const home = spec.pages.find((p) => p.isHome);
    if (!home) return [];
    const reachable = new Set<string>([home.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of spec.relations) {
        if (r.kind !== 'NAVIGATES') continue;
        // Action→Page: 그 액션을 트리거하는 컴포넌트가 도달 가능한 페이지에 있으면 대상 페이지도 도달 가능
        // Component→Page: 그 컴포넌트가 도달 가능한 페이지에 있으면 대상 페이지도 도달 가능
        let sourceReachable = false;
        if (r.fromType === 'COMPONENT') {
          const node = spec.nodes.find((n) => n.id === r.fromId);
          if (node && reachable.has(node.pageId)) sourceReachable = true;
        } else if (r.fromType === 'ACTION') {
          const triggeringNode = spec.nodes.find((n) => Object.values(n.events).includes(r.fromId));
          if (triggeringNode && reachable.has(triggeringNode.pageId)) sourceReachable = true;
        }
        if (sourceReachable && !reachable.has(r.toId)) {
          reachable.add(r.toId);
          changed = true;
        }
      }
    }
    return spec.pages
      .filter((p) => p.isVisible && !reachable.has(p.id))
      .map((p) => issue('W-REL-007', 'warning', 'relation', `어떤 액션·컴포넌트로도 도달할 수 없는 페이지입니다: ${p.title}`, { type: 'PAGE', id: p.id }, false));
  },
};

export const relationRules: ValidationRule[] = [
  relEndpointMissing,
  relCombinationNotAllowed,
  relReferencesMismatch,
  relTriggersMismatch,
  relOrphanNode,
  relManyToManyNoJunction,
  relUnreachablePage,
];
