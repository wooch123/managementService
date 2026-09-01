import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFarMetrics, type FarMetricsRow } from '@/lib/far/metrics';
import type { ApiResult } from '@/types/auth';

/**
 * Issue 표의 펼친 칸이 쓰는 값 — FAR 원장의 EC와 Write size(사용자 지정, 2026-09-01).
 *
 *   POST /api/runtime/far-metrics   { keys: [{ farNo, sampleNo }, …] }
 *
 * 여러 줄을 **한 번에** 묻는다. 표에 줄이 여럿이고 아무 줄이나 펼칠 수 있어서, 펼칠 때마다
 * 한 건씩 물으면 줄 수만큼 왕복이 생기고 펼치는 순간 값이 비어 있다가 뒤늦게 채워진다.
 *
 * GET이 아니라 POST인 이유: 묻는 짝이 수십 개가 될 수 있어 주소에 담기 마땅치 않다. 읽기만
 * 하지만 조건이 본문에 실리는 쪽이 맞다.
 */

export const runtime = 'nodejs';

const MAX_KEYS = 200;

const bodySchema = z.object({
  keys: z
    .array(
      z.object({
        farNo: z.string().trim().max(64),
        sampleNo: z.string().trim().max(64),
      })
    )
    .max(MAX_KEYS),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  try {
    const data = getFarMetrics(parsed.data.keys);
    return NextResponse.json<ApiResult<FarMetricsRow[]>>({ ok: true, data });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'METRICS_FAILED', message: err instanceof Error ? err.message : '원장 값을 읽지 못했습니다.' },
      },
      { status: 500 }
    );
  }
}
