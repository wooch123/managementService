import { describe, it, expect } from 'vitest';
import {
  gridsOverlap,
  collidesWithAny,
  resolvePlacement,
  clampResize,
  applyResize,
} from '@/components/builder/grid-utils';
import type { CanvasNode } from '@/components/builder/canvas-store';

function node(id: string, col: number, row: number, span: number, rowSpan: number, parentNodeId: string | null = null): CanvasNode {
  return {
    id,
    pageId: 'p1',
    type: 'card',
    parentNodeId,
    order: 0,
    grid: { col, span, row, rowSpan },
    props: {},
    binding: null,
    events: {},
    label: null,
  } as CanvasNode;
}

describe('gridsOverlap', () => {
  it('겹침: 같은 칸', () => expect(gridsOverlap({ col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 1, span: 6, row: 1, rowSpan: 10 })).toBe(true));
  it('겹침: 일부 교차', () => expect(gridsOverlap({ col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 4, span: 6, row: 5, rowSpan: 10 })).toBe(true));
  it('안 겹침: 좌우로 나란히', () => expect(gridsOverlap({ col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 7, span: 6, row: 1, rowSpan: 10 })).toBe(false));
  it('안 겹침: 위아래로 맞닿음', () => expect(gridsOverlap({ col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 1, span: 6, row: 11, rowSpan: 10 })).toBe(false));
});

describe('resolvePlacement — 영역 침범 금지', () => {
  const nodes = [node('a', 1, 1, 6, 10), node('b', 7, 1, 6, 10)];

  it('빈 자리는 요청 그대로 둔다', () =>
    expect(resolvePlacement(nodes, null, { col: 1, span: 6, row: 11, rowSpan: 10 }, 12)).toMatchObject({ col: 1, row: 11 }));

  it('겹치면 아래 첫 빈 행으로 밀어낸다', () =>
    expect(resolvePlacement(nodes, null, { col: 1, span: 6, row: 3, rowSpan: 10 }, 12)).toMatchObject({ col: 1, row: 11 }));

  it('자기 자신과는 충돌하지 않는다(제자리 이동)', () =>
    expect(resolvePlacement(nodes, 'a', { col: 1, span: 6, row: 1, rowSpan: 10 }, 12)).toMatchObject({ col: 1, row: 1 }));

  it('여러 블로커를 지나 그 아래까지 내려간다', () => {
    const stacked = [node('a', 1, 1, 12, 10), node('b', 1, 11, 12, 10), node('c', 1, 21, 12, 10)];
    expect(resolvePlacement(stacked, null, { col: 1, span: 12, row: 2, rowSpan: 5 }, 12)).toMatchObject({ row: 31 });
  });

  it('칼럼 범위를 벗어나면 안쪽으로 당긴다', () =>
    expect(resolvePlacement([], null, { col: 11, span: 6, row: 1, rowSpan: 4 }, 12)).toMatchObject({ col: 7, span: 6 }));

  it('컨테이너 자식(부모 있음)은 충돌 대상이 아니다', () => {
    const withChild = [node('a', 1, 1, 6, 10), node('child', 1, 1, 6, 10, 'a')];
    expect(collidesWithAny(withChild, 'a', { col: 1, span: 6, row: 1, rowSpan: 10 })).toBe(false);
  });
});

describe('clampResize / applyResize — 이웃에 닿으면 멈춤', () => {
  const nodes = [node('a', 1, 1, 6, 10), node('b', 7, 1, 6, 10), node('c', 1, 11, 6, 10)];

  it('오른쪽 이웃 앞에서 span이 멈춘다', () =>
    expect(clampResize(nodes, 'a', { col: 1, span: 12, row: 1, rowSpan: 10 }, 12).span).toBe(6));

  it('아래 이웃 앞에서 rowSpan이 멈춘다', () =>
    expect(clampResize(nodes, 'a', { col: 1, span: 6, row: 1, rowSpan: 40 }, 12).rowSpan).toBe(10));

  it('이웃이 없으면 요청한 크기 그대로', () =>
    expect(clampResize([node('a', 1, 1, 6, 10)], 'a', { col: 1, span: 12, row: 1, rowSpan: 30 }, 12)).toMatchObject({ span: 12, rowSpan: 30 }));

  it('줄이는 방향은 이웃과 상관없이 항상 허용된다', () =>
    expect(applyResize(nodes, 'a', { col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 1, span: 3, row: 1, rowSpan: 4 }, 12)).toMatchObject({ span: 3, rowSpan: 4 }));

  it('키우는 방향은 현재 크기 아래로 튀지 않는다', () =>
    expect(applyResize(nodes, 'a', { col: 1, span: 6, row: 1, rowSpan: 10 }, { col: 1, span: 12, row: 1, rowSpan: 30 }, 12)).toMatchObject({ span: 6, rowSpan: 10 }));
});
