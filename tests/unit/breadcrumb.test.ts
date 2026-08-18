import { describe, expect, it } from 'vitest';
import { buildBreadcrumb } from '@/lib/runtime/breadcrumb';
import type { PageTreeNode } from '@/lib/db/page-tree';

function node(partial: Partial<PageTreeNode> & Pick<PageTreeNode, 'id' | 'slug' | 'title'>): PageTreeNode {
  return {
    icon: null,
    isVisible: true,
    isHome: false,
  asideVisible: true,
    rowHeight: 8,
    gap: 16,
    children: [],
    ...partial,
  };
}

describe('buildBreadcrumb', () => {
  const tree: PageTreeNode[] = [
    node({
      id: 'p1',
      slug: 'models',
      title: 'Models',
      children: [node({ id: 'p1-1', slug: 'sub-item', title: 'Sub Item' })],
    }),
    node({ id: 'p2', slug: 'settings', title: 'Settings' }),
  ];

  it('returns an empty array when activeId is null', () => {
    expect(buildBreadcrumb(tree, null)).toEqual([]);
  });

  it('builds a single-level path for a root page', () => {
    expect(buildBreadcrumb(tree, 'p2')).toEqual([{ label: 'Settings', href: '/home/settings' }]);
  });

  it('builds a two-level path for a nested page', () => {
    expect(buildBreadcrumb(tree, 'p1-1')).toEqual([
      { label: 'Models', href: '/home/models' },
      { label: 'Sub Item', href: '/home/models/sub-item' },
    ]);
  });

  it('returns an empty array when the id is not found in the tree', () => {
    expect(buildBreadcrumb(tree, 'missing')).toEqual([]);
  });
});
