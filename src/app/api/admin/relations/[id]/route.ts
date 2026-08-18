import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { relationUpdateSchema } from '@/types/graph';
import type { ApiResult } from '@/types/auth';

/** §10.5는 POST/DELETE만 명시하지만, §8.4.3("엣지 클릭 시 라벨/카디널리티 편집")을 만족시키려면
 * 수정 경로가 필요해 PATCH를 추가했다 — 파생 엣지(CONTAINS/REFERENCES)는애초에 Relation 테이블에
 * 없으므로 이 라우트로 도달할 일이 없다(자연히 "직접 편집 불가"가 지켜진다). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = relationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const existing = await prisma.relation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '연결을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const relation = await prisma.relation.update({ where: { id }, data: parsed.data });
  return NextResponse.json<ApiResult<typeof relation>>({ ok: true, data: relation });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.relation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '연결을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  await prisma.relation.delete({ where: { id } });
  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
