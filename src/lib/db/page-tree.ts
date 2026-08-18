import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';

export type PageTreeNode = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  isVisible: boolean;
  isHome: boolean;
  asideVisible: boolean;
  rowHeight: number;
  gap: number;
  children: PageTreeNode[];
};

export const getPageTree = cache(async (): Promise<PageTreeNode[]> => {
  const pages = await prisma.page.findMany({ orderBy: { order: 'asc' } });

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
        asideVisible: p.asideVisible,
        rowHeight: p.rowHeight,
        gap: p.gap,
        children: [],
      },
    ])
  );

  const roots: PageTreeNode[] = [];
  for (const page of pages) {
    const node = byId.get(page.id)!;
    if (page.parentId && byId.has(page.parentId)) {
      byId.get(page.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
});
