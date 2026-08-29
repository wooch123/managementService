'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { renderNodeTree } from '@/lib/runtime/render-node-tree';
import type { NodeDto } from '@/lib/db/nodes';
import type { ComponentNodeSpec } from '@/types/spec';
import type { Effect, ActionResult } from '@/lib/actions/executor';

/** 우측 패널은 폭이 좁아 본문(기본 16px)보다 촘촘한 행 간격을 쓴다 — 같은 rowSpan이라도 패널
 * 안에서는 더 조밀하게 쌓인다. */
export const ASIDE_GAP = 4;

/**
 * CSV 내보내기 액션의 결과를 실제 파일로 내려준다.
 *
 * 서버(§9 EXPORT_CSV)는 예전부터 `{ filename, csv }`를 만들어 돌려줬는데 받는 쪽이 아무것도 하지
 * 않아, 버튼을 눌러도 겉보기에 아무 일이 없었다. 엑셀에서 한글이 깨지지 않도록 BOM을 앞에 붙인다.
 */
function downloadCsvIfAny(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const { filename, csv } = data as { filename?: unknown; csv?: unknown };
  if (typeof filename !== 'string' || typeof csv !== 'string') return;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * §12.2~12.3 운영 렌더러. PreviewRuntime(P6, /admin/preview 전용)과 로직(dispatch → §10.7
 * POST /api/runtime/action → effects 처리, 입력값 추적)은 거의 같지만 세 가지가 다르다:
 * 드래프트가 아니라 서버에서 이미 프리페치한 발행 스펙 노드/바인딩 데이터를 받고, navigate가
 * `/admin/preview`가 아니라 실제 `/home/{slug}`로 이동하며, refresh는 router.refresh()로
 * 서버 컴포넌트(바인딩 프리페치 포함)를 다시 실행시킨다.
 */
export function RuntimeRenderer({
  nodes,
  bindingData,
  cols,
  rowHeight,
  gap,
  asideVisible = true,
  routeParams = {},
}: {
  /** 본문(main)과 우측 패널(aside) 컴포넌트가 모두 들어온다 — 영역 분리는 이 안에서 한다. */
  nodes: ComponentNodeSpec[];
  bindingData: Record<string, unknown>;
  cols: number;
  rowHeight: number;
  gap: number;
  /**
   * 주소의 쿼리 파라미터 — 액션이 `주소 파라미터` 값 소스로 쓴다(§9 ValueSource `route`).
   * 목록에서 고른 항목(`?sel=FAR-26-4514`)을 그대로 '담당자 변경'·'상태 업데이트' 같은
   * 액션의 대상 키로 넘기기 위한 통로다.
   */
  routeParams?: Record<string, string>;
  /** 페이지 속성 — 관리자가 우측 지표 패널을 끄면 컴포넌트가 있어도 렌더하지 않는다. */
  asideVisible?: boolean;
}) {
  // 두 영역을 한 컴포넌트 안에서 렌더해야 입력값 상태(componentValues)를 공유한다 —
  // 우측 패널의 입력이 본문 액션의 값 소스가 되는 구성도 그대로 동작해야 하기 때문이다.
  const asideRootIds = new Set(nodes.filter((n) => n.region === 'aside' && !n.parentNodeId).map((n) => n.id));
  const isAside = (n: ComponentNodeSpec) => n.region === 'aside';
  const mainNodes = nodes.filter((n) => !isAside(n));
  const asideNodes = nodes.filter(isAside);
  const hasAside = asideVisible && asideRootIds.size > 0;
  const router = useRouter();
  const [componentValues, setComponentValues] = useState<Record<string, unknown>>({});

  function applyEffects(effects: Effect[]) {
    for (const effect of effects) {
      if (effect.type === 'toast') {
        const fn = effect.variant === 'destructive' ? toast.error : effect.variant === 'success' ? toast.success : toast;
        fn(effect.message);
      } else if (effect.type === 'navigate') {
        router.push(`/home/${effect.slug}`);
      } else if (effect.type === 'openModal' || effect.type === 'closeModal') {
        // §12.3 명세대로 effect는 수신·소비하지만, 카탈로그의 dialog/sheet/drawer가 캔버스
        // WYSIWYG 제약 때문에 정적 미리보기로 고정되어 있어(feedback.tsx 주석 참고) 실제
        // 열림/닫힘 시각 반영은 이번 P8 범위에서는 하지 않는다 — PROGRESS.md에 스코프 축소로
        // 기록했다. 데이터 흐름(입력→액션→토스트→갱신) 자체는 이 제약과 무관하게 동작한다.
      } else if (effect.type === 'refresh') {
        router.refresh();
      }
    }
  }

  const handleDispatch = useCallback(
    async (node: NodeDto, eventName: string, payload?: unknown): Promise<boolean> => {
      const actionId = node.events[eventName];
      if (!actionId) return false;
      // payload를 주면 이번 실행에만 이 노드의 값을 그것으로 바꿔 쓴다 — 값 상태를 건드리지
      // 않으므로 표 한 장을 줄마다 실행해도 화면의 입력이 흔들리지 않는다.
      const values = payload === undefined ? componentValues : { ...componentValues, [node.id]: payload };
      const res = await fetch('/api/runtime/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, context: { componentValues: values, routeParams } }),
      });
      const result = (await res.json()) as ActionResult;
      if (!result.ok) {
        toast.error(result.error ?? '액션 실행에 실패했습니다.');
        return false;
      }
      downloadCsvIfAny(result.data);
      applyEffects(result.effects);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [componentValues, routeParams]
  );

  const hooks = {
    dispatch: (node: NodeDto, eventName: string, payload?: unknown) => handleDispatch(node, eventName, payload),
    getValue: (nodeId: string) => componentValues[nodeId],
    onValueChange: (nodeId: string, v: unknown) => setComponentValues((prev) => ({ ...prev, [nodeId]: v })),
    getData: (nodeId: string) => bindingData[nodeId],
  };

  return (
    // 본문은 읽기 좋은 폭(최대 1200px)으로 제한하되 **가운데 정렬하지 않는다** — mx-auto로
    // 가운데에 두면 화면이 넓어질수록 사이드바와 본문 사이가 같이 벌어진다(2560px에서 432px까지
    // 떨어졌다). 관리 콘솔류(Vercel·Linear·Stripe 대시보드)의 일반적인 처리대로 콘텐츠를
    // 사이드바에 붙여 좌측 정렬하고, 남는 여백은 오른쪽에 둔다. 우측 지표 패널은 본문 바로
    // 옆에 붙어 함께 움직인다(뷰포트 오른쪽 끝에 고정하지 않는다).
    <div className="flex w-full max-w-[1760px] gap-6">
      {/* runtime-grid-wrap: 좁은 폭 규칙의 기준이 되는 컨테이너. 뷰포트가 아니라 **본문이 실제로
          쓸 수 있는 폭**을 기준으로 판단해야 한다 — 사이드바가 열려 있느냐에 따라 같은 창 크기에서도
          본문 폭이 크게 달라지기 때문이다(globals.css 참고). */}
      <div className="runtime-grid-wrap w-full min-w-0 max-w-[1200px] flex-1">
        <div
          className="runtime-grid grid gap-4"
          style={
            {
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              /**
               * 줄 높이는 `minmax(min-content, 줄높이)` — "기본은 설계한 높이, 다만 **꼭 필요한 만큼**은 늘어난다".
               *
               * 고정(`8px`)이면 접힌 글이 아래 컴포넌트 위에 겹쳐 그려진다(폭이 좁을 때 실제로 그랬다).
               * 그렇다고 `minmax(줄높이, auto)`로 두면 최대 크기가 **내용 전체**가 되어, 안에서 스스로
               * 스크롤하려는 컴포넌트(대화형 게시판)가 높이를 못 받고 통째로 늘어나 버린다.
               *
               * 최소를 `auto`로 적으면 안 된다: 그리드 항목의 `auto` 최소 크기는 "자동 최소 크기" 규칙을
               * 타서 사실상 0으로 취급돼 줄이 전혀 늘어나지 않는다(실측: 조회 기간 필터 카드가 102px로
               * 접혔는데 칸은 56px 그대로였다). `min-content`로 못 박아야 한다.
               */
              gridAutoRows: `minmax(min-content, ${rowHeight}px)`,
              gap,
              '--rt-row-h': `${rowHeight}px`,
              '--rt-gap': `${gap}px`,
            } as React.CSSProperties
          }
        >
          {renderNodeTree(mainNodes as unknown as NodeDto[], null, hooks)}
        </div>
      </div>

      {hasAside && (
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-0 rounded-xl border bg-card/80 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <div
              className="runtime-grid grid"
              style={
                {
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridAutoRows: `minmax(min-content, ${rowHeight}px)`,
                  gap: ASIDE_GAP,
                  '--rt-row-h': `${rowHeight}px`,
                  '--rt-gap': `${ASIDE_GAP}px`,
                } as React.CSSProperties
              }
            >
              {renderNodeTree(asideNodes as unknown as NodeDto[], null, hooks)}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
