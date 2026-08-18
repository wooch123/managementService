import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { graphNodesSaveSchema } from '@/types/graph';
import type { ApiResult } from '@/types/auth';

/** 노드 좌표 일괄 저장 — §8.4.1 "이동이 끝날 때 저장, 드래그 중에는 저장하지 않는다" 및
 * 다중 선택 그룹 이동의 일괄 저장을 모두 이 엔드포인트 하나로 처리한다. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = graphNodesSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.graphNode.updateMany({
        where: { refType: item.refType, refId: item.refId },
        data: { x: item.x, y: item.y },
      })
    )
  );

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
