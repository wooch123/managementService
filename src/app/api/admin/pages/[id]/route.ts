import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { pageUpdateSchema, deleteChildStrategySchema } from '@/types/page';
import { deletePagesGraphArtifacts } from '@/lib/db/graph';
import type { ApiResult } from '@/types/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.page.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = pageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() },
      },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.slug && data.slug !== existing.slug) {
    const taken = await prisma.page.findUnique({ where: { slug: data.slug } });
    if (taken && taken.id !== id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'SLUG_TAKEN', message: '이미 사용 중인 slug입니다.' } },
        { status: 409 }
      );
    }
  }

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'INVALID_PARENT', message: '자기 자신을 부모로 지정할 수 없습니다.' } },
        { status: 400 }
      );
    }
    const parent = await prisma.page.findUnique({ where: { id: data.parentId } });
    if (!parent) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 페이지를 찾을 수 없습니다.' } },
        { status: 400 }
      );
    }
    if (parent.parentId) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DEPTH_EXCEEDED', message: '페이지 계층은 최대 2단까지만 허용됩니다.' } },
        { status: 400 }
      );
    }
    if (parent.parentId === id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'CYCLE', message: '순환 참조가 발생합니다.' } },
        { status: 400 }
      );
    }
  }

  const page = await prisma.$transaction(async (tx) => {
    if (data.isHome === true) {
      await tx.page.updateMany({ where: { isHome: true, NOT: { id } }, data: { isHome: false } });
    }
    return tx.page.update({ where: { id }, data });
  });

  return NextResponse.json<ApiResult<typeof page>>({ ok: true, data: page });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const page = await prisma.page.findUnique({ where: { id }, include: { children: true } });
  if (!page) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  if (page.children.length > 0) {
    const strategyRaw = request.nextUrl.searchParams.get('childStrategy');
    const strategyParsed = deleteChildStrategySchema.safeParse(strategyRaw);
    if (!strategyParsed.success) {
      return NextResponse.json<ApiResult<never>>(
        {
          ok: false,
          error: {
            code: 'HAS_CHILDREN',
            message: `자식 페이지 ${page.children.length}개가 있습니다. 처리 방식을 선택하세요.`,
            details: { childCount: page.children.length },
          },
        },
        { status: 409 }
      );
    }

    if (strategyParsed.data === 'cascade') {
      await deletePagesGraphArtifacts([id, ...page.children.map((c) => c.id)]);
    } else {
      await deletePagesGraphArtifacts([id]);
    }

    await prisma.$transaction(async (tx) => {
      if (strategyParsed.data === 'cascade') {
        await tx.page.deleteMany({ where: { parentId: id } });
      } else {
        await tx.page.updateMany({ where: { parentId: id }, data: { parentId: page.parentId } });
      }
      await tx.page.delete({ where: { id } });
      if (page.isHome) {
        const fallback = await tx.page.findFirst({ where: { parentId: null }, orderBy: { order: 'asc' } });
        if (fallback) await tx.page.update({ where: { id: fallback.id }, data: { isHome: true } });
      }
    });

    return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
  }

  await deletePagesGraphArtifacts([id]);
  await prisma.$transaction(async (tx) => {
    await tx.page.delete({ where: { id } });
    if (page.isHome) {
      const fallback = await tx.page.findFirst({ where: { parentId: null }, orderBy: { order: 'asc' } });
      if (fallback) await tx.page.update({ where: { id: fallback.id }, data: { isHome: true } });
    }
  });

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
