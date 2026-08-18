'use client';

import { useEffect, useRef } from 'react';
import { useCanvasStore, type CanvasNode } from '@/components/builder/canvas-store';
import type { ApiResult } from '@/types/auth';

type Snapshot = {
  parentNodeId: string | null;
  order: number;
  region: string;
  props: string;
  grid: string;
  events: string;
  label: string | null;
  binding: string;
};

function toSnapshot(n: CanvasNode): Snapshot {
  return {
    parentNodeId: n.parentNodeId,
    order: n.order,
    region: n.region,
    props: JSON.stringify(n.props),
    grid: JSON.stringify(n.grid),
    events: JSON.stringify(n.events),
    label: n.label,
    binding: JSON.stringify(n.binding),
  };
}

async function patchNode(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/nodes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult<unknown>;
}

/**
 * 캔버스 상태(props/grid/reparent/order)를 300ms 디바운스로 서버와 동기화한다.
 * undo/redo(zundo)를 포함해 store.nodes가 바뀌는 모든 경로를 이 한 곳에서 처리한다.
 *
 * 알려진 한계: DELETE는 액션 시점에 즉시 서버에 반영되므로, 그 이후 Undo로 로컬에
 * 노드가 되살아나도 서버에는 다시 생성되지 않는다(§P3 범위 밖 — 세션 내 시각적 되돌리기만 보장).
 */
export function useCanvasSync() {
  const nodes = useCanvasStore((s) => s.nodes);
  const lastSynced = useRef<Map<string, Snapshot>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void sync(), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  async function sync() {
    const prev = lastSynced.current;
    const currentIds = new Set(nodes.map((n) => n.id));

    const removedIds = [...prev.keys()].filter((id) => !currentIds.has(id));

    // 방어 코드: 알고 있던 노드 2개 이상이 "전부 한꺼번에" 사라지는 경우는 실제 사용자 삭제가
    // 아니라 로컬 상태가 서버 상태와 어긋난 상황(Fast Refresh로 zustand 스토어가 초기화되거나,
    // 같은 인스턴스가 마운트된 채 다른 페이지로 전환되는 등)일 가능성이 훨씬 높다 — 사용자가
    // 실제로 지우는 건 보통 한 번에 1개(또는 명시적으로 다중 선택한 소수)뿐, 페이지 전체가
    // 한 틱에 통째로 사라지는 정상 시나리오는 없다. 이 상황에서 그대로 반영하면 실제
    // 컴포넌트가 서버에서 삭제된다(세션 중 두 차례 실제 데이터 유실 사고로 확인됨).
    // 부분적으로만 사라진 경우(1개 이상이 남아있는 경우)는 정상적인 개별 삭제로 보고 그대로
    // 진행한다 — 이 가드는 "100% 소실"일 때만 걸린다.
    const isSuspiciousMassRemoval = prev.size >= 2 && removedIds.length === prev.size;
    if (isSuspiciousMassRemoval) {
      console.warn(
        `[useCanvasSync] ${removedIds.length}개 노드가 한 번에 모두 사라져 서버 삭제를 건너뜁니다(스토어 리셋/페이지 전환으로 추정). 로컬 기준선을 현재 상태로 재정렬합니다.`
      );
      prev.clear();
      for (const node of nodes) prev.set(node.id, toSnapshot(node));
      return;
    }

    for (const id of removedIds) {
      await fetch(`/api/admin/nodes/${id}`, { method: 'DELETE' }).catch(() => null);
      prev.delete(id);
    }

    const reorderItems: { id: string; parentNodeId: string | null; order: number }[] = [];

    for (const node of nodes) {
      const before = prev.get(node.id);
      const after = toSnapshot(node);
      if (!before) {
        prev.set(node.id, after);
        continue;
      }
      if (before.parentNodeId !== after.parentNodeId || before.order !== after.order) {
        reorderItems.push({ id: node.id, parentNodeId: node.parentNodeId, order: node.order });
      }
      if (
        before.props !== after.props ||
        before.grid !== after.grid ||
        before.region !== after.region ||
        before.events !== after.events ||
        before.label !== after.label ||
        before.binding !== after.binding
      ) {
        await patchNode(node.id, {
          props: node.props,
          grid: node.grid,
          region: node.region,
          events: node.events,
          label: node.label,
          bindingJson: node.binding == null ? null : JSON.stringify(node.binding),
        }).catch(() => null);
      }
      prev.set(node.id, after);
    }

    if (reorderItems.length > 0) {
      await fetch('/api/admin/nodes/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reorderItems }),
      }).catch(() => null);
    }
  }
}
