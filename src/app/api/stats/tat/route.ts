import { NextRequest, NextResponse } from 'next/server';
import { getTatSummary, type TatSummary } from '@/lib/stats/tat';
import type { ApiResult } from '@/types/auth';

/**
 * TAT 분포 — 가로축 걸린 일수, 세로축 FAR 건수.
 *
 * 바인딩(`mode: 'group'`)으로는 만들 수 없다. TAT는 두 날짜의 차이이고 완료 시각은 다른 표
 * (분석 이력)에 있어서, 컬럼 하나로 묶는 방식으로는 나오지 않는다. 그래서 전용 창구를 둔다
 * — 접속자 통계·게시판과 같은 성격이다.
 */

export const runtime = 'nodejs';

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const threshold = clampInt(sp.get('threshold'), 14, 1, 365);
  const maxDays = clampInt(sp.get('maxDays'), 30, 7, 365);

  try {
    const data = await getTatSummary({ threshold, maxDays });
    return NextResponse.json<ApiResult<TatSummary>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'TAT_FAILED', message: err instanceof Error ? err.message : 'TAT를 계산하지 못했습니다.' },
      },
      { status: 500 }
    );
  }
}
