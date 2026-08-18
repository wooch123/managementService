'use client';

import { useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { GripVertical } from 'lucide-react';
import { getComponentDef } from '@/lib/registry/catalog';
import { useCanvasStore, type CanvasNode } from '@/components/builder/canvas-store';
import { NodeErrorBoundary } from '@/components/builder/NodeErrorBoundary';
import { applyResize } from '@/components/builder/grid-utils';
import { cn } from '@/lib/utils';

/** 자기 표면을 이미 갖고 있는 컴포넌트 — 카드로 감싸면 테두리가 겹친다(runtime/render-node-tree와 동일 규칙). */
const SELF_SURFACED = new Set(['card', 'alert']);

const MIN_SPAN = 1;
const MAX_SPAN = 12;
const MIN_ROW_SPAN = 2;

export function CanvasNodeView({
  node,
  allNodes,
  isRoot,
  colWidthPx,
  rowHeightPx,
  onDuplicate,
  onDelete,
  onReorder,
  onUnparent,
  onChangeRegion,
}: {
  node: CanvasNode;
  allNodes: CanvasNode[];
  isRoot: boolean;
  colWidthPx: number;
  rowHeightPx: number;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 'front' | 'back') => void;
  onUnparent: (id: string) => void;
  onChangeRegion?: (id: string, region: 'main' | 'aside') => void;
}) {
  const def = getComponentDef(node.type);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const select = useCanvasStore((s) => s.select);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const selected = selectedId === node.id;
  const resizeRef = useRef<{ axis: 'span' | 'rowSpan' | 'both'; startX: number; startY: number; startSpan: number; startRowSpan: number } | null>(null);

  const childNodes = allNodes
    .filter((n) => n.parentNodeId === node.id)
    .sort((a, b) => a.order - b.order);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `container:${node.id}`,
    disabled: !def?.isContainer,
    data: { containerId: node.id },
  });

  // 배치된 컴포넌트의 위치 재조정 — 루트 레벨 노드만 지원한다(중첩 자식까지 열면 컨테이너 간
  // 이동 등 스코프가 커진다). 선택 시 뜨는 라벨 배지를 드래그 핸들로 써서, 자식 클릭/드롭 같은
  // 본문 영역의 기존 상호작용과 겹치지 않게 한다.
  //
  // setNodeRef를 반드시 핸들 엘리먼트에 붙여야 한다 — 빠뜨리면 dnd-kit이 드래그 대상의 rect를
  // 측정하지 못해 충돌 감지가 항상 실패하고(over === null), 드롭이 통째로 무시된다(실제로
  // 이 상태였다: 배치된 컴포넌트를 아무리 끌어도 위치가 바뀌지 않았다).
  const {
    setNodeRef: setDragHandleRef,
    attributes: dragAttributes,
    listeners: dragListeners,
    transform: dragTransform,
    isDragging,
  } = useDraggable({
    id: `existing:${node.id}`,
    data: { source: 'existing-node', nodeId: node.id },
    disabled: !isRoot,
  });

  if (!def) {
    return (
      <div
        style={isRoot ? gridStyle(node) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          select(node.id);
        }}
        className={cn(
          'flex min-h-8 items-center justify-center rounded-md border border-dashed border-destructive/50 p-2 text-xs text-destructive',
          selected && 'ring-2 ring-primary'
        )}
      >
        알 수 없는 컴포넌트: {node.type}
      </div>
    );
  }

  function startResize(e: React.PointerEvent, axis: 'span' | 'rowSpan' | 'both') {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startSpan: node.grid.span,
      startRowSpan: node.grid.rowSpan,
    };
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeRef.current) return;
    const { axis, startX, startY, startSpan, startRowSpan } = resizeRef.current;
    const deltaCol = Math.round((e.clientX - startX) / colWidthPx);
    const deltaRow = Math.round((e.clientY - startY) / rowHeightPx);
    const desired = { ...node.grid };
    if (axis === 'span' || axis === 'both') {
      desired.span = Math.min(MAX_SPAN - node.grid.col + 1, Math.max(MIN_SPAN, startSpan + deltaCol));
    }
    if (axis === 'rowSpan' || axis === 'both') {
      desired.rowSpan = Math.max(MIN_ROW_SPAN, startRowSpan + deltaRow);
    }
    // 이웃 컴포넌트 영역을 침범하지 않는 최대 크기까지만 커진다(닿으면 멈춘다).
    // 충돌 판정은 같은 화면 영역 안에서만 한다(본문 ↔ 우측 패널은 별개 그리드).
    const sameRegionNodes = allNodes.filter((n) => n.region === node.region);
    const next = applyResize(sameRegionNodes, node.id, node.grid, desired, MAX_SPAN);
    updateNode(node.id, { grid: { span: next.span, rowSpan: next.rowSpan } });
  }

  function endResize(e: React.PointerEvent) {
    if (!resizeRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  }

  const content = (
    <NodeErrorBoundary typeName={def.label}>
      {def.render({
        node: { id: node.id, type: node.type },
        props: node.props,
        dispatch: () => {},
        children: def.isContainer ? (
          <div ref={setDropRef} className={cn('flex min-h-8 flex-col gap-2', isOver && 'rounded-md outline-dashed outline-2 outline-primary')}>
            {childNodes.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                여기에 컴포넌트를 드래그하세요
              </div>
            )}
            {childNodes.map((child) => (
              <CanvasNodeView
                key={child.id}
                node={child}
                allNodes={allNodes}
                isRoot={false}
                colWidthPx={colWidthPx}
                rowHeightPx={rowHeightPx}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onReorder={onReorder}
                onUnparent={onUnparent}
                onChangeRegion={onChangeRegion}
              />
            ))}
          </div>
        ) : undefined,
      })}
    </NodeErrorBoundary>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={isRoot ? setDragHandleRef : undefined}
          {...(isRoot ? dragAttributes : {})}
          {...(isRoot ? dragListeners : {})}
          style={
            isRoot
              ? {
                  ...gridStyle(node),
                  // 드래그하는 동안 실제로 커서를 따라오게 한다 — 예전에는 드롭한 뒤에야 새 칸에
                  // 나타나서, 끌고 있는 동안 어디로 가는지 전혀 알 수 없었다. 최종 위치는 드롭할 때
                  // 격자에 맞춰 정렬된다(delta → 칸 수 환산).
                  ...(dragTransform
                    ? {
                        transform: `translate3d(${dragTransform.x}px, ${dragTransform.y}px, 0)`,
                        zIndex: 30,
                      }
                    : null),
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation();
            select(node.id);
          }}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          data-node-id={node.id}
          tabIndex={0}
          className={cn(
            // 컴포넌트 어디를 눌러도 끌 수 있다 — 예전에는 선택 후 좌상단 배지만 잡을 수 있어
            // "드래그가 안 된다"고 느끼기 쉬웠다. 클릭만 하면(4px 미만 이동) 선택으로 처리된다
            // (PointerSensor activationConstraint).
            'group/node relative outline-none',
            isRoot && 'cursor-grab active:cursor-grabbing',
            selected && 'z-10',
            isDragging && 'opacity-90 shadow-lg'
          )}
        >
          {/* 배지는 이제 "이 컴포넌트가 무엇인지" 알려주는 라벨이다(드래그는 본문 전체에서 된다). */}
          <span
            className={cn(
              'pointer-events-none absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground transition-opacity',
              selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'
            )}
            title={isRoot ? '드래그해서 위치 이동' : undefined}
          >
            {isRoot && <GripVertical className="size-3" />}
            {def.label}
          </span>
          <div
            className={cn(
              'h-full rounded-md',
              // 운영 화면과 같은 카드 표면 — 캔버스에서 보이는 모양이 실제 결과와 같아야 한다.
              isRoot && !SELF_SURFACED.has(node.type) && 'flex flex-col rounded-xl border bg-card p-3 text-card-foreground shadow-sm',
              selected && 'outline outline-2 outline-offset-2 outline-primary'
            )}
          >
            {isRoot && !SELF_SURFACED.has(node.type) ? <div className="min-h-0 flex-1">{content}</div> : content}
          </div>
          {selected && isRoot && (
            <>
              <div
                onPointerDown={(e) => startResize(e, 'span')}
                className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-primary/0 hover:bg-primary/40"
              />
              <div
                onPointerDown={(e) => startResize(e, 'rowSpan')}
                className="absolute bottom-0 left-0 h-1.5 w-full cursor-ns-resize bg-primary/0 hover:bg-primary/40"
              />
              <div
                onPointerDown={(e) => startResize(e, 'both')}
                className="absolute right-0 bottom-0 size-3 cursor-nwse-resize bg-primary/60"
              />
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onDuplicate(node.id)}>
          복제
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onReorder(node.id, 'front')}>앞으로</ContextMenuItem>
        <ContextMenuItem onSelect={() => onReorder(node.id, 'back')}>뒤로</ContextMenuItem>
        {node.parentNodeId && <ContextMenuItem onSelect={() => onUnparent(node.id)}>부모에서 꺼내기</ContextMenuItem>}
        {isRoot && onChangeRegion && (
          <ContextMenuItem onSelect={() => onChangeRegion(node.id, node.region === 'aside' ? 'main' : 'aside')}>
            {node.region === 'aside' ? '본문으로 옮기기' : '우측 패널로 옮기기'}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onDelete(node.id)}>
          삭제
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function gridStyle(node: CanvasNode): React.CSSProperties {
  return {
    gridColumn: `${node.grid.col} / span ${node.grid.span}`,
    gridRow: `${node.grid.row} / span ${node.grid.rowSpan}`,
  };
}
