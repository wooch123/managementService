import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import { nextNodeOrder, serializeNode } from '@/lib/db/nodes';
import { nodeCreateSchema } from '@/types/node';
import type { ApiResult } from '@/types/auth';

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = nodeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() },
      },
      { status: 400 }
    );
  }

  const { pageId, type, parentNodeId, grid } = parsed.data;
  // 자식 노드는 항상 부모와 같은 영역에 있어야 한다(컨테이너 안의 컴포넌트가 부모와 다른
  // 화면 영역에 렌더될 수는 없다) — 부모가 있으면 요청값 대신 부모의 region을 쓴다.
  let region = parsed.data.region ?? 'main';

  const def = nodeMeta[type];
  if (!def) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'UNKNOWN_TYPE', message: `카탈로그에 없는 컴포넌트 타입입니다: ${type}` } },
      { status: 400 }
    );
  }

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'PAGE_NOT_FOUND', message: '페이지를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  if (parentNodeId) {
    const parent = await prisma.componentNode.findUnique({ where: { id: parentNodeId } });
    if (!parent || parent.pageId !== pageId) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 노드를 찾을 수 없습니다.' } },
        { status: 400 }
      );
    }
    region = parent.region === 'aside' ? 'aside' : 'main';
    const parentDef = nodeMeta[parent.type];
    if (!parentDef?.isContainer) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NOT_CONTAINER', message: `${parent.type}은(는) 자식을 담을 수 없는 컴포넌트입니다.` } },
        { status: 400 }
      );
    }
    if (parentDef.allowedChildren && !parentDef.allowedChildren.includes(type)) {
      return NextResponse.json<ApiResult<never>>(
        {
          ok: false,
          error: { code: 'CHILD_NOT_ALLOWED', message: `${parent.type} 내부에는 ${type}을(를) 배치할 수 없습니다.` },
        },
        { status: 400 }
      );
    }
  }

  const order = await nextNodeOrder(pageId, parentNodeId ?? null);
  const node = await prisma.componentNode.create({
    data: {
      pageId,
      type,
      parentNodeId: parentNodeId ?? null,
      region,
      order,
      gridCol: grid?.col ?? 1,
      gridSpan: grid?.span ?? def.defaultGrid.span,
      gridRow: grid?.row ?? 1,
      gridRowSpan: grid?.rowSpan ?? def.defaultGrid.rowSpan,
      propsJson: JSON.stringify(def.defaultProps),
    },
  });

  return NextResponse.json<ApiResult<ReturnType<typeof serializeNode>>>({ ok: true, data: serializeNode(node) });
}
