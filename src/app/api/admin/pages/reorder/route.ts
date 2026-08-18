import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { pageReorderSchema } from '@/types/page';
import type { ApiResult } from '@/types/auth';

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = pageReorderSchema.safeParse(body);
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
  const allPages = await prisma.page.findMany({ select: { id: true, parentId: true } });
  const allIds = new Set(allPages.map((p) => p.id));

  // 이번 배치 반영 후의 최종 parentId를 계산 (배치에 없는 페이지는 기존 값 유지)
  const finalParentId = new Map<string, string | null>(allPages.map((p) => [p.id, p.parentId]));
  for (const item of items) {
    if (!allIds.has(item.id)) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NOT_FOUND', message: `페이지를 찾을 수 없습니다: ${item.id}` } },
        { status: 404 }
      );
    }
    finalParentId.set(item.id, item.parentId);
  }

  for (const item of items) {
    if (item.parentId === null) continue;
    if (item.parentId === item.id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'CYCLE', message: '자기 자신을 부모로 지정할 수 없습니다.' } },
        { status: 400 }
      );
    }
    if (!allIds.has(item.parentId)) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 페이지를 찾을 수 없습니다.' } },
        { status: 400 }
      );
    }
    if (finalParentId.get(item.parentId) !== null) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DEPTH_EXCEEDED', message: '페이지 계층은 최대 2단까지만 허용됩니다.' } },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.page.update({
        where: { id: item.id },
        data: { parentId: item.parentId, order: item.order },
      })
    )
  );

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
