import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { isValidSlugFormat } from '@/lib/slugify';
import type { ApiResult } from '@/types/auth';

/**
 * §8.1.4 "slug 중복 시 즉시 에러" 실시간 검증용. §10.2 표에는 없지만
 * 저장 없이 가용성만 확인하기 위해 추가했다.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const slug = request.nextUrl.searchParams.get('slug') ?? '';
  const excludeId = request.nextUrl.searchParams.get('excludeId') ?? undefined;

  if (!isValidSlugFormat(slug)) {
    return NextResponse.json<ApiResult<{ available: boolean; reason: string }>>({
      ok: true,
      data: { available: false, reason: 'FORMAT' },
    });
  }

  const existing = await prisma.page.findUnique({ where: { slug } });
  const available = !existing || existing.id === excludeId;

  return NextResponse.json<ApiResult<{ available: boolean; reason: string | null }>>({
    ok: true,
    data: { available, reason: available ? null : 'TAKEN' },
  });
}
