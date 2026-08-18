'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { renderNodeTree } from '@/lib/runtime/render-node-tree';
import { apiCall } from '@/lib/api-client';
import type { NodeDto } from '@/lib/db/nodes';
import type { Effect, ActionResult } from '@/lib/actions/executor';
import { ASIDE_GAP } from '@/components/runtime/RuntimeRenderer';

/**
 * §12.2 정식 런타임(P8, `/home`)이 아직 없어, 이 컴포넌트가 그 전까지 액션 실행을 실제로
 * 검증할 수 있는 자리를 대신한다. `dispatch`(§9.3 POST /api/runtime/action 호출)와 입력
 * 컴포넌트 값 추적(componentValues, ValueSource `from:'component'` 해석용)을 제공한다.
 * NAVIGATE 효과는 `/home/{slug}`가 없으므로 같은 미리보기 경로로 이동해 대신한다.
 */
export function PreviewRuntime({
  pageId,
  initialNodes,
  rowHeight,
  gap,
  asideVisible = true,
}: {
  pageId: string;
  initialNodes: NodeDto[];
  rowHeight: number;
  gap: number;
  /** 페이지 속성 — 관리자가 우측 지표 패널을 끄면 컴포넌트가 있어도 렌더하지 않는다. */
  asideVisible?: boolean;
}) {
  const router = useRouter();
  const [nodes, setNodes] = useState(initialNodes);
  const [componentValues, setComponentValues] = useState<Record<string, unknown>>({});

  const refetch = useCallback(async () => {
    const result = await apiCall<NodeDto[]>(`/api/admin/pages/${pageId}/nodes`);
    if (result.ok) setNodes(result.data);
  }, [pageId]);

  function applyEffects(effects: Effect[]) {
    for (const effect of effects) {
      if (effect.type === 'toast') {
        const fn = effect.variant === 'destructive' ? toast.error : effect.variant === 'success' ? toast.success : toast;
        fn(effect.message);
      } else if (effect.type === 'navigate') {
        toast.info(`페이지 이동: ${effect.slug}`);
        router.push(`/admin/preview/${effect.pageId}`);
      } else if (effect.type === 'openModal' || effect.type === 'closeModal') {
        toast.info(`${effect.type === 'openModal' ? '모달 열기' : '모달 닫기'} 효과 수신 (노드 ${effect.nodeId})`);
      } else if (effect.type === 'refresh') {
        void refetch();
      }
    }
  }

  const handleDispatch = useCallback(
    async (node: NodeDto, eventName: string) => {
      const actionId = node.events[eventName];
      if (!actionId) return;
      // §10.7: /api/runtime/action은 다른 /api/admin/* 라우트의 { ok, data } 봉투가 아니라
      // { ok, data?, error?, effects } 평평한 ActionResult 형태를 그대로 반환한다 — apiCall의
      // ApiResult<T> 가정과 맞지 않아 여기서는 fetch를 직접 쓴다.
      const res = await fetch('/api/runtime/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, context: { componentValues } }),
      });
      const result = (await res.json()) as ActionResult;
      if (!result.ok) {
        toast.error(result.error ?? '액션 실행에 실패했습니다.');
        return;
      }
      applyEffects(result.effects);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [componentValues]
  );

  const hooks = {
    dispatch: (node: NodeDto, eventName: string) => void handleDispatch(node, eventName),
    getValue: (nodeId: string) => componentValues[nodeId],
    onValueChange: (nodeId: string, v: unknown) => setComponentValues((prev) => ({ ...prev, [nodeId]: v })),
  };
  const mainNodes = nodes.filter((n) => n.region !== 'aside');
  const asideNodes = nodes.filter((n) => n.region === 'aside');

  // 운영 화면(RuntimeRenderer)과 같은 2단 구성(좌측 정렬 + 우측 패널) — 미리보기도 동일하게 보여야 한다.
  return (
    <div className="flex w-full max-w-[1760px] gap-6">
      <div className="w-full min-w-0 max-w-[1200px] flex-1">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: `${rowHeight}px`, gap }}
        >
          {renderNodeTree(mainNodes, null, hooks)}
        </div>
      </div>
      {asideVisible && asideNodes.some((n) => !n.parentNodeId) && (
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-0 rounded-xl border bg-card/80 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: `${rowHeight}px`, gap: ASIDE_GAP }}
            >
              {renderNodeTree(asideNodes, null, hooks)}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
