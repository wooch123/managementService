import type { RFNode } from '@/components/graph/types';
import type { RefType } from '@/types/graph';

/** 자동 배치 밀도 — 규칙(밴드 순서·격자 정렬)은 그대로 두고 칸 간격만 달라진다. */
export type LayoutDensity = 'comfortable' | 'compact';

const GRID = 20;

/** 밴드 순서 — 데이터가 흐르는 순서(화면 → 화면 요소 → 데이터 → 동작)를 그대로 따른다. */
const BAND_ORDER: RefType[] = ['PAGE', 'COMPONENT', 'ENTITY', 'ACTION'];

const GAP: Record<LayoutDensity, { x: number; y: number }> = {
  comfortable: { x: 60, y: 40 },
  compact: { x: GRID, y: GRID },
};

/** 방향별 목표 화면비 — 가로 배치는 16:9, 세로 배치는 9:16에 가장 가까운 배열을 고른다. */
const TARGET_RATIO: Record<'LR' | 'TB', number> = { LR: 16 / 9, TB: 9 / 16 };

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** 실제 렌더된 크기를 우선한다 — 엔티티 카드처럼 필드 수에 따라 세로로 길어지는 노드가 있어서,
 * 선언 값(기본 220×120)만 믿으면 아래 밴드와 겹친다(실제로 겹쳤다). */
const nodeWidth = (n: RFNode) => n.measured?.width ?? n.width ?? 220;
const nodeHeight = (n: RFNode) => n.measured?.height ?? n.height ?? 120;

/** 같은 밴드 안에서 순서를 안정적으로 정한다(같은 페이지의 컴포넌트끼리 붙어 있게). */
function sortBand(nodes: RFNode[]): RFNode[] {
  return [...nodes].sort((a, b) => {
    const pa = (a.data as { pageId?: string }).pageId ?? '';
    const pb = (b.data as { pageId?: string }).pageId ?? '';
    if (pa !== pb) return pa.localeCompare(pb);
    return a.id.localeCompare(b.id);
  });
}

type Cell = { node: RFNode; col: number; row: number };

/**
 * 노드를 격자 칸에 배정한다. LR이면 밴드가 왼→오 열 묶음이고 `lines`는 행 수, TB면 밴드가
 * 위→아래 행 묶음이고 `lines`는 열 수다.
 */
function assign(bands: RFNode[][], lines: number, direction: 'LR' | 'TB'): Cell[] {
  const cells: Cell[] = [];
  let acrossOffset = 0; // LR: 지금까지 쓴 열 수, TB: 지금까지 쓴 행 수
  for (const band of bands) {
    if (band.length === 0) continue;
    band.forEach((node, i) => {
      const line = i % lines;
      const across = acrossOffset + Math.floor(i / lines);
      cells.push(direction === 'LR' ? { node, col: across, row: line } : { node, col: line, row: across });
    });
    acrossOffset += Math.ceil(band.length / lines);
  }
  return cells;
}

/**
 * 열 너비·행 높이를 그 줄에서 가장 큰 노드에 맞춘다(스프레드시트처럼 줄마다 크기가 다르되
 * 오와 열은 정확히 맞는다). 모든 칸을 최대 크기로 통일하면, 짧은 노드만 있는 줄에도 가장 큰
 * 노드만큼 자리를 잡아 세로가 과하게 부풀고 실제 비율이 목표에서 멀어진다.
 */
function measure(cells: Cell[], gapX: number, gapY: number) {
  const colWidths: number[] = [];
  const rowHeights: number[] = [];
  for (const c of cells) {
    colWidths[c.col] = Math.max(colWidths[c.col] ?? 0, nodeWidth(c.node));
    rowHeights[c.row] = Math.max(rowHeights[c.row] ?? 0, nodeHeight(c.node));
  }

  const colX: number[] = [];
  let x = 0;
  for (let i = 0; i < colWidths.length; i += 1) {
    colX[i] = x;
    x += (colWidths[i] ?? 0) + gapX;
  }
  const rowY: number[] = [];
  let y = 0;
  for (let i = 0; i < rowHeights.length; i += 1) {
    rowY[i] = y;
    y += (rowHeights[i] ?? 0) + gapY;
  }

  return { colX, rowY, width: Math.max(0, x - gapX), height: Math.max(0, y - gapY) };
}

/**
 * §8.4 자동 배치 — 노드 종류별 밴드(Page · 컴포넌트 · 엔티티 · 액션)를 순서대로 놓고, 밴드 안은
 * 격자로 오와 열을 맞춘다. 가로 배치는 밴드가 왼→오 열이 되고 전체가 16:9에, 세로 배치는 밴드가
 * 위→아래 행이 되고 전체가 9:16에 가장 가까워지는 "밴드당 칸 수"를 자동으로 고른다(배열이
 * 커지는 건 허용하고 비율만 맞춘다).
 *
 * 연결선(edges)은 배치에 관여하지 않는다 — 종류별 밴드 규칙이 이미 위치를 결정하므로, 계층
 * 알고리즘처럼 엣지를 따라 순서를 바꾸면 오히려 오와 열이 흐트러진다.
 */
export function applyTypeBandLayout(
  nodes: RFNode[],
  direction: 'TB' | 'LR' = 'TB',
  density: LayoutDensity = 'comfortable'
): RFNode[] {
  if (nodes.length === 0) return nodes;

  const gap = GAP[density];
  const dir: 'LR' | 'TB' = direction === 'LR' ? 'LR' : 'TB';

  const bands = BAND_ORDER.map((type) => sortBand(nodes.filter((n) => n.data.refType === type)));
  // 카탈로그에 없는 refType이 생겨도 누락되지 않도록 나머지는 마지막 밴드로 몰아둔다.
  const known = new Set(BAND_ORDER);
  const rest = nodes.filter((n) => !known.has(n.data.refType));
  if (rest.length > 0) bands.push(sortBand(rest));

  // 후보(밴드당 칸 수)마다 실제 배치를 만들어 크기를 재고, 목표 비율에 가장 가까운 것을 고른다.
  // 비율 오차는 로그 척도로 재야 "너무 납작"과 "너무 길쭉"을 같은 무게로 비교할 수 있다.
  let best: { cells: Cell[]; colX: number[]; rowY: number[] } | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  for (let lines = 1; lines <= nodes.length; lines += 1) {
    const cells = assign(bands, lines, dir);
    const { colX, rowY, width, height } = measure(cells, gap.x, gap.y);
    if (width <= 0 || height <= 0) continue;
    const error = Math.abs(Math.log(width / height / TARGET_RATIO[dir]));
    if (error < bestError) {
      bestError = error;
      best = { cells, colX, rowY };
    }
  }
  if (!best) return nodes;

  const positioned = new Map(best.cells.map((c) => [c.node.id, { x: snap(best!.colX[c.col]), y: snap(best!.rowY[c.row]) }]));
  return nodes.map((n) => {
    const pos = positioned.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}
