import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { RefType } from '@/types/graph';

const DEFAULT_W = 220;
const DEFAULT_H = 120;
const GRID_COLS = 5;
const GRID_STEP_X = 280;
const GRID_STEP_Y = 180;

export type GraphNodeDto = {
  id: string;
  refType: RefType;
  refId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPinned: boolean;
};

export type GraphEdgeDto = {
  id: string;
  fromType: RefType;
  fromId: string;
  toType: RefType;
  toId: string;
  kind: string;
  cardinality: string | null;
  labelText: string | null;
  derived: boolean;
};

/** GraphNode 행이 없는 요소(신규 생성된 페이지/컴포넌트/엔티티/액션)에 기본 좌표를 부여해 만든다.
 * §5.1 acceptance: "요소 추가 시 관계도에 자동 등장". */
async function ensureGraphNodes(refs: { refType: RefType; refId: string }[]): Promise<void> {
  if (refs.length === 0) return;
  const existing = await prisma.graphNode.findMany({ where: { refId: { in: refs.map((r) => r.refId) } }, select: { refId: true } });
  const existingIds = new Set(existing.map((e) => e.refId));
  const missing = refs.filter((r) => !existingIds.has(r.refId));
  if (missing.length === 0) return;

  // 이미 배치된 노드 개수를 기준으로 그리드 좌표를 이어서 배정한다(20px 그리드에 정렬).
  const placedCount = await prisma.graphNode.count();
  await prisma.$transaction(
    missing.map((ref, i) => {
      const idx = placedCount + i;
      const x = (idx % GRID_COLS) * GRID_STEP_X;
      const y = Math.floor(idx / GRID_COLS) * GRID_STEP_Y;
      return prisma.graphNode.create({
        data: {
          refType: ref.refType,
          refId: ref.refId,
          x,
          y,
          width: DEFAULT_W,
          height: DEFAULT_H,
          ...(ref.refType === 'PAGE' ? { pageId: ref.refId } : {}),
          ...(ref.refType === 'ACTION' ? { actionId: ref.refId } : {}),
        },
      });
    })
  );
}

