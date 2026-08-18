import { Position } from '@xyflow/react';

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Point = { x: number; y: number };

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function segmentsIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
  const d1 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3);
  const d2 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
  const d3 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1);
  const d4 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);
  return (d1 > 0 !== d2 > 0) && (d3 > 0 !== d4 > 0);
}

function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  if (Math.max(x1, x2) < r.left || Math.min(x1, x2) > r.right || Math.max(y1, y2) < r.top || Math.min(y1, y2) > r.bottom) return false;
  return (
    segmentsIntersect(x1, y1, x2, y2, r.left, r.top, r.right, r.top) ||
    segmentsIntersect(x1, y1, x2, y2, r.right, r.top, r.right, r.bottom) ||
    segmentsIntersect(x1, y1, x2, y2, r.right, r.bottom, r.left, r.bottom) ||
    segmentsIntersect(x1, y1, x2, y2, r.left, r.bottom, r.left, r.top)
  );
}

/**
 * "배치 시 불가능한 경우가 아니라면 라인이 최대한 Node를 피해서 연결"(§ 관계도 요구사항) — 직선
 * 경로가 다른 노드 박스를 가로지르면, 그 박스의 위/아래 중 더 가까운 쪽으로 살짝 부풀린 2차
 * 베지어 곡선으로 우회한다. 완전한 장애물 회피 경로탐색(A* 등)까지는 하지 않고 "가장 먼저 걸리는
 * 장애물 하나"만 피한다 — 여러 겹 장애물처럼 정말 피할 수 없는 배치는 원래 경로를 그대로 둔다
 * (그게 "불가능한 경우" 조건의 의도다).
 */
export function computeAvoidingPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: Rect[]
): { path: string; labelX: number; labelY: number } | null {
  const PADDING = 20;
  for (const rect of obstacles) {
    if (!segmentIntersectsRect(sourceX, sourceY, targetX, targetY, rect)) continue;

    const midY = (sourceY + targetY) / 2;
    const goAbove = Math.abs(rect.top - midY) <= Math.abs(rect.bottom - midY);
    const detourY = goAbove ? rect.top - PADDING : rect.bottom + PADDING;
    const midX = (sourceX + targetX) / 2;

    const path = `M${sourceX},${sourceY} Q${midX},${detourY} ${targetX},${targetY}`;
    // 2차 베지어의 t=0.5 지점(드 카스텔리오 공식) — 라벨을 곡선 중앙 근처에 놓기 위함
    const labelX = 0.25 * sourceX + 0.5 * midX + 0.25 * targetX;
    const labelY = 0.25 * sourceY + 0.5 * detourY + 0.25 * targetY;
    return { path, labelX, labelY };
  }
  return null;
}

function isHorizontal(pos: Position): boolean {
  return pos === Position.Left || pos === Position.Right;
}

/** 소스/타깃 핸들 방향만 보고 상하좌우 직선 두 세그먼트(또는 한 세그먼트)로 꺾이는 기본 경로를 만든다. */
function buildElbowWaypoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position
): Point[] {
  const sourceH = isHorizontal(sourcePosition);
  const targetH = isHorizontal(targetPosition);

  if (sourceH && targetH) {
    const midX = (sourceX + targetX) / 2;
    return [
      { x: sourceX, y: sourceY },
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
      { x: targetX, y: targetY },
    ];
  }
  if (!sourceH && !targetH) {
    const midY = (sourceY + targetY) / 2;
    return [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: midY },
      { x: targetX, y: midY },
      { x: targetX, y: targetY },
    ];
  }
  // 한쪽은 좌/우, 다른 한쪽은 상/하 핸들 — 꺾임 한 번(ㄱ자)으로 충분하다.
  if (sourceH) {
    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: sourceY },
      { x: targetX, y: targetY },
    ];
  }
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: targetY },
    { x: targetX, y: targetY },
  ];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointAt(from: Point, to: Point, distance: number): Point {
  const d = dist(from, to);
  if (d === 0) return from;
  const t = Math.min(distance, d) / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

const CORNER_RADIUS = 8;

/**
 * 상하좌우 직선 웨이포인트를 SVG path로 바꾸되, 꺾이는 지점마다 살짝 둥글린다(§ 관계도 요구사항
 * "꺾이는 부분에 약간의 곡률"). 각 코너 앞뒤로 CORNER_RADIUS만큼 물러난 지점까지는 L(직선)로
 * 가고, 그 사이는 코너 자체를 제어점으로 하는 2차 베지어(Q)로 둥글게 잇는다 — getSmoothStepPath의
 * borderRadius와 같은 방식. 세그먼트가 반지름보다 짧으면(장애물 회피로 짧은 구간이 생겼을 때)
 * 반지름을 그 세그먼트 길이의 절반으로 줄여 곡선이 옆 코너를 침범하지 않게 한다.
 */
function waypointsToPath(points: Point[]): string {
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const r = Math.min(CORNER_RADIUS, dist(prev, curr) / 2, dist(curr, next) / 2);
    const a = pointAt(curr, prev, r);
    const b = pointAt(curr, next, r);
    d += ` L${a.x},${a.y} Q${curr.x},${curr.y} ${b.x},${b.y}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

function midOfMiddleSegment(points: Point[]): Point {
  const i = Math.floor((points.length - 1) / 2);
  const a = points[i];
  const b = points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * "포함(CONTAINS) 연결선은 상하좌우 직선으로만 구성하고, 가능하면 Node를 관통하지 않게" 요구사항용
 * 직교(orthogonal) 라우팅. buildElbowWaypoints로 대각선/곡선 없는 기본 꺾은선을 만든 다음, 그 선분
 * 중 장애물 박스를 관통하는 게 있으면(segmentIntersectsRect) 그 세그먼트만 장애물의 더 가까운 쪽
 * 바깥으로 밀어 우회시킨다 — computeAvoidingPath와 같은 스코프로 "가장 먼저 걸리는 장애물 하나"만
 * 처리한다(완전한 미로 탐색기가 아니다). 우회 후에도 여전히 걸리는 등 정말 피할 수 없는 배치는
 * 원래 꺾은선을 그대로 둔다.
 */
export function computeOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: Rect[]
): { path: string; labelX: number; labelY: number } {
  const PADDING = 20;
  let points = buildElbowWaypoints(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const blocker = obstacles.find((r) => segmentIntersectsRect(a.x, a.y, b.x, b.y, r));
    if (!blocker) continue;

    const horizontalSegment = a.y === b.y;
    if (horizontalSegment) {
      const goAbove = Math.abs(blocker.top - a.y) <= Math.abs(blocker.bottom - a.y);
      const detourY = goAbove ? blocker.top - PADDING : blocker.bottom + PADDING;
      points = [...points.slice(0, i + 1), { x: a.x, y: detourY }, { x: b.x, y: detourY }, ...points.slice(i + 1)];
    } else {
      const goLeft = Math.abs(blocker.left - a.x) <= Math.abs(blocker.right - a.x);
      const detourX = goLeft ? blocker.left - PADDING : blocker.right + PADDING;
      points = [...points.slice(0, i + 1), { x: detourX, y: a.y }, { x: detourX, y: b.y }, ...points.slice(i + 1)];
    }
    break;
  }

  const label = midOfMiddleSegment(points);
  return { path: waypointsToPath(points), labelX: label.x, labelY: label.y };
}
