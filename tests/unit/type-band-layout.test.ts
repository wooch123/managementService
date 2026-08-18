import { describe, it, expect } from 'vitest';
import { applyTypeBandLayout } from '@/components/graph/type-band-layout';
import type { RFNode } from '@/components/graph/types';
import type { RefType } from '@/types/graph';

const W = 220;
const H = 120;

function node(id: string, refType: RefType, pageId?: string): RFNode {
  return {
    id,
    type: refType.toLowerCase(),
    position: { x: 0, y: 0 },
    width: W,
    height: H,
    data: { refType, refId: id, title: id, slug: id, icon: null, childCount: 0, ...(pageId ? { pageId } : {}) },
  } as RFNode;
}

function makeGraph(counts: Partial<Record<RefType, number>>): RFNode[] {
  const out: RFNode[] = [];
  for (const [type, n] of Object.entries(counts)) {
    for (let i = 0; i < (n ?? 0); i += 1) out.push(node(`${type}-${String(i).padStart(3, '0')}`, type as RefType, 'p1'));
  }
  return out;
}

const bounds = (nodes: RFNode[]) => {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  return { width: Math.max(...xs) - Math.min(...xs) + W, height: Math.max(...ys) - Math.min(...ys) + H };
};

const byType = (nodes: RFNode[], t: RefType) => nodes.filter((n) => n.data.refType === t);

describe('applyTypeBandLayout — 종류별 밴드 배치', () => {
  const graph = makeGraph({ PAGE: 3, COMPONENT: 24, ENTITY: 6, ACTION: 8 });

  it('가로 배치: Page → 컴포넌트 → 엔티티 → 액션 순으로 왼쪽부터 놓인다', () => {
    const laid = applyTypeBandLayout(graph, 'LR', 'compact');
    const maxX = (t: RefType) => Math.max(...byType(laid, t).map((n) => n.position.x));
    const minX = (t: RefType) => Math.min(...byType(laid, t).map((n) => n.position.x));
    expect(maxX('PAGE')).toBeLessThan(minX('COMPONENT'));
    expect(maxX('COMPONENT')).toBeLessThan(minX('ENTITY'));
    expect(maxX('ENTITY')).toBeLessThan(minX('ACTION'));
  });

  it('세로 배치: Page → 컴포넌트 → 엔티티 → 액션 순으로 위에서부터 놓인다', () => {
    const laid = applyTypeBandLayout(graph, 'TB', 'compact');
    const maxY = (t: RefType) => Math.max(...byType(laid, t).map((n) => n.position.y));
    const minY = (t: RefType) => Math.min(...byType(laid, t).map((n) => n.position.y));
    expect(maxY('PAGE')).toBeLessThan(minY('COMPONENT'));
    expect(maxY('COMPONENT')).toBeLessThan(minY('ENTITY'));
    expect(maxY('ENTITY')).toBeLessThan(minY('ACTION'));
  });

  it('가로 배치는 16:9, 세로 배치는 9:16에 가깝다', () => {
    const lr = bounds(applyTypeBandLayout(graph, 'LR', 'compact'));
    const tb = bounds(applyTypeBandLayout(graph, 'TB', 'compact'));
    // 칸 단위로만 조절되므로 정확히 맞을 수는 없다 — 목표비 대비 ±60% 안이면 "가장 가까운 선택"이다.
    expect(lr.width / lr.height).toBeGreaterThan((16 / 9) * 0.4);
    expect(lr.width / lr.height).toBeLessThan((16 / 9) * 1.6);
    expect(tb.width / tb.height).toBeGreaterThan((9 / 16) * 0.4);
    expect(tb.width / tb.height).toBeLessThan((9 / 16) * 1.6);
    expect(lr.width / lr.height).toBeGreaterThan(tb.width / tb.height);
  });

  it('오와 열이 맞는다 — 좌표가 칸 격자 위에만 놓인다', () => {
    const laid = applyTypeBandLayout(graph, 'LR', 'compact');
    const xs = [...new Set(laid.map((n) => n.position.x))].sort((a, b) => a - b);
    const ys = [...new Set(laid.map((n) => n.position.y))].sort((a, b) => a - b);
    const stepsAreUniform = (vs: number[]) => {
      if (vs.length < 3) return true;
      const step = vs[1] - vs[0];
      return vs.every((v, i) => i === 0 || Math.abs(v - vs[i - 1] - step) <= 20);
    };
    expect(stepsAreUniform(xs)).toBe(true);
    expect(stepsAreUniform(ys)).toBe(true);
  });

  it('노드가 겹치지 않는다', () => {
    for (const dir of ['LR', 'TB'] as const) {
      const laid = applyTypeBandLayout(graph, dir, 'compact');
      const seen = new Set<string>();
      for (const n of laid) {
        const key = `${n.position.x},${n.position.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('밀집 배치가 기본 간격보다 작은 면적을 쓴다', () => {
    const comfy = bounds(applyTypeBandLayout(graph, 'LR', 'comfortable'));
    const compact = bounds(applyTypeBandLayout(graph, 'LR', 'compact'));
    expect(compact.width * compact.height).toBeLessThan(comfy.width * comfy.height);
  });

  it('좌표는 20px 격자에 스냅된다', () => {
    for (const n of applyTypeBandLayout(graph, 'TB', 'comfortable')) {
      expect(n.position.x % 20).toBe(0);
      expect(n.position.y % 20).toBe(0);
    }
  });

  it('빈 입력과 한 종류만 있는 그래프도 처리한다', () => {
    expect(applyTypeBandLayout([], 'LR', 'compact')).toEqual([]);
    const onlyEntities = makeGraph({ ENTITY: 5 });
    expect(applyTypeBandLayout(onlyEntities, 'TB', 'compact')).toHaveLength(5);
  });
});
