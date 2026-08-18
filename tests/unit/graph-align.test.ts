import { describe, it, expect } from 'vitest';
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  distributeHorizontal,
  distributeVertical,
  snapAllToGrid,
} from '@/components/graph/align-utils';
import type { RFNode } from '@/components/graph/types';

function makeNode(id: string, x: number, y: number, width = 200, height = 100): RFNode {
  return {
    id,
    type: 'page',
    position: { x, y },
    width,
    height,
    data: { refType: 'PAGE', refId: id, title: id, slug: id, icon: null, childCount: 0 },
  };
}

describe('graph align-utils', () => {
  it('alignLeft — 선택된 노드들의 x를 최소값에 맞춘다', () => {
    const nodes = [makeNode('a', 100, 0), makeNode('b', 300, 0), makeNode('c', 500, 0)];
    const result = alignLeft(nodes, new Set(['a', 'b']));
    expect(result.find((n) => n.id === 'a')!.position.x).toBe(100);
    expect(result.find((n) => n.id === 'b')!.position.x).toBe(100);
    expect(result.find((n) => n.id === 'c')!.position.x).toBe(500); // 선택 안 된 노드는 그대로
  });

  it('alignRight — 오른쪽 끝(x+width)을 최대값에 맞춘다', () => {
    const nodes = [makeNode('a', 0, 0, 100), makeNode('b', 200, 0, 300)];
    const result = alignRight(nodes, new Set(['a', 'b']));
    // b의 오른쪽 끝 = 200+300=500. a는 500-100=400이어야 오른쪽 끝이 500으로 맞음
    expect(result.find((n) => n.id === 'a')!.position.x).toBe(400);
    expect(result.find((n) => n.id === 'b')!.position.x).toBe(200);
  });

  it('alignTop / alignBottom', () => {
    const nodes = [makeNode('a', 0, 40, 100, 80), makeNode('b', 0, 200, 100, 40)];
    const top = alignTop(nodes, new Set(['a', 'b']));
    expect(top.find((n) => n.id === 'a')!.position.y).toBe(40);
    expect(top.find((n) => n.id === 'b')!.position.y).toBe(40);

    const bottom = alignBottom(nodes, new Set(['a', 'b']));
    // a 아래끝=120, b 아래끝=240 → 최대 240. a는 240-80=160, b는 240-40=200
    expect(bottom.find((n) => n.id === 'a')!.position.y).toBe(160);
    expect(bottom.find((n) => n.id === 'b')!.position.y).toBe(200);
  });

  it('distributeHorizontal — 3개 이상일 때 첫/끝 고정, 중간을 균등 배분한다', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 999, 0), makeNode('c', 300, 0)];
    const result = distributeHorizontal(nodes, new Set(['a', 'b', 'c']));
    // 정렬 순서: a(0), c(300), b(999) → 균등 간격 = (999-0)/2 = 499.5 → 20px 스냅
    expect(result.find((n) => n.id === 'a')!.position.x).toBe(0);
    expect(result.find((n) => n.id === 'b')!.position.x).toBe(1000); // 999 -> snap 20 -> 1000
    expect(result.find((n) => n.id === 'c')!.position.x).toBe(500); // 499.5 -> snap 20 -> 500
  });

  it('distributeHorizontal — 2개 이하면 변경하지 않는다', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 100, 0)];
    const result = distributeHorizontal(nodes, new Set(['a', 'b']));
    expect(result).toEqual(nodes);
  });

  it('distributeVertical', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 100), makeNode('c', 0, 200)];
    const result = distributeVertical(nodes, new Set(['a', 'b', 'c']));
    expect(result.find((n) => n.id === 'a')!.position.y).toBe(0);
    expect(result.find((n) => n.id === 'b')!.position.y).toBe(100);
    expect(result.find((n) => n.id === 'c')!.position.y).toBe(200);
  });

  it('snapAllToGrid — 모든 노드를 20px 그리드에 맞춘다(선택 여부 무관)', () => {
    const nodes = [makeNode('a', 7, 13), makeNode('b', 111, 999)];
    const result = snapAllToGrid(nodes);
    expect(result.find((n) => n.id === 'a')!.position).toEqual({ x: 0, y: 20 });
    expect(result.find((n) => n.id === 'b')!.position).toEqual({ x: 120, y: 1000 });
  });
});
