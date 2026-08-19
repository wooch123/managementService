'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDroppable, useDndMonitor, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import {
  Undo2,
  Redo2,
  Grid3x3,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  LayoutGrid,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useCanvasStore, useCanvasTemporal, type CanvasNode } from '@/components/builder/canvas-store';
import { CanvasNodeView } from '@/components/builder/CanvasNodeView';
import { getComponentDef } from '@/lib/registry/catalog';
import {
  nextRootOrderLocal,
  scaleGrid,
  resolvePlacement,
  applyResize,
  VIEWPORT_COLS,
} from '@/components/builder/grid-utils';
import { cn } from '@/lib/utils';

const CANVAS_PADDING_PX = 8; // 그리드 컨테이너의 p-2

/**
 * 캔버스 그리드 기하. 운영 화면(RuntimeRenderer)은 행/열 사이에 `gap`을 두는데, 캔버스가 그
 * 간격을 무시하면 같은 rowSpan이라도 화면에서 훨씬 납작하게 그려져 컴포넌트가 서로 겹쳐
 * 보이고("배치가 어렵다"의 실제 원인), 드롭 위치도 아래로 갈수록 어긋난다. 그래서 캔버스도
 * 같은 gap을 쓰고, 좌표 변환은 전부 이 "피치(칸+간격)" 기준으로 계산한다.
 */
type Geometry = { cols: number; rowHeight: number; gap: number; colPitch: number; colWidth: number; rowPitch: number };

function geometryOf(el: HTMLElement | null, cols: number, rowHeight: number, gap: number): Geometry {
  const contentWidth = Math.max(1, (el?.clientWidth ?? 1200) - CANVAS_PADDING_PX * 2);
  const colPitch = (contentWidth + gap) / cols;
  return { cols, rowHeight, gap, colPitch, colWidth: colPitch - gap, rowPitch: rowHeight + gap };
}

/** 그리드 좌표 → 캔버스 안 픽셀 사각형(드롭 미리보기 오버레이용) */
function rectOf(grid: DropGrid, geo: Geometry): { left: number; top: number; width: number; height: number } {
  return {
    left: CANVAS_PADDING_PX + (grid.col - 1) * geo.colPitch,
    top: CANVAS_PADDING_PX + (grid.row - 1) * geo.rowPitch,
    width: grid.span * geo.colPitch - geo.gap,
    height: grid.rowSpan * geo.rowHeight + (grid.rowSpan - 1) * geo.gap,
  };
}

async function apiCall<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return res.json();
}

type DropGrid = { col: number; row: number; span: number; rowSpan: number };

/** 드래그 중인 요소의 화면 좌표 → 그리드 셀 좌표. onDragMove(미리보기)와 onDragEnd(실제 배치)가
 * 같은 계산을 공유해야 미리보기가 실제 배치 위치와 어긋나지 않는다. */
function computeDropGrid(
  activeRect: { left: number; top: number } | null,
  containerRect: DOMRect,
  geo: Geometry,
  defaultSpan: number,
  defaultRowSpan: number
): DropGrid | null {
  if (!activeRect) return null;
  const relX = activeRect.left - containerRect.left - CANVAS_PADDING_PX;
  const relY = activeRect.top - containerRect.top - CANVAS_PADDING_PX;
  const col = Math.min(geo.cols, Math.max(1, Math.round(relX / geo.colPitch) + 1));
  const row = Math.max(1, Math.round(relY / geo.rowPitch) + 1);
  return { col, row, span: Math.min(defaultSpan, geo.cols - col + 1), rowSpan: defaultRowSpan };
}

