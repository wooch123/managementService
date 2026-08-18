import { describe, it, expect } from 'vitest';
import { applyDagreLayout } from '@/components/graph/dagre-layout';
import type { RFNode, RFEdge } from '@/components/graph/types';

function rfNode(id: string): RFNode {
  return {
    id,
    type: 'page',
    position: { x: 0, y: 0 },
    width: 220,
    height: 120,
    data: { refType: 'PAGE', refId: id, title: id, slug: id, icon: null, childCount: 0 },
  } as RFNode;
}

function rfEdge(source: string, target: string): RFEdge {
  return { id: `${source}-${target}`, source, target } as RFEdge;
}

/** 한 축 방향 랭크(단) 순서 — 계층 규칙이 유지됐는지 비교용 */
function rankOrder(nodes: RFNode[]): string[] {
  return [...nodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x).map((n) => n.id);
}

function boundingArea(nodes: RFNode[]): number {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  return (Math.max(...xs) - Math.min(...xs) + 220) * (Math.max(...ys) - Math.min(...ys) + 120);
}

describe('applyDagreLayout — 배치 밀도 옵션', () => {
  const nodes = ['root', 'a', 'b', 'c', 'a1', 'a2', 'b1'].map(rfNode);
  const edges = [rfEdge('root', 'a'), rfEdge('root', 'b'), rfEdge('root', 'c'), rfEdge('a', 'a1'), rfEdge('a', 'a2'), rfEdge('b', 'b1')];

  it('기본값은 기존(comfortable) 간격이다', () => {
    expect(applyDagreLayout(nodes, edges, 'TB')).toEqual(applyDagreLayout(nodes, edges, 'TB', 'comfortable'));
  });

  it('밀집 배치가 차지하는 면적이 더 작다', () => {
    const comfortable = applyDagreLayout(nodes, edges, 'TB', 'comfortable');
    const compact = applyDagreLayout(nodes, edges, 'TB', 'compact');
    expect(boundingArea(compact)).toBeLessThan(boundingArea(comfortable));
  });

  it('밀집 배치도 계층 순서(단 배정·단 내 순서)는 그대로다', () => {
    const comfortable = applyDagreLayout(nodes, edges, 'TB', 'comfortable');
    const compact = applyDagreLayout(nodes, edges, 'TB', 'compact');
    expect(rankOrder(compact)).toEqual(rankOrder(comfortable));
  });

  it('좌표는 20px 그리드에 스냅된다', () => {
    for (const n of applyDagreLayout(nodes, edges, 'LR', 'compact')) {
      expect(n.position.x % 20).toBe(0);
      expect(n.position.y % 20).toBe(0);
    }
  });

  it('노드끼리 겹치지 않는다', () => {
    const laid = applyDagreLayout(nodes, edges, 'TB', 'compact');
    for (let i = 0; i < laid.length; i += 1) {
      for (let j = i + 1; j < laid.length; j += 1) {
        const a = laid[i];
        const b = laid[j];
        const overlap =
          a.position.x < b.position.x + 220 &&
          b.position.x < a.position.x + 220 &&
          a.position.y < b.position.y + 120 &&
          b.position.y < a.position.y + 120;
        expect(overlap).toBe(false);
      }
    }
  });
});
