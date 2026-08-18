'use client';

import { Layers, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import type { RFNode } from '@/components/graph/types';

export type PageNavItem = { id: string; title: string; slug: string; icon: string | null; nodeCount: number };

/**
 * 관계도 좌측 페이지 내비게이션. 전체 그래프는 앱의 동작 구조를 보기엔 좋지만 노드가 100개를
 * 넘어가면 "이 페이지의 배치"를 손보기가 어렵다 — 여기서 페이지를 고르면 그 페이지와 관련된
 * 노드만 남고, 자동 배치도 그 노드들만 대상으로 돌아간다(§8.4 관계도 범위 지정).
 */
export function PageNav({
  pages,
  activePageId,
  onSelect,
  totalNodeCount,
}: {
  pages: PageNavItem[];
  /** null이면 전체 보기 */
  activePageId: string | null;
  onSelect: (pageId: string | null) => void;
  totalNodeCount: number;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">보기 범위</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent',
            activePageId === null && 'bg-sidebar-accent font-medium'
          )}
        >
          <Layers className="size-4 shrink-0" />
          <span className="flex-1 truncate">전체 구조</span>
          <span className="text-xs tabular-nums text-muted-foreground">{totalNodeCount}</span>
        </button>

        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelect(page.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent',
              activePageId === page.id && 'bg-sidebar-accent font-medium'
            )}
            title={`/home/${page.slug}`}
          >
            {page.icon ? <DynamicIcon name={page.icon} className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
            <span className="flex-1 truncate">{page.title}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{page.nodeCount}</span>
          </button>
        ))}
      </div>
      <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        페이지를 고르면 그 페이지의 컴포넌트와 연결된 액션·엔티티만 보이고, 자동 배치도 그 범위에서만 실행됩니다.
      </p>
    </aside>
  );
}

/**
 * 선택한 페이지의 "관련 노드" 집합. 페이지 자신 + 그 페이지의 컴포넌트 + 그 컴포넌트가 읽는
 * 엔티티 / 트리거하는 액션 + 그 액션이 쓰는 엔티티·이동하는 페이지까지 한 단계 따라간다 —
 * 배치를 손볼 때 맥락(무엇을 읽고 무엇을 쓰는지)이 함께 보여야 의미가 있기 때문이다.
 */
export function collectPageScope(nodes: RFNode[], edges: { source: string; target: string }[], pageId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const scope = new Set<string>();

  const pageNode = nodes.find((n) => n.data.refType === 'PAGE' && n.data.refId === pageId);
  if (pageNode) scope.add(pageNode.id);

  for (const n of nodes) {
    if (n.data.refType === 'COMPONENT' && (n.data as { pageId?: string }).pageId === pageId) scope.add(n.id);
  }

  // 컴포넌트에서 한 단계(→ 액션/엔티티), 액션에서 한 단계 더(→ 엔티티/페이지)
  for (let depth = 0; depth < 2; depth += 1) {
    const current = [...scope];
    for (const e of edges) {
      const from = byId.get(e.source);
      const to = byId.get(e.target);
      if (!from || !to) continue;
      if (current.includes(e.source) && (to.data.refType === 'ACTION' || to.data.refType === 'ENTITY')) scope.add(e.target);
      if (current.includes(e.target) && from.data.refType === 'ACTION') scope.add(e.source);
    }
  }

  return scope;
}
