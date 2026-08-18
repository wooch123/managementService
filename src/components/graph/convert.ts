import { MarkerType } from '@xyflow/react';
import type { GraphNodeDto, GraphEdgeDto } from '@/lib/db/graph';
import type { RFNode, RFEdge } from '@/components/graph/types';

const NODE_TYPE_MAP: Record<GraphNodeDto['refType'], string> = {
  PAGE: 'page',
  COMPONENT: 'component',
  ENTITY: 'entity',
  ACTION: 'action',
};

/**
 * React Flow 노드 id로는 GraphNode.id 대신 refId(도메인 엔티티 id)를 쓴다 — refId는 cuid라
 * 4종 모델 전체에서 전역 유일하고, 엣지의 fromId/toId도 refId 기준이라 이렇게 하면 별도
 * id 매핑 없이 source/target이 그대로 맞아떨어진다. GraphNode.id는 서버 쪽 좌표 저장
 * 테이블의 내부 PK일 뿐, 프런트에는 노출하지 않는다.
 */
export function toRFNode(n: GraphNodeDto & { data: unknown }): RFNode {
  return {
    id: n.refId,
    type: NODE_TYPE_MAP[n.refType],
    position: { x: n.x, y: n.y },
    data: { refType: n.refType, refId: n.refId, ...(n.data as object) } as RFNode['data'],
    draggable: !n.isPinned,
  };
}

const ARROW_COLOR: Record<string, string> = {
  READS: '#8b5cf6',
  WRITES: '#f59e0b',
  TRIGGERS: '#f59e0b',
  NAVIGATES: '#3b82f6',
};

export function toRFEdge(e: GraphEdgeDto): RFEdge {
  const base = {
    id: e.id,
    source: e.fromId,
    target: e.toId,
    type: 'relation',
    data: { kind: e.kind, cardinality: e.cardinality, labelText: e.labelText, derived: e.derived },
    selectable: !e.derived,
    deletable: !e.derived,
  };

  if (e.kind === 'CONTAINS') return { ...base, markerStart: 'url(#marker-diamond)' };
  if (e.kind === 'REFERENCES') return { ...base, markerEnd: 'url(#marker-crowsfoot)' };
  return { ...base, markerEnd: { type: MarkerType.ArrowClosed, color: ARROW_COLOR[e.kind] ?? '#64748b' } };
}
