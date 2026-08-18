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

/** 방향별 목표 화면비 — 가로 배치는 16:9, 세로 배치는 9:16 안에 들어가도록 칸 수를 고른다. */
const TARGET_RATIO: Record<'LR' | 'TB', number> = { LR: 16 / 9, TB: 9 / 16 };

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** 실제 렌더된 크기를 우선한다 — 엔티티 카드처럼 필드 수에 따라 세로로 길어지는 노드가 있어서,
 * 선언 값(기본 220×120)만 믿고 칸 크기를 잡으면 아래 밴드와 겹친다(실제로 겹쳤다). */
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

/**
 * 목표 화면비에 가장 가까운 "밴드당 칸 수"를 고른다.
 *
 * LR이면 lines = 행 수(각 밴드는 그 행 수만큼 채우고 남으면 옆 열로 넘어간다),
 * TB면 lines = 열 수. 전체 배열은 커져도 되지만 비율은 목표에 최대한 붙인다.
 */
function pickLines(counts: number[], direction: 'LR' | 'TB', cellW: number, cellH: number): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 1;

  let best = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let lines = 1; lines <= total; lines += 1) {
    // 밴드마다 lines 개씩 채우므로, 밴드가 차지하는 "가로줄(LR)·세로줄(TB)" 수는 ceil(n/lines)
    const bands = counts.filter((c) => c > 0).map((c) => Math.ceil(c / lines));
    const across = bands.reduce((a, b) => a + b, 0); // LR: 열 수, TB: 행 수
    const width = direction === 'LR' ? across * cellW : lines * cellW;
    const height = direction === 'LR' ? lines * cellH : across * cellH;
    if (width === 0 || height === 0) continue;
    // 비율 오차는 로그 척도로 재야 "너무 납작"과 "너무 길쭉"을 같은 무게로 비교할 수 있다.
    const error = Math.abs(Math.log(width / height / TARGET_RATIO[direction]));
    if (error < bestError) {
      bestError = error;
      best = lines;
    }
  }
  return best;
}

/**
 * §8.4 자동 배치 — 노드 종류별 밴드(Page · 컴포넌트 · 엔티티 · 액션)를 순서대로 놓고, 밴드 안은
 * 격자로 오와 열을 맞춘다. 가로 배치는 밴드가 왼→오 열이 되고 전체가 16:9에, 세로 배치는 밴드가
 * 위→아래 행이 되고 전체가 9:16에 가장 가까워지는 칸 수를 자동으로 고른다(크기는 커질 수 있다).
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
  // 칸 크기는 가장 큰 노드에 맞춘다 — 그래야 밴드가 달라도 행·열이 정확히 맞는다.
  const cellW = Math.max(...nodes.map(nodeWidth)) + gap.x;
  const cellH = Math.max(...nodes.map(nodeHeight)) + gap.y;

  const bands = BAND_ORDER.map((type) => sortBand(nodes.filter((n) => n.data.refType === type)));
  // 카탈로그에 없는 refType이 생겨도 누락되지 않도록 나머지는 마지막 밴드로 몰아둔다.
  const known = new Set(BAND_ORDER);
  const rest = nodes.filter((n) => !known.has(n.data.refType));
  if (rest.length > 0) bands.push(sortBand(rest));

  const lines = pickLines(bands.map((b) => b.length), direction === 'LR' ? 'LR' : 'TB', cellW, cellH);

  const positioned = new Map<string, { x: number; y: number }>();
  let acrossOffset = 0; // LR: 지금까지 쓴 열 수, TB: 지금까지 쓴 행 수

  for (const band of bands) {
    if (band.length === 0) continue;
    band.forEach((node, i) => {
      const line = i % lines; // LR: 행 index, TB: 열 index
      const across = acrossOffset + Math.floor(i / lines); // LR: 열 index, TB: 행 index
      positioned.set(
        node.id,
        direction === 'LR'
          ? { x: snap(across * cellW), y: snap(line * cellH) }
          : { x: snap(line * cellW), y: snap(across * cellH) }
      );
    });
    acrossOffset += Math.ceil(band.length / lines);
  }

  return nodes.map((n) => {
    const pos = positioned.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}
