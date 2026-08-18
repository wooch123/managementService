import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { ComponentNode } from '@prisma/client';

export type NodeDto = {
  id: string;
  pageId: string;
  type: string;
  parentNodeId: string | null;
  order: number;
  region: 'main' | 'aside';
  grid: { col: number; span: number; row: number; rowSpan: number };
  props: Record<string, unknown>;
  binding: unknown;
  events: Record<string, string>;
  label: string | null;
};

export function serializeNode(node: ComponentNode): NodeDto {
  return {
    id: node.id,
    pageId: node.pageId,
    type: node.type,
    parentNodeId: node.parentNodeId,
    order: node.order,
    region: node.region === 'aside' ? 'aside' : 'main',
    grid: { col: node.gridCol, span: node.gridSpan, row: node.gridRow, rowSpan: node.gridRowSpan },
    props: JSON.parse(node.propsJson) as Record<string, unknown>,
    binding: node.bindingJson ? JSON.parse(node.bindingJson) : null,
    events: JSON.parse(node.eventsJson) as Record<string, string>,
    label: node.label,
  };
}

export async function getPageNodes(pageId: string): Promise<NodeDto[]> {
  const nodes = await prisma.componentNode.findMany({
    where: { pageId },
    orderBy: { order: 'asc' },
  });
  return nodes.map(serializeNode);
}

export async function nextNodeOrder(pageId: string, parentNodeId: string | null): Promise<number> {
  const last = await prisma.componentNode.findFirst({
    where: { pageId, parentNodeId },
    orderBy: { order: 'desc' },
  });
  return (last?.order ?? -1) + 1;
}

/** target이 node(nodeId)의 자기 자신이거나 후손이면 true (순환 참조 방지) */
export async function isDescendantOrSelf(nodeId: string, targetId: string): Promise<boolean> {
  if (nodeId === targetId) return true;
  const children = await prisma.componentNode.findMany({
    where: { parentNodeId: nodeId },
    select: { id: true },
  });
  for (const child of children) {
    if (await isDescendantOrSelf(child.id, targetId)) return true;
  }
  return false;
}
