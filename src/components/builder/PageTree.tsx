'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { EyeOff, GripVertical, Home, MoreHorizontal, Plus, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import type { PageTreeNode } from '@/lib/db/page-tree';
import type { ApiResult } from '@/types/auth';

type FlatPage = {
  id: string;
  title: string;
  icon: string | null;
  isVisible: boolean;
  isHome: boolean;
  parentId: string | null;
  depth: 0 | 1;
};

function flatten(tree: PageTreeNode[]): FlatPage[] {
  const out: FlatPage[] = [];
  for (const root of tree) {
    out.push({
      id: root.id,
      title: root.title,
      icon: root.icon,
      isVisible: root.isVisible,
      isHome: root.isHome,
      parentId: null,
      depth: 0,
    });
    for (const child of root.children) {
      out.push({
        id: child.id,
        title: child.title,
        icon: child.icon,
        isVisible: child.isVisible,
        isHome: child.isHome,
        parentId: root.id,
        depth: 1,
      });
    }
  }
  return out;
}

const INDENT_THRESHOLD = 24;

function getProjection(items: FlatPage[], activeId: string, overId: string, offsetX: number) {
  const overItem = items.find((i) => i.id === overId);
  const activeItem = items.find((i) => i.id === activeId);
  if (!overItem || !activeItem) return { parentId: null, depth: 0 as const, rejected: true };

  const activeHasChildren = items.some((i) => i.parentId === activeId);
  const wantsNest = offsetX > INDENT_THRESHOLD;

  const parentId = wantsNest ? (overItem.depth === 0 ? overItem.id : overItem.parentId) : null;
  const depth: 0 | 1 = parentId ? 1 : 0;

  const rejected = parentId === activeId || (depth === 1 && activeHasChildren);

  return { parentId, depth, rejected };
}

function recomputeOrders(items: FlatPage[]) {
  const counters = new Map<string | null, number>();
  return items.map((item) => {
    const order = counters.get(item.parentId) ?? 0;
    counters.set(item.parentId, order + 1);
    return { id: item.id, parentId: item.parentId, order };
  });
}

async function apiCall<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return res.json();
}

