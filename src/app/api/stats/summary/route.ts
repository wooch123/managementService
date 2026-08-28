import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVisitSummary } from '@/lib/stats/visits';
import type { ApiResult } from '@/types/auth';

/** 접속자 통계 조회 — '접속자 통계' 화면이 읽는다. 기간은 최근 N일(기본 30일). */
const querySchema = z.object({ days: z.coerce.number().int().min(1).max(180).default(30) });

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '조회 기간이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }
  const data = await getVisitSummary(parsed.data.days);
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