export function Canvas({
  pageId,
  rowHeight = 8,
  gap = 16,
  propertyPanelOpen = true,
  onTogglePropertyPanel,
}: {
  pageId: string;
  /** 페이지 속성(§4.4) — 운영 화면과 같은 값을 써야 캔버스가 실제 결과와 같은 비율로 보인다. */
  rowHeight?: number;
  gap?: number;
  /** 우측 속성 패널 표시 여부(BuilderShell이 소유) */
  propertyPanelOpen?: boolean;
  onTogglePropertyPanel?: () => void;
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const select = useCanvasStore((s) => s.select);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const removeSubtree = useCanvasStore((s) => s.removeSubtree);
  const duplicateLocal = useCanvasStore((s) => s.duplicateLocal);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const activeRegion = useCanvasStore((s) => s.activeRegion);
  const setRegion = useCanvasStore((s) => s.setRegion);
  const setNodeRegion = useCanvasStore((s) => s.setNodeRegion);
  const temporal = useCanvasTemporal();

  const [showGrid, setShowGrid] = useState(true);
  const [dropPreview, setDropPreview] = useState<DropGrid | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const cols = VIEWPORT_COLS[viewport];
  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({ id: 'canvas-root' });

  // 본문과 우측 패널은 물리적으로 다른 그리드다 — 배치·충돌 계산은 항상 "지금 편집 중인
  // 영역 안"에서만 이뤄진다.
  const regionNodes = useMemo(() => nodes.filter((n) => n.region === activeRegion), [nodes, activeRegion]);

  const roots = useMemo(
    () => regionNodes.filter((n) => !n.parentNodeId).sort((a, b) => a.order - b.order),
    [regionNodes]
  );

  const asideCount = useMemo(() => nodes.filter((n) => n.region === 'aside' && !n.parentNodeId).length, [nodes]);

  const geo = geometryOf(containerRef.current, cols, rowHeight, gap);

  /**
   * 이미 배치된 컴포넌트의 이동은 절대 좌표가 아니라 "끈 거리(delta)"로 계산한다. 드래그 핸들이
   * 컴포넌트 본문이 아니라 좌측 상단 배지라서, 핸들의 화면 좌표를 그대로 셀 좌표로 바꾸면 실제
   * 컴포넌트 위치와 핸들 위치의 차이만큼 항상 어긋난다. 상대 이동은 그 오프셋과 무관하다.
   */
  function moveGridByDelta(nodeId: string, delta: { x: number; y: number }): CanvasNode['grid'] | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const dCol = Math.round(delta.x / geo.colPitch);
    const dRow = Math.round(delta.y / geo.rowPitch);
    return {
      ...node.grid,
      col: Math.max(1, Math.min(cols - node.grid.span + 1, node.grid.col + dCol)),
      row: Math.max(1, node.grid.row + dRow),
    };
  }

  // 팔레트에서 새로 끌어오는 것(source: 'palette')과 이미 배치된 컴포넌트를 재배치하는 것
  // (source: 'existing-node')은 "드롭 위치를 그리드 좌표로 계산한다"는 점은 같지만, span/rowSpan을
  // 어디서 가져오는지(카탈로그 기본값 vs 그 노드의 현재 크기)와 결과 처리(새 노드 생성 vs 기존
  // 노드 grid 갱신)가 다르다 — 공통 부분만 여기서 뽑아 쓴다.
  function resolveDragSpan(data: { source?: string; componentKey?: string; nodeId?: string } | undefined): { span: number; rowSpan: number } | null {
    if (data?.source === 'palette' && data.componentKey) {
      const def = getComponentDef(data.componentKey);
      return def ? { span: def.defaultGrid.span, rowSpan: def.defaultGrid.rowSpan } : null;
    }
    if (data?.source === 'existing-node' && data.nodeId) {
      const node = nodes.find((n) => n.id === data.nodeId);
      return node ? { span: node.grid.span, rowSpan: node.grid.rowSpan } : null;
    }
    return null;
  }

  useDndMonitor({
    onDragMove: (event: DragMoveEvent) => {
      const { active, over, delta } = event;
      const data = active.data.current as { source?: string; componentKey?: string; nodeId?: string } | undefined;
      const span = resolveDragSpan(data);
      if (!span) return;

      // 이미 배치된 컴포넌트의 이동은 over(드롭 대상)를 아예 보지 않는다 — 재배치는 루트 좌표
      // 이동만 지원하는데, 카드·탭 같은 컨테이너 위를 지나가면 over가 그 컨테이너 드롭존으로
      // 잡혀 이동이 통째로 무시됐다(세로로만 끌면 거의 항상 이 경로에 걸렸다).
      if (data?.source === 'existing-node' && data.nodeId) {
        const moved = moveGridByDelta(data.nodeId, delta);
        setDropPreview(moved ? resolvePlacement(regionNodes, data.nodeId, moved, cols) : null);
        return;
      }

      const overId = over ? String(over.id) : '';
      if (overId.startsWith('container:') || !containerRef.current) {
        setDropPreview(null); // 컨테이너 위는 CanvasNodeView의 자체 드롭존 강조로 충분하다
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const activeRect = active.rect.current.translated ?? active.rect.current.initial;
      const computed = computeDropGrid(activeRect, rect, geo, span.span, span.rowSpan);
      setDropPreview(computed ? resolvePlacement(regionNodes, null, computed, cols) : null);
    },
    onDragEnd: async (event: DragEndEvent) => {
      const { active, over, delta } = event;
      setDropPreview(null);
      const data = active.data.current as { source?: string; componentKey?: string; nodeId?: string } | undefined;
      const span = resolveDragSpan(data);
      if (!span) return;

      const overId = over ? String(over.id) : '';
      const parentNodeId = overId.startsWith('container:') ? overId.slice('container:'.length) : null;

      if (data?.source === 'existing-node' && data.nodeId) {
        // 재배치는 루트 레벨 좌표 이동만 지원한다(컨테이너 간 이동은 범위 밖) — 그래서 드롭
        // 대상이 컨테이너로 잡혔는지와 무관하게, 끈 거리만큼 루트 그리드에서 옮긴다.
        const moved = moveGridByDelta(data.nodeId, delta);
        if (!moved) return;
        // useCanvasSync가 300ms 디바운스로 서버에 자동 반영한다.
        updateNode(data.nodeId, { grid: resolvePlacement(regionNodes, data.nodeId, moved, cols) });
        return;
      }

      if (!over) return; // 팔레트 → 캔버스 밖으로 놓은 경우

      let grid = { col: 1, row: 1, span: span.span, rowSpan: span.rowSpan };
      if (!parentNodeId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const activeRect = active.rect.current.translated ?? active.rect.current.initial;
        const computed = computeDropGrid(activeRect, rect, geo, span.span, span.rowSpan);
        if (computed) grid = computed;
        grid = resolvePlacement(regionNodes, null, grid, cols);
      }

      if (data?.source === 'palette' && data.componentKey) {
        const result = await apiCall<CanvasNode>('/api/admin/nodes', {
          method: 'POST',
          body: JSON.stringify({ pageId, type: data.componentKey, parentNodeId, grid, region: activeRegion }),
        });
        if (result.ok) {
          addNode(result.data);
        } else {
          toast.error(result.error.message);
        }
      }
    },
    onDragCancel: () => setDropPreview(null),
  });

  const handleDuplicate = useCallback(
    async (id: string) => {
      const result = await apiCall<CanvasNode>(`/api/admin/nodes/${id}/duplicate`, { method: 'POST' });
      if (result.ok) duplicateLocal(id, result.data);
      else toast.error(result.error.message);
    },
    [duplicateLocal]
  );

  function handleDelete(id: string) {
    removeSubtree(id);
  }

  function handleReorder(id: string, direction: 'front' | 'back') {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const siblings = nodes
      .filter((n) => n.parentNodeId === node.parentNodeId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((n) => n.id === id);
    const swapIdx = direction === 'front' ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    moveNode(id, node.parentNodeId, other.order);
    moveNode(other.id, other.parentNodeId, node.order);
  }

  /** 컴포넌트를 본문 ↔ 우측 패널로 옮긴다. 옮긴 영역에서 겹치지 않는 자리로 자동 배치한다. */
  function handleChangeRegion(id: string, region: 'main' | 'aside') {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    setNodeRegion(id, region);
    const targetRegionNodes = nodes.filter((n) => n.region === region && n.id !== id);
    const span = region === 'aside' ? Math.min(node.grid.span, cols) : node.grid.span;
    updateNode(id, { grid: resolvePlacement(targetRegionNodes, id, { ...node.grid, col: 1, span }, cols) });
    toast.success(region === 'aside' ? '우측 패널로 옮겼습니다.' : '본문으로 옮겼습니다.');
  }

  function handleUnparent(id: string) {
    const order = nextRootOrderLocal(nodes);
    moveNode(id, null, order);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) temporal.getState().redo();
        else temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedId) {
          e.preventDefault();
          void handleDuplicate(selectedId);
        }
        return;
      }
      if (!selectedId) return;
      const node = nodes.find((n) => n.id === selectedId);
      if (!node) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSubtree(selectedId);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const isResize = e.shiftKey;
        const patch = { ...node.grid };
        if (isResize) {
          if (e.key === 'ArrowRight') patch.span = Math.min(cols - node.grid.col + 1, node.grid.span + 1);
          if (e.key === 'ArrowLeft') patch.span = Math.max(1, node.grid.span - 1);
          if (e.key === 'ArrowDown') patch.rowSpan = Math.max(2, node.grid.rowSpan + 1);
          if (e.key === 'ArrowUp') patch.rowSpan = Math.max(2, node.grid.rowSpan - 1);
          // 키보드 리사이즈도 이웃을 침범하지 못한다 — 닿는 지점에서 멈춘다.
          updateNode(selectedId, { grid: applyResize(regionNodes, selectedId, node.grid, patch, cols) });
        } else {
          if (e.key === 'ArrowRight') patch.col = Math.min(cols - node.grid.span + 1, node.grid.col + 1);
          if (e.key === 'ArrowLeft') patch.col = Math.max(1, node.grid.col - 1);
          if (e.key === 'ArrowDown') patch.row = node.grid.row + 1;
          if (e.key === 'ArrowUp') patch.row = Math.max(1, node.grid.row - 1);
          // 이동은 겹치면 빈 자리로 밀어낸다(방향키 한 번에 한 칸씩 이동하는 감각은 유지).
          updateNode(selectedId, { grid: resolvePlacement(regionNodes, selectedId, patch, cols) });
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, nodes, regionNodes, cols, temporal, updateNode, removeSubtree, handleDuplicate]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <Button variant="ghost" size="icon-sm" onClick={() => temporal.getState().undo()} aria-label="실행 취소">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => temporal.getState().redo()} aria-label="다시 실행">
          <Redo2 className="size-4" />
        </Button>
        <Toggle pressed={showGrid} onPressedChange={setShowGrid} size="sm" aria-label="그리드 가이드 토글">
          <Grid3x3 className="size-4" />
        </Toggle>
        {/* 편집 영역 전환 — 운영 화면의 본문 그리드와 우측 플로팅 패널을 같은 캔버스에서
            따로 꾸민다(둘 다 12칼럼 그리드 규칙은 동일하다). */}
        <ToggleGroup
          type="single"
          value={activeRegion}
          onValueChange={(v) => v && setRegion(v as 'main' | 'aside')}
          size="sm"
          className="ml-1"
        >
          <ToggleGroupItem value="main" aria-label="본문 영역 편집">
            <LayoutGrid className="size-4" />
            본문
          </ToggleGroupItem>
          <ToggleGroupItem value="aside" aria-label="우측 패널 편집">
            <PanelRight className="size-4" />
            우측 패널
            {asideCount > 0 && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{asideCount}</span>}
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup type="single" value={viewport} onValueChange={(v) => v && setViewport(v as typeof viewport)} size="sm">
          <ToggleGroupItem value="desktop" aria-label="데스크톱">
            <Monitor className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="tablet" aria-label="태블릿">
            <Tablet className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="모바일">
            <Smartphone className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link href={`/admin/preview/${pageId}`} target="_blank">
            <ExternalLink className="size-4" />
            미리보기
          </Link>
        </Button>
        {onTogglePropertyPanel && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onTogglePropertyPanel}
            aria-label={propertyPanelOpen ? '속성 패널 숨기기' : '속성 패널 보기'}
            title={propertyPanelOpen ? '속성 패널 숨기기' : '속성 패널 보기'}
          >
            {propertyPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        )}
      </div>

      <div
        className={cn(
          'flex-1 overflow-auto bg-muted/40 p-6',
          // 관계도(React Flow) 배경과 통일한 20px 균일 점 격자. 이전에는 캔버스 안쪽에 칼럼
          // 폭×8px 타일로 점을 찍었는데, 세로 간격(8px)이 너무 촘촘해 점들이 세로선처럼
          // 뭉쳐 보였다 — 칼럼과 무관한 균일 점 패턴 하나로 통일해 그 문제를 없앴다.
          showGrid && '[background-image:radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-position:0_0] [background-size:20px_20px]'
        )}
        onClick={() => select(null)}
      >
        {roots.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGrid />
              </EmptyMedia>
              <EmptyTitle>{activeRegion === 'aside' ? '우측 패널이 비어 있습니다' : '빈 페이지입니다'}</EmptyTitle>
              <EmptyDescription>
                {activeRegion === 'aside'
                  ? '좌측 팔레트에서 요소를 끌어다 놓으면 운영 화면 오른쪽 플로팅 패널에 표시됩니다'
                  : '좌측 팔레트에서 요소를 끌어다 놓으세요'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {/* 우측 패널은 운영 화면에서 300px 고정 폭이라, 편집 캔버스도 같은 폭으로 보여야
            "보이는 대로" 배치할 수 있다. */}
        <div
          className={cn(
            'relative rounded-lg border bg-background shadow-sm',
            // 페이지 경계가 눈에 보여야 "어디까지가 화면인지" 알고 배치할 수 있다 — 회색 작업
            // 영역 위에 흰 페이지가 놓인 형태로, 위 여백/좌우 끝이 명확해진다.
            isOverRoot && 'ring-2 ring-primary/40'
          )}
          style={{
            maxWidth: activeRegion === 'aside' ? 320 : viewport === 'mobile' ? 375 : viewport === 'tablet' ? 768 : '100%',
            marginInline: activeRegion === 'aside' || viewport !== 'desktop' ? 'auto' : undefined,
          }}
        >
          {/* 칼럼 가이드(세로 줄무늬)는 두지 않는다 — 배치한 컴포넌트와 겹쳐 보여 오히려
              내용을 읽기 어렵다는 피드백에 따라 제거했다. 페이지 경계(흰 페이지 + 테두리)와
              드롭 미리보기만으로 위치를 잡는다. */}
          {/* 드롭 미리보기는 그리드의 자식이 아니라 절대 위치 오버레이로 그린다 — 그리드 자식으로
              넣으면 드래그 중 매 프레임 그리드 콘텐츠(자동 행 수 등)가 바뀌어 dnd-kit이 캐시한
              드롭 영역 rect와 어긋나 실제 드롭이 씹히는 문제가 있었다(레이아웃에 전혀 관여하지
              않는 순수 시각적 오버레이로 분리해 해결). */}
          {dropPreview && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border-2 border-dashed border-primary bg-primary/15"
              style={rectOf(dropPreview, geo)}
            />
          )}
          <div
            ref={(el) => {
              containerRef.current = el;
              setRootDropRef(el);
            }}
            className={cn(
              // 세로 gap은 일부러 뺐다 — 이 그리드는 8px짜리 촘촘한 auto-row를 쓰는데, 세로
              // gap을 넣으면 여러 행에 걸쳐 있는 컴포넌트마다 그 gap이 안쪽에 겹겹이 더해져
              // (rowSpan-1)×gap만큼 실제 렌더 높이가 부풀어 오른다. 그러면 드롭 위치 계산이
              // 가정하는 "8px = 1행" 비율이 깨져서, 아래로 내려갈수록 실제 드롭 위치가 커서보다
              // 한참 아래로 밀리는 문제가 생겼다 — 컴포넌트 간 세로 여백은 각 컴포넌트 자체의
              // 테두리/패딩으로 충분하다.
              'relative z-[1] grid min-h-[400px] rounded-md p-2 transition-colors',
              isOverRoot && 'bg-primary/5'
            )}
            style={
              {
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridAutoRows: `${rowHeight}px`,
                gap,
                '--cell-w': `calc(100% / ${cols})`,
              } as React.CSSProperties
            }
          >
          {(() => {
            let runningRow = 1;
            return roots.map((node) => {
              const scaled = scaleGrid(node.grid, viewport, cols);
              const displayGrid =
                viewport === 'mobile' ? { ...scaled, row: runningRow, rowSpan: node.grid.rowSpan } : scaled;
              if (viewport === 'mobile') runningRow += node.grid.rowSpan;
              return (
                <CanvasNodeView
                  key={node.id}
                  node={{ ...node, grid: displayGrid }}
                  allNodes={nodes}
                  isRoot
                  colWidthPx={geo.colPitch}
                  rowHeightPx={geo.rowPitch}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onReorder={handleReorder}
                  onUnparent={handleUnparent}
                  onChangeRegion={handleChangeRegion}
                />
              );
            });
          })()}
          </div>
        </div>
      </div>
    </div>
  );
}