export function PageTree({
  tree,
  selectedId,
  onSelect,
  onRefetch,
}: {
  tree: PageTreeNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefetch: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<FlatPage[]>(() => flatten(tree));
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatPage | null>(null);
  const offsetXRef = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // 부모(BuilderShell)의 tree가 바뀌면(속성 패널 편집 등) 로컬 뷰를 다시 동기화한다.
  useEffect(() => {
    setItems(flatten(tree));
  }, [tree]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [items, search]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragMove(event: DragMoveEvent) {
    setOverId(event.over ? String(event.over.id) : null);
    offsetXRef.current = event.delta.x;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;

    const projection = getProjection(items, String(active.id), String(over.id), offsetXRef.current);
    if (projection.rejected) {
      toast.error('페이지 계층은 최대 2단까지만 허용됩니다.');
      return;
    }

    const activeItem = items.find((i) => i.id === active.id)!;
    const withoutActive = items.filter((i) => i.id !== active.id);
    const overIdx = withoutActive.findIndex((i) => i.id === over.id);
    const updatedActive: FlatPage = { ...activeItem, parentId: projection.parentId, depth: projection.depth };
    const newItems = [
      ...withoutActive.slice(0, overIdx),
      updatedActive,
      ...withoutActive.slice(overIdx),
    ];

    const previous = items;
    setItems(newItems);

    const payload = recomputeOrders(newItems);
    const result = await apiCall<null>('/api/admin/pages/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ items: payload }),
    });
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error.message);
    } else {
      await onRefetch();
    }
  }

  async function handleAddPage() {
    const result = await apiCall<{ id: string }>('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify({ title: '새 페이지' }),
    });
    if (result.ok) {
      await onRefetch();
      onSelect(result.data.id);
    } else {
      toast.error(result.error.message);
    }
  }

  async function handleDuplicate(page: FlatPage) {
    const result = await apiCall<{ id: string }>('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify({ title: `${page.title} 사본`, icon: page.icon, parentId: page.parentId }),
    });
    if (result.ok) {
      await onRefetch();
    } else {
      toast.error(result.error.message);
    }
  }

  async function handleSetHome(page: FlatPage) {
    const result = await apiCall<null>(`/api/admin/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHome: true }),
    });
    if (result.ok) await onRefetch();
    else toast.error(result.error.message);
  }

  async function handleToggleVisible(page: FlatPage) {
    const result = await apiCall<null>(`/api/admin/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isVisible: !page.isVisible }),
    });
    if (result.ok) await onRefetch();
    else toast.error(result.error.message);
  }

  async function commitRename(page: FlatPage, title: string) {
    setRenamingId(null);
    if (!title.trim() || title === page.title) return;
    const result = await apiCall<null>(`/api/admin/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: title.trim() }),
    });
    if (result.ok) await onRefetch();
    else toast.error(result.error.message);
  }

  async function confirmDelete(strategy?: 'cascade' | 'promote') {
    if (!deleteTarget) return;
    const url = strategy
      ? `/api/admin/pages/${deleteTarget.id}?childStrategy=${strategy}`
      : `/api/admin/pages/${deleteTarget.id}`;
    const result = await apiCall<null>(url, { method: 'DELETE' });
    if (result.ok) {
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) onSelect(null);
      await onRefetch();
    } else if (result.error.code === 'HAS_CHILDREN') {
      // 다이얼로그를 유지하고 전략 선택 버튼을 계속 보여준다
    } else {
      toast.error(result.error.message);
      setDeleteTarget(null);
    }
  }

  const hasChildrenTarget = deleteTarget
    ? items.some((i) => i.parentId === deleteTarget.id)
    : false;

  return (
    <div className="flex h-full flex-col gap-2 border-r p-2">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="페이지 검색"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button size="icon-sm" variant="outline" onClick={handleAddPage} aria-label="페이지 추가">
          <Plus className="size-4" />
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {visible.map((page) => {
              const projection =
                activeId && overId === page.id
                  ? getProjection(items, activeId, page.id, offsetXRef.current)
                  : null;
              return (
                <PageRow
                  key={page.id}
                  page={page}
                  selected={selectedId === page.id}
                  renaming={renamingId === page.id}
                  dropRejected={projection?.rejected ?? false}
                  dropNesting={!!projection && !projection.rejected && projection.depth === 1}
                  isDragging={activeId === page.id}
                  onSelect={() => onSelect(page.id)}
                  onStartRename={() => setRenamingId(page.id)}
                  onCommitRename={(title) => commitRename(page, title)}
                  onDuplicate={() => handleDuplicate(page)}
                  onSetHome={() => handleSetHome(page)}
                  onToggleVisible={() => handleToggleVisible(page)}
                  onDelete={() => setDeleteTarget(page)}
                />
              );
            })}
            {visible.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">페이지가 없습니다</p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&quot;{deleteTarget?.title}&quot; 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {hasChildrenTarget
                ? '이 페이지에는 자식 페이지가 있습니다. 처리 방식을 선택하세요.'
                : '이 작업은 되돌릴 수 없습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            {hasChildrenTarget ? (
              <>
                <Button variant="outline" onClick={() => confirmDelete('promote')}>
                  자식을 상위로 이동
                </Button>
                <Button variant="destructive" onClick={() => confirmDelete('cascade')}>
                  자식도 함께 삭제
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => confirmDelete()}>
                삭제
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageRow({
  page,
  selected,
  renaming,
  dropRejected,
  dropNesting,
  isDragging,
  onSelect,
  onStartRename,
  onCommitRename,
  onDuplicate,
  onSetHome,
  onToggleVisible,
  onDelete,
}: {
  page: FlatPage;
  selected: boolean;
  renaming: boolean;
  dropRejected: boolean;
  dropNesting: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
  onDuplicate: () => void;
  onSetHome: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: page.depth === 1 ? 24 : 4,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-1 rounded-md py-1 pr-1 text-sm',
        selected ? 'bg-accent' : 'hover:bg-accent/50',
        isDragging && 'opacity-40',
        dropNesting && !dropRejected && 'ring-2 ring-primary',
        dropRejected && 'ring-2 ring-destructive'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="드래그 핸들"
      >
        <GripVertical className="size-3.5" />
      </button>

      {page.icon && <DynamicIcon name={page.icon} className="size-3.5 shrink-0" />}

      {renaming ? (
        <input
          autoFocus
          defaultValue={page.title}
          className="h-6 flex-1 rounded border bg-background px-1 text-sm outline-none"
          onBlur={(e) => onCommitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') onCommitRename(page.title);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 truncate text-left"
        >
          {page.title}
        </button>
      )}

      {page.isHome && <Home className="size-3 shrink-0 text-muted-foreground" />}
      {!page.isVisible && <EyeOff className="size-3 shrink-0 text-muted-foreground" />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 data-open:opacity-100"
            aria-label="더 보기"
          >
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onStartRename}>이름 변경</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>복제</DropdownMenuItem>
          <DropdownMenuItem onSelect={onSetHome} disabled={page.isHome}>
            홈으로 지정
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleVisible}>
            {page.isVisible ? '숨기기' : '보이기'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
