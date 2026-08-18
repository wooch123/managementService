import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { nextNodeOrder, serializeNode } from '@/lib/db/nodes';
import type { ApiResult } from '@/types/auth';
import type { ComponentNode } from '@prisma/client';

async function cloneSubtree(
  node: ComponentNode,
  newParentNodeId: string | null,
  order: number
): Promise<ComponentNode> {
  const clone = await prisma.componentNode.create({
    data: {
      pageId: node.pageId,
      type: node.type,
      parentNodeId: newParentNodeId,
      order,
      gridCol: node.gridCol,
      gridSpan: node.gridSpan,
      gridRow: node.gridRow,
      gridRowSpan: node.gridRowSpan,
      propsJson: node.propsJson,
      bindingJson: node.bindingJson,
      eventsJson: node.eventsJson,
      label: node.label,
    },
  });

  const children = await prisma.componentNode.findMany({
    where: { parentNodeId: node.id },
    orderBy: { order: 'asc' },
  });
  for (let i = 0; i < children.length; i++) {
    await cloneSubtree(children[i], clone.id, i);
  }

  return clone;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const node = await prisma.componentNode.findUnique({ where: { id } });
  if (!node) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '컴포넌트를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const order = await nextNodeOrder(node.pageId, node.parentNodeId);
  const clone = await cloneSubtree(node, node.parentNodeId, order);

  return NextResponse.json<ApiResult<ReturnType<typeof serializeNode>>>({ ok: true, data: serializeNode(clone) });
}
