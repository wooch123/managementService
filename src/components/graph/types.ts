import type { Node, Edge } from '@xyflow/react';
import type { RefType } from '@/types/graph';

export type PageNodeData = { title: string; slug: string; icon: string | null; childCount: number };
export type ComponentNodeData = { type: string; label: string | null; hasBinding: boolean; eventCount: number; pageId: string };
export type EntityFieldSummary = { name: string; dataType: string; isPrimary: boolean; isUnique: boolean; isRequired: boolean };
export type EntityNodeData = { name: string; fields: EntityFieldSummary[] };
export type ActionNodeData = { name: string; kind: string; description: string | null };

export type GraphNodeData =
  | ({ refType: 'PAGE'; refId: string } & PageNodeData)
  | ({ refType: 'COMPONENT'; refId: string } & ComponentNodeData)
  | ({ refType: 'ENTITY'; refId: string } & EntityNodeData)
  | ({ refType: 'ACTION'; refId: string } & ActionNodeData);

export type RFNode = Node<Record<string, unknown> & GraphNodeData>;
export type RFEdgeData = { kind: string; cardinality: string | null; labelText: string | null; derived: boolean };
export type RFEdge = Edge<RFEdgeData>;

export const TYPE_LABEL: Record<RefType, string> = {
  PAGE: '페이지',
  COMPONENT: '컴포넌트',
  ENTITY: '엔티티',
  ACTION: '액션',
};

/**
 * 관계도의 종류별 색 — 기본 테마와 같은 언어를 쓴다(sample page/tech report page.html).
 * 컴포넌트는 노드 수가 가장 많아 무채색으로 물러나게 두고, 나머지 셋에 강조색을 준다.
 */
export const TYPE_COLOR: Record<RefType, string> = {
  PAGE: '#7759f4', // violet — 강조색
  COMPONENT: '#9ba2a9', // subtle — 가장 많은 노드라 뒤로 물린다
  ENTITY: '#34a875', // green
  ACTION: '#e9904e', // orange
};
