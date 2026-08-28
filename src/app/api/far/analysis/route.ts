import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ANALYSIS_COLUMNS } from '@/lib/far/analysis-fields';
import { FarSampleNotFound, readAnalysisHistory, writeAnalysis } from '@/lib/far/analysis-log';
import type { ApiResult } from '@/types/auth';

/**
 * 분석 Tool용 갱신 API — 설계 문서의 "분석 이후에 분석 Tool 통해 DB에 update 할 값
 * (server API 제공 필요)"에 해당하는 창구다.
 *
 *   POST /api/far/analysis   분석 값을 기록한다(이력 한 줄 추가 + 원장 갱신, 한 트랜잭션)
 *   GET  /api/far/analysis   한 sample의 기록 이력을 회차 역순으로 읽는다
 *
 * **여러 번 갱신해도 이전 값이 남는다.** 저장할 때마다 그 시점의 값 전부가 `far_analysis_log`에
 * 한 줄로 쌓이고, 그 표는 고쳐 쓰거나 지울 수 없다(DB 트리거). 자세한 구조는 analysis-log.ts 참고.
 *
 * 인증: 관리자 세션 **또는** `FAR_API_TOKEN` 환경변수와 같은 Bearer 토큰. 둘 다 없으면 거절한다 —
 * 분석 결과를 아무나 덮어쓸 수 있으면 이력을 남기는 의미가 없다. 토큰을 설정하지 않은 환경에서는
 * 관리자 세션으로만 쓸 수 있다.
 */
const MAX_HISTORY = 200;

/**
 * 값 묶음. 키를 enum으로 못 박지 않는 이유: zod의 record는 열거형 키를 주면 **전부 있어야**
 * 통과한다 — 그러면 한 칸만 갱신하는 호출이 막힌다. 키 검사는 아래에서 직접 하고, 어떤 칸이
 * 틀렸는지 이름까지 돌려준다.
 */
const valuesSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.array(z.string().max(200)).max(64), z.null()])
);

const postSchema = z.object({
  far_no: z.string().trim().min(1).max(64),
  sample_no: z.string().trim().min(1).max(64),
  source: z.string().trim().max(40).default('분석 Tool'),
  values: valuesSchema,
});

const getSchema = z.object({
  far_no: z.string().trim().min(1).max(64),
  sample_no: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY).default(50),
});

function fail(code: string, message: string, status: number) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error: { code, message } }, { status });
}

async function authorize(request: NextRequest): Promise<boolean> {
  const token = process.env.FAR_API_TOKEN;
  if (token) {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ') && header.slice(7) === token) return true;
  }
  const session = await getSession();
  return Boolean(session.isLoggedIn);
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) return fail('UNAUTHENTICATED', '인증이 필요합니다.', 401);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', '입력값이 올바르지 않습니다.', 400);

  const columns = Object.keys(parsed.data.values);
  if (columns.length === 0) return fail('INVALID_INPUT', '기록할 값이 없습니다.', 400);
  const unknown = columns.filter((c) => !ANALYSIS_COLUMNS.includes(c));
  if (unknown.length > 0) {
    // 접수 정보(고객명·마감일 등)는 외부 서버 API가 채운다 — 이 창구로는 분석 값만 들어온다.
    return fail('INVALID_INPUT', `분석 Tool이 기록할 수 있는 칸이 아닙니다: ${unknown.join(', ')}`, 400);
  }

  try {
    const result = writeAnalysis(parsed.data.far_no, parsed.data.sample_no, parsed.data.values, parsed.data.source);
    return NextResponse.json<ApiResult<typeof result>>({ ok: true, data: result });
  } catch (err) {
    if (err instanceof FarSampleNotFound) return fail('NOT_FOUND', err.message, 404);
    return fail('WRITE_FAILED', err instanceof Error ? err.message : '기록에 실패했습니다.', 500);
  }
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) return fail('UNAUTHENTICATED', '인증이 필요합니다.', 401);

  const parsed = getSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return fail('INVALID_INPUT', '조회 조건이 올바르지 않습니다.', 400);

  const rows = readAnalysisHistory(parsed.data.far_no, parsed.data.sample_no, parsed.data.limit);
  return NextResponse.json<ApiResult<{ rows: typeof rows }>>({ ok: true, data: { rows } });
}
