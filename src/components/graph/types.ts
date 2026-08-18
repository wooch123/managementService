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

export const TYPE_COLOR: Record<RefType, string> = {
  PAGE: '#3b82f6', // blue
  COMPONENT: '#8b5cf6', // violet
  ENTITY: '#10b981', // emerald
  ACTION: '#f59e0b', // amber
};
