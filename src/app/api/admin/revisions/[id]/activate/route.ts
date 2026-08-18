import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import type { ApiResult } from '@/types/auth';

/** §8.6 롤백 — activeRevisionId만 즉시 교체한다. 데이터 스키마는 자동으로 되돌리지 않는다
 * (되돌리려면 데이터 손실 위험이 있어, 필요하면 관리자가 백업 파일로 직접 복원해야 한다 —
 * 이 사실은 /admin/deploy 화면의 롤백 확인 다이얼로그에 명시한다). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const revision = await prisma.revision.findUnique({ where: { id } });
  if (!revision) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '리비전을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  await prisma.deployment.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', activeRevisionId: id },
    update: { activeRevisionId: id },
  });
  revalidateTag('published-spec');

  return NextResponse.json<ApiResult<{ revisionNo: number }>>({ ok: true, data: { revisionNo: revision.revisionNo } });
}
