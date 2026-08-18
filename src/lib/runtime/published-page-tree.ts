import 'server-only';
import type { PublishedSpec } from '@/types/spec';
import type { PageTreeNode } from '@/lib/db/page-tree';

/** §12.2 "사이드바 메뉴 생성 (isVisible 페이지 트리, order 순)" — page-tree.ts의 드래프트용
 * 트리 조립 알고리즘과 동일한 로직을, 발행 스펙(PublishedSpec.pages, flat)을 소스로 재구현한다.
 * visibleOnly=true면 비표시 페이지(및 그 자손)를 트리에서 아예 제외한다 — admin 사이드바처럼
 * "숨김" 배지를 붙여 보여주는 대신, 운영 메뉴에서는 완전히 감춘다. */
export function buildPublishedPageTree(spec: PublishedSpec, { visibleOnly = false }: { visibleOnly?: boolean } = {}): PageTreeNode[] {
  const pages = (visibleOnly ? spec.pages.filter((p) => p.isVisible) : spec.pages).slice().sort((a, b) => a.order - b.order);

  const byId = new Map<string, PageTreeNode>(
    pages.map((p) => [
      p.id,
      {
        id: p.id,
        slug: p.slug,
        title: p.title,
        icon: p.icon,
        isVisible: p.isVisible,
        isHome: p.isHome,
        rowHeight: p.layout.rowHeight,
        gap: p.layout.gap,
        children: [],
      },
    ])
  );

  const roots: PageTreeNode[] = [];
  for (const p of pages) {
    const node = byId.get(p.id)!;
    if (p.parentId && byId.has(p.parentId)) {
      byId.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
