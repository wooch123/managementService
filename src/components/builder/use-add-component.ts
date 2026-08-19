'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { apiCall } from '@/lib/api-client';
import { getComponentDef } from '@/lib/registry/catalog';
import { useCanvasStore, type CanvasNode } from '@/components/builder/canvas-store';

/**
 * 컴포넌트를 현재 페이지 **맨 아래**에 추가한다.
 *
 * WHY: 팔레트에서 캔버스로 끌어다 놓으려면 두 칸이 동시에 보여야 한다. 창이 좁아 칸을 탭으로
 * 접으면(§ BuilderShell 좁은 폭 모드) 그 조건이 성립하지 않아 컴포넌트를 아예 추가할 수 없다.
 * 그래서 좌표를 고르지 않고 "맨 아래에 붙인다"는 예측 가능한 규칙으로 추가하고, 위치 조정은
 * 캔버스 안에서 끌어 옮기게 한다(한 칸 안이라 좁은 화면에서도 그대로 동작한다).
 */
export function useAddComponent() {
  const pageId = useCanvasStore((s) => s.pageId);
  const nodes = useCanvasStore((s) => s.nodes);
  const activeRegion = useCanvasStore((s) => s.activeRegion);
  const addNode = useCanvasStore((s) => s.addNode);
  const select = useCanvasStore((s) => s.select);

  return useCallback(
    async (componentKey: string): Promise<boolean> => {
      if (!pageId) {
        toast.error('먼저 페이지를 선택하세요.');
        return false;
      }
      const def = getComponentDef(componentKey);
      if (!def) return false;

      // 같은 영역의 최상위 컴포넌트 중 가장 아래 끝 다음 줄.
      const bottom = nodes
        .filter((n) => !n.parentNodeId && n.region === activeRegion)
        .reduce((max, n) => Math.max(max, n.grid.row + n.grid.rowSpan), 1);

      const result = await apiCall<CanvasNode>('/api/admin/nodes', {
        method: 'POST',
        body: JSON.stringify({
          pageId,
          type: componentKey,
          parentNodeId: null,
          grid: { col: 1, row: bottom, span: def.defaultGrid.span, rowSpan: def.defaultGrid.rowSpan },
          region: activeRegion,
        }),
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      addNode(result.data);
      select(result.data.id);
      toast.success(`${def.label}을(를) 맨 아래에 추가했습니다.`);
      return true;
    },
    [pageId, nodes, activeRegion, addNode, select]
  );
}
