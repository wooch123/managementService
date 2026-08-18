import dagre from 'dagre';
import type { RFNode, RFEdge } from '@/components/graph/types';

/** 자동 배치 밀도 — 계층 규칙(랭크 배정/랭크 내 순서)은 그대로 두고 간격만 달라진다. */
export type LayoutDensity = 'comfortable' | 'compact';

const GRID = 20;

const DENSITY_PRESET: Record<LayoutDensity, { nodesep: number; ranksep: number; edgesep: number }> = {
  comfortable: { nodesep: 60, ranksep: 100, edgesep: 20 },
  compact: { nodesep: GRID, ranksep: 2 * GRID, edgesep: 10 },
};

const sizeOf = (n: RFNode) => ({ w: n.width ?? 220, h: n.height ?? 120 });

/**
 * dagre 계층 배치. 반환 좌표는 20px 그리드에 스냅한다.
 *
 * density='compact'는 dagre가 정한 계층 구조(어느 노드가 몇 번째 단인지, 단 안에서의 좌우 순서)를
 * 그대로 유지한 채 간격만 좁히고, 추가로 단별 재포장(packRanks)을 돌려 dagre가 엣지 라우팅
 * 여유분으로 남겨둔 빈 공간까지 걷어낸다 — "규칙은 유지, 밀집도만 최대"가 목표다.
 */
export function applyDagreLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  direction: 'TB' | 'LR' = 'TB',
  density: LayoutDensity = 'comfortable'
): RFNode[] {
  const preset = DENSITY_PRESET[density];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: preset.nodesep, ranksep: preset.ranksep, edgesep: preset.edgesep });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const { w, h } = sizeOf(n);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) {
    if (nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  // dagre 좌표(중심 기준) → 좌상단 기준
  const placed = nodes.map((n) => {
    const pos = g.node(n.id);
    const { w, h } = sizeOf(n);
    if (!pos) return { node: n, x: n.position.x, y: n.position.y, w, h };
    return { node: n, x: pos.x - w / 2, y: pos.y - h / 2, w, h };
  });

  const finalPositions = density === 'compact' ? packRanks(placed, direction, preset) : placed;

  return finalPositions.map(({ node, x, y }) => ({
    ...node,
    position: { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID },
  }));
}

type Placed = { node: RFNode; x: number; y: number; w: number; h: number };

/**
 * 같은 단(rank)에 속한 노드들을 원래 순서 그대로 좌우(또는 상하)로 바짝 붙이고, 단 자체도
 * 위에서부터 차례로 붙인다. dagre의 랭크 배정과 랭크 내 순서는 손대지 않으므로 계층 규칙은
 * 그대로 유지되고, 간격만 최소화된다.
 */
function packRanks(placed: Placed[], direction: 'TB' | 'LR', preset: { nodesep: number; ranksep: number }): Placed[] {
  const isTB = direction === 'TB';
  // TB면 y가 단, x가 단 내 위치. LR이면 반대.
  const rankKey = (p: Placed) => Math.round((isTB ? p.y : p.x) / 2) * 2; // 부동소수 오차 흡수
  const ranks = new Map<number, Placed[]>();
  for (const p of placed) {
    const key = rankKey(p);
    if (!ranks.has(key)) ranks.set(key, []);
    ranks.get(key)!.push(p);
  }

  const out: Placed[] = [];
  let rankCursor = 0;
  for (const key of [...ranks.keys()].sort((a, b) => a - b)) {
    const members = ranks.get(key)!.sort((a, b) => (isTB ? a.x - b.x : a.y - b.y));
    const rankThickness = Math.max(...members.map((m) => (isTB ? m.h : m.w)));

    let crossCursor = 0;
    for (const m of members) {
      if (isTB) out.push({ ...m, x: crossCursor, y: rankCursor + (rankThickness - m.h) / 2 });
      else out.push({ ...m, x: rankCursor + (rankThickness - m.w) / 2, y: crossCursor });
      crossCursor += (isTB ? m.w : m.h) + preset.nodesep;
    }
    rankCursor += rankThickness + preset.ranksep;
  }
  return out;
}
