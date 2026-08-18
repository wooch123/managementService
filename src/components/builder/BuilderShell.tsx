'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type Modifier } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { PageTree } from '@/components/builder/PageTree';
import { PagePropertiesPanel } from '@/components/builder/PagePropertiesPanel';
import { ComponentPalette } from '@/components/builder/ComponentPalette';
import { Canvas } from '@/components/builder/Canvas';
import { NodePropertyPanel } from '@/components/builder/NodePropertyPanel';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import { useCanvasStore } from '@/components/builder/canvas-store';
import { useCanvasSync } from '@/components/builder/use-canvas-sync';
import { getComponentDef } from '@/lib/registry/catalog';
import type { PageTreeNode } from '@/lib/db/page-tree';
import type { NodeDto } from '@/lib/db/nodes';
import type { ApiResult } from '@/types/auth';

/** 드래그 오버레이가 원래 잡은 지점과 상관없이 항상 "왼쪽 위 모서리가 커서에 매달린" 것처럼
 * 보이도록 오프셋을 top-left 기준으로 다시 계산한다. dnd-kit 내장 snapCenterToCursor를
 * 중심 대신 모서리 기준으로 바꾼 버전. */
const snapTopLeftToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + (coords.x - draggingNodeRect.left),
    y: transform.y + (coords.y - draggingNodeRect.top),
  };
};

/** 페이지 트리(2단)에서 id로 페이지를 찾는다 — 캔버스에 넘길 레이아웃 값(rowHeight/gap)에 쓴다. */
function findPageInTree(nodes: PageTreeNode[], id: string | null): PageTreeNode | undefined {
  if (!id) return undefined;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findPageInTree(node.children, id);
    if (found) return found;
  }
  return undefined;
}

export function BuilderShell({
  initialTree,
  initialSelectedId,
  initialSelectedNodeId,
}: {
  initialTree: PageTreeNode[];
  initialSelectedId: string | null;
  /** 검증 화면 등에서 "대상 링크"로 넘어올 때 함께 선택 상태로 만들 노드 id. 최초 진입 시 딱
   * 한 번만 적용하고, 이후 사용자가 직접 페이지/노드를 바꾸면 더 이상 개입하지 않는다. */
  initialSelectedNodeId?: string | null;
}) {
  const [tree, setTree] = useState(initialTree);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(initialSelectedId);
  const [activeComponentKey, setActiveComponentKey] = useState<string | null>(null);
  const loadPage = useCanvasStore((s) => s.loadPage);
  const select = useCanvasStore((s) => s.select);
  const canvasSelectedId = useCanvasStore((s) => s.selectedId);
  const pendingNodeIdRef = useRef(initialSelectedNodeId ?? null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const selectedPage = findPageInTree(tree, selectedPageId);

  const refetchTree = useCallback(async () => {
    const res = await fetch('/api/admin/pages');
    const result: ApiResult<PageTreeNode[]> = await res.json();
    if (result.ok) setTree(result.data);
  }, []);

  useEffect(() => {
    if (!selectedPageId) return;
    let cancelled = false;
    fetch(`/api/admin/pages/${selectedPageId}/nodes`)
      .then((r) => r.json())
      .then((result: ApiResult<NodeDto[]>) => {
        if (cancelled || !result.ok) return;
        loadPage(selectedPageId, result.data);
        const pendingNodeId = pendingNodeIdRef.current;
        if (pendingNodeId && result.data.some((n) => n.id === pendingNodeId)) {
          select(pendingNodeId);
        }
        pendingNodeIdRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPageId, loadPage, select]);

  useCanvasSync();

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { source?: string; componentKey?: string; nodeId?: string } | undefined;
    if (data?.source === 'palette' && data.componentKey) {
      setActiveComponentKey(data.componentKey);
    } else if (data?.source === 'existing-node' && data.nodeId) {
      // 배치된 컴포넌트를 재배치하는 드래그도 팔레트 드래그와 같은 스윙 오버레이를 쓴다 —
      // 카탈로그 key(컴포넌트 type)만 있으면 동일한 아이콘/라벨 조회 로직을 그대로 재사용할 수 있다.
      const node = useCanvasStore.getState().nodes.find((n) => n.id === data.nodeId);
      if (node) setActiveComponentKey(node.type);
    }
  }

  function handleDragStop() {
    setActiveComponentKey(null);
  }

  const activeDef = activeComponentKey ? getComponentDef(activeComponentKey) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragStop} onDragCancel={handleDragStop}>
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={240} minSize={200}>
          <PageTree tree={tree} selectedId={selectedPageId} onSelect={setSelectedPageId} onRefetch={refetchTree} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={260} minSize={220}>
          <ComponentPalette />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={400}>
          {selectedPageId ? (
            // 캔버스가 운영 화면과 같은 비율로 보이도록 페이지의 행 높이/간격을 그대로 넘긴다.
            <Canvas pageId={selectedPageId} rowHeight={selectedPage?.rowHeight} gap={selectedPage?.gap} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              왼쪽에서 페이지를 선택하세요
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={320} minSize={280}>
          {canvasSelectedId ? (
            <NodePropertyPanel />
          ) : (
            <PagePropertiesPanel tree={tree} selectedId={selectedPageId} onChanged={refetchTree} />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <DragOverlay modifiers={[snapTopLeftToCursor]} dropAnimation={null}>
        {activeDef && (
          <div className="wa-swing origin-top-left">
            <div className="flex h-11 w-44 items-center gap-2 rounded-md border bg-card px-2 text-sm shadow-lg">
              <DynamicIcon name={activeDef.icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{activeDef.label}</span>
            </div>
          </div>
        )}
      </DragOverlay>
      <style>{`
        @keyframes wa-swing {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }
        .wa-swing {
          animation: wa-swing 0.5s ease-in-out infinite;
        }
      `}</style>
    </DndContext>
  );
}
