import type { CanvasNode, Viewport } from '@/components/builder/canvas-store';

export type { Viewport };

/** §4.4 — ≥1280px 12칼럼 / 768–1279px 6칼럼 / <768px 1칼럼 */
export const VIEWPORT_COLS: Record<Viewport, number> = {
  desktop: 12,
  tablet: 6,
  mobile: 1,
};

/** §4.4 — "비율 유지 후 반올림, 최소 1". 모바일은 세로 스택이므로 col/span만 1로 고정한다
 * (행 스택 순서는 호출부에서 order 기준으로 별도 계산한다). */
export function scaleGrid(grid: CanvasNode['grid'], viewport: Viewport, cols: number): CanvasNode['grid'] {
  if (viewport === 'desktop') return grid;
  if (viewport === 'mobile') return { ...grid, col: 1, span: 1 };

  const ratio = cols / 12;
  const span = Math.max(1, Math.round(grid.span * ratio));
  const col = Math.min(cols - span + 1, Math.max(1, Math.round((grid.col - 1) * ratio) + 1));
  return { ...grid, col, span };
}

export function nextRootOrderLocal(nodes: CanvasNode[]): number {
  const roots = nodes.filter((n) => !n.parentNodeId);
  return roots.length === 0 ? 0 : Math.max(...roots.map((n) => n.order)) + 1;
}

// ── 루트 그리드 충돌 처리 ─────────────────────────────────────────────────────
// 캔버스의 루트 레벨은 12칼럼 그리드다. 두 컴포넌트가 같은 셀을 점유하면 운영 화면에서 서로
// 겹쳐 렌더되므로(검증 규칙 W-STRUCT-012도 이 상태를 경고한다), 배치/이동/리사이즈 단계에서
// 아예 겹칠 수 없게 막는다. 자식 노드(컨테이너 안)는 그리드가 아니라 세로 스택이라 대상이 아니다.

export type Grid = CanvasNode['grid'];

/** 두 그리드 사각형이 한 셀이라도 겹치는가 (경계 접촉은 겹침이 아니다). */
export function gridsOverlap(a: Grid, b: Grid): boolean {
  const colOverlap = a.col < b.col + b.span && b.col < a.col + a.span;
  const rowOverlap = a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;
  return colOverlap && rowOverlap;
}

/** 루트 노드 중 자기 자신을 뺀 나머지 — 충돌 검사 대상. */
function otherRoots(nodes: CanvasNode[], movingId: string | null): CanvasNode[] {
  return nodes.filter((n) => !n.parentNodeId && n.id !== movingId);
}

export function collidesWithAny(nodes: CanvasNode[], movingId: string | null, grid: Grid): boolean {
  return otherRoots(nodes, movingId).some((n) => gridsOverlap(n.grid, grid));
}

/**
 * 원하는 위치가 비어 있으면 그대로, 겹치면 같은 칼럼에서 아래로 내려가며 처음 비는 행에 놓는다.
 * (아래로 미는 이유: 그리드가 세로로는 무한이라 항상 빈 자리가 보장되고, 사용자가 놓으려던
 * 가로 위치는 유지되어 결과를 예측하기 쉽다.)
 */
export function resolvePlacement(nodes: CanvasNode[], movingId: string | null, desired: Grid, cols: number): Grid {
  const span = Math.max(1, Math.min(desired.span, cols));
  const col = Math.max(1, Math.min(desired.col, cols - span + 1));
  const base: Grid = { ...desired, col, span, row: Math.max(1, desired.row) };

  if (!collidesWithAny(nodes, movingId, base)) return base;

  const blockers = otherRoots(nodes, movingId)
    .filter((n) => n.grid.col < col + span && col < n.grid.col + n.grid.span)
    .sort((a, b) => a.grid.row - b.grid.row);

  // 겹치는 상대의 바로 아래 행들만 후보로 보면 충분하다 — 빈 자리는 항상 어떤 블로커의
  // 끝나는 지점에서 시작한다.
  const candidates = [base.row, ...blockers.map((n) => n.grid.row + n.grid.rowSpan)].sort((a, b) => a - b);
  for (const row of candidates) {
    const candidate = { ...base, row };
    if (!collidesWithAny(nodes, movingId, candidate)) return candidate;
  }
  const last = blockers[blockers.length - 1];
  return { ...base, row: last ? last.grid.row + last.grid.rowSpan : base.row };
}

/**
 * 리사이즈 결과 확정 — 줄이는 방향은 언제나 허용하고, 키우는 방향만 이웃에 닿는 지점에서 멈춘다.
 * (clampResize를 그대로 쓰면, 이미 이웃과 붙어 있는 컴포넌트를 줄이려 할 때도 clamp 값이 현재
 * 크기보다 작게 나와 크기가 튀는 경우가 생긴다.)
 */
export function applyResize(nodes: CanvasNode[], movingId: string, current: Grid, desired: Grid, cols: number): Grid {
  const clamped = clampResize(nodes, movingId, desired, cols);
  return {
    ...desired,
    span: desired.span <= current.span ? desired.span : Math.max(current.span, clamped.span),
    rowSpan: desired.rowSpan <= current.rowSpan ? desired.rowSpan : Math.max(current.rowSpan, clamped.rowSpan),
  };
}

/**
 * 리사이즈용 — 위치는 그대로 두고 span/rowSpan만 이웃과 겹치지 않는 최대치로 줄인다.
 * (이동과 달리 리사이즈는 "끌던 방향으로 계속 커지다가 이웃에 닿으면 멈추는" 동작이 자연스럽다.)
 */
export function clampResize(nodes: CanvasNode[], movingId: string, desired: Grid, cols: number): Grid {
  const others = otherRoots(nodes, movingId);
  let span = Math.max(1, Math.min(desired.span, cols - desired.col + 1));
  let rowSpan = Math.max(1, desired.rowSpan);

  for (const n of others) {
    const rowOverlap = desired.row < n.grid.row + n.grid.rowSpan && n.grid.row < desired.row + rowSpan;
    if (rowOverlap && n.grid.col >= desired.col) span = Math.min(span, n.grid.col - desired.col);
  }
  span = Math.max(1, span);

  for (const n of others) {
    const colOverlap = desired.col < n.grid.col + n.grid.span && n.grid.col < desired.col + span;
    if (colOverlap && n.grid.row >= desired.row) rowSpan = Math.min(rowSpan, n.grid.row - desired.row);
  }
  rowSpan = Math.max(1, rowSpan);

  return { ...desired, span, rowSpan };
}
