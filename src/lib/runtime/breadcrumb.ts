import type { PageTreeNode } from '@/lib/db/page-tree';

export type BreadcrumbItem = { label: string; href?: string };

function findPath(
  nodes: PageTreeNode[],
  targetId: string,
  base: string,
  trail: BreadcrumbItem[]
): BreadcrumbItem[] | null {
  for (const node of nodes) {
    const href = `${base}/${node.slug}`;
    const nextTrail = [...trail, { label: node.title, href }];
    if (node.id === targetId) return nextTrail;
    const found = findPath(node.children, targetId, href, nextTrail);
    if (found) return found;
  }
  return null;
}

/** 페이지 트리에서 activeId까지의 조상 경로를 breadcrumb 아이템 배열로 만든다. */
export function buildBreadcrumb(
  tree: PageTreeNode[],
  activeId: string | null,
  base = '/home'
): BreadcrumbItem[] {
  if (!activeId) return [];
  return findPath(tree, activeId, base, []) ?? [];
}