export async function getGraphData() {
  const [pages, componentNodes, entities, actions] = await Promise.all([
    prisma.page.findMany(),
    prisma.componentNode.findMany(),
    prisma.entity.findMany({ include: { fields: { orderBy: { order: 'asc' } } } }),
    prisma.action.findMany(),
  ]);

  await ensureGraphNodes([
    ...pages.map((p) => ({ refType: 'PAGE' as const, refId: p.id })),
    ...componentNodes.map((c) => ({ refType: 'COMPONENT' as const, refId: c.id })),
    ...entities.map((e) => ({ refType: 'ENTITY' as const, refId: e.id })),
    ...actions.map((a) => ({ refType: 'ACTION' as const, refId: a.id })),
  ]);

  const graphNodeRows = await prisma.graphNode.findMany();
  const positions = new Map(graphNodeRows.map((g) => [g.refId, g]));

  const nodes: (GraphNodeDto & { data: unknown })[] = [];

  for (const p of pages) {
    const g = positions.get(p.id);
    if (!g) continue;
    const childCount = componentNodes.filter((c) => c.pageId === p.id && !c.parentNodeId).length;
    nodes.push({
      id: g.id,
      refType: 'PAGE',
      refId: p.id,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      isPinned: g.isPinned,
      data: { title: p.title, slug: p.slug, icon: p.icon, childCount },
    });
  }

  for (const c of componentNodes) {
    const g = positions.get(c.id);
    if (!g) continue;
    const events = JSON.parse(c.eventsJson) as Record<string, string>;
    nodes.push({
      id: g.id,
      refType: 'COMPONENT',
      refId: c.id,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      isPinned: g.isPinned,
      data: {
        type: c.type,
        label: c.label,
        hasBinding: c.bindingJson != null,
        eventCount: Object.keys(events).length,
        pageId: c.pageId,
      },
    });
  }

  for (const e of entities) {
    const g = positions.get(e.id);
    if (!g) continue;
    nodes.push({
      id: g.id,
      refType: 'ENTITY',
      refId: e.id,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      isPinned: g.isPinned,
      data: {
        name: e.name,
        fields: e.fields.map((f) => ({ name: f.name, dataType: f.dataType, isPrimary: f.isPrimary, isUnique: f.isUnique, isRequired: f.isRequired })),
      },
    });
  }

  for (const a of actions) {
    const g = positions.get(a.id);
    if (!g) continue;
    nodes.push({
      id: g.id,
      refType: 'ACTION',
      refId: a.id,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      isPinned: g.isPinned,
      data: { name: a.name, kind: a.kind, description: a.description },
    });
  }

  const edges: GraphEdgeDto[] = [];

  // 파생 엣지 1 — CONTAINS: Page→루트 컴포넌트, 컴포넌트→자식 컴포넌트
  for (const c of componentNodes) {
    if (!c.parentNodeId) {
      edges.push({
        id: `derived-contains-page-${c.id}`,
        fromType: 'PAGE',
        fromId: c.pageId,
        toType: 'COMPONENT',
        toId: c.id,
        kind: 'CONTAINS',
        cardinality: null,
        labelText: '포함',
        derived: true,
      });
    } else {
      edges.push({
        id: `derived-contains-${c.parentNodeId}-${c.id}`,
        fromType: 'COMPONENT',
        fromId: c.parentNodeId,
        toType: 'COMPONENT',
        toId: c.id,
        kind: 'CONTAINS',
        cardinality: null,
        labelText: '포함',
        derived: true,
      });
    }
  }

  // 파생 엣지 2 — REFERENCES: REF 타입 필드
  for (const e of entities) {
    for (const f of e.fields) {
      if (f.dataType === 'REF' && f.refEntityId) {
        edges.push({
          id: `derived-ref-${f.id}`,
          fromType: 'ENTITY',
          fromId: e.id,
          toType: 'ENTITY',
          toId: f.refEntityId,
          kind: 'REFERENCES',
          cardinality: f.isUnique ? 'ONE_TO_ONE' : 'ONE_TO_MANY',
          labelText: f.name,
          derived: true,
        });
      }
    }
  }

  // 사용자 편집 엣지 — Relation 테이블
  const relations = await prisma.relation.findMany();
  for (const r of relations) {
    edges.push({
      id: r.id,
      fromType: r.fromType as RefType,
      fromId: r.fromId,
      toType: r.toType as RefType,
      toId: r.toId,
      kind: r.kind,
      cardinality: r.cardinality,
      labelText: r.labelText,
      derived: false,
    });
  }

  return { nodes, edges };
}

/** Relation 테이블은 FK 무결성이 없다(설계상 fromId/toId가 4종 모델을 느슨하게 참조).
 * 요소 삭제 시 관련 Relation/GraphNode를 애플리케이션에서 직접 정리해야 한다. */
export async function deleteGraphArtifactsFor(refType: RefType, refId: string): Promise<void> {
  await prisma.relation.deleteMany({
    where: { OR: [{ fromType: refType, fromId: refId }, { toType: refType, toId: refId }] },
  });
  await prisma.graphNode.deleteMany({ where: { refType, refId } });
}

/** 페이지 삭제는 그 안의 ComponentNode를 DB cascade로 함께 지우지만, 그 컴포넌트들의
 * GraphNode/Relation은 cascade 대상이 아니므로 페이지 삭제 전에 미리 정리해야 한다. */
export async function deletePagesGraphArtifacts(pageIds: string[]): Promise<void> {
  if (pageIds.length === 0) return;
  const components = await prisma.componentNode.findMany({ where: { pageId: { in: pageIds } }, select: { id: true } });
  for (const pageId of pageIds) await deleteGraphArtifactsFor('PAGE', pageId);
  for (const c of components) await deleteGraphArtifactsFor('COMPONENT', c.id);
}
