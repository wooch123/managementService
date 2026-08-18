import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import { nodeReorderSchema } from '@/types/node';
import type { ApiResult } from '@/types/auth';

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = nodeReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() },
      },
      { status: 400 }
    );
  }

  const { items } = parsed.data;
  const ids = items.map((i) => i.id);
  const allNodes = await prisma.componentNode.findMany({ where: { id: { in: ids } } });
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  if (allNodes.length !== ids.length) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '일부 컴포넌트를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  for (const item of items) {
    if (item.parentNodeId === item.id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'CYCLE', message: '자기 자신을 부모로 지정할 수 없습니다.' } },
        { status: 400 }
      );
    }
    if (item.parentNodeId) {
      const parent = nodeMap.get(item.parentNodeId) ?? (await prisma.componentNode.findUnique({ where: { id: item.parentNodeId } }));
      if (!parent) {
        return NextResponse.json<ApiResult<never>>(
          { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 노드를 찾을 수 없습니다.' } },
          { status: 400 }
        );
      }
      const parentDef = nodeMeta[parent.type];
      if (!parentDef?.isContainer) {
        return NextResponse.json<ApiResult<never>>(
          { ok: false, error: { code: 'NOT_CONTAINER', message: '대상은 자식을 담을 수 없는 컴포넌트입니다.' } },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.componentNode.update({
        where: { id: item.id },
        data: { parentNodeId: item.parentNodeId, order: item.order },
      })
    )
  );

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
