import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getPageTree } from '@/lib/db/page-tree';
import { requireAdminSession } from '@/lib/auth/require-session';
import { resolveUniqueSlug, nextRootOrder, nextChildOrder } from '@/lib/db/pages';
import { slugify } from '@/lib/slugify';
import { pageCreateSchema } from '@/types/page';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const tree = await getPageTree();
  return NextResponse.json<ApiResult<typeof tree>>({ ok: true, data: tree });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = pageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() },
      },
      { status: 400 }
    );
  }

  const { title, icon, parentId } = parsed.data;

  if (parentId) {
    const parent = await prisma.page.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 페이지를 찾을 수 없습니다.' } },
        { status: 400 }
      );
    }
    if (parent.parentId) {
      return NextResponse.json<ApiResult<never>>(
        {
          ok: false,
          error: { code: 'DEPTH_EXCEEDED', message: '페이지 계층은 최대 2단까지만 허용됩니다.' },
        },
        { status: 400 }
      );
    }
  }

  const baseSlug = parsed.data.slug ?? slugify(title);
  const slug = await resolveUniqueSlug(baseSlug);
  const order = parentId ? await nextChildOrder(parentId) : await nextRootOrder();

  const page = await prisma.page.create({
    data: { title, slug, icon: icon ?? null, parentId: parentId ?? null, order },
  });

  return NextResponse.json<ApiResult<typeof page>>({ ok: true, data: page });
}
