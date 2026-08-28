import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadTechReport, saveTechReport } from '@/lib/far/tech-report';
import { ALL_IMAGE_KEYS, PERF_ROWS } from '@/lib/far/tech-report-fields';
import type { ApiResult } from '@/types/auth';

/**
 * Tech Report 읽기·저장.
 *
 *   GET  ?far_no=…   불러오기 — 저장된 보고서와 FAR 원장 값을 합쳐 돌려준다
 *   PUT              저장 — 화면에서 값이 바뀔 때마다 문서 전체를 보낸다
 *
 * 저장을 한 칸씩 보내지 않고 문서째 보내는 이유: 이 화면은 sample 탭마다 스무 칸 넘게 있고
 * 표에 줄을 더하거나 지우기도 한다. 칸 단위로 주고받으면 "어떤 줄의 몇 번째 칸"을 서로가 계속
 * 맞춰야 한다. 문서 하나가 저장 단위이므로, 그대로 보내고 그대로 덮어쓰는 편이 어긋날 곳이 없다.
 */
const MAX_ROWS = 200;
const cell = z.string().max(2000);

/**
 * 칸 이름을 열거형으로 못 박지 않는다: zod의 record는 열거형 키를 주면 **전부 있어야** 통과한다.
 * 그림 칸은 대개 몇 개만 채워지므로 그대로 두면 저장이 통째로 거절된다(실제로 400이 났다).
 * 아는 이름만 남기는 일은 아래에서 직접 한다.
 */
const PERF_COLUMNS = new Set(PERF_ROWS.map((r) => r.col));
const IMAGE_KEYS = new Set(ALL_IMAGE_KEYS);

function pick(source: Record<string, string>, allowed: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
}

const sampleSchema = z.object({
  sample_no: z.string().trim().min(1).max(32),
  perf: z.record(z.string().max(64), cell).default({}),
  nand_opinion: z.string().max(20000).default(''),
  fw_opinion: z.string().max(20000).default(''),
  rtbb_list: z.array(z.record(z.string().max(32), cell)).max(MAX_ROWS).default([]),
  nand_lot_list: z.array(z.record(z.string().max(32), cell)).max(MAX_ROWS).default([]),
  images: z.record(z.string().max(64), z.string().max(200)).default({}),
});

const putSchema = z.object({
  far_no: z.string().trim().min(1).max(64),
  overall_opinion: z.string().max(20000).default(''),
  visual_top: z.string().max(200).default(''),
  visual_bottom: z.string().max(200).default(''),
  author: z.string().max(40).default(''),
  samples: z.array(sampleSchema).max(64).default([]),
});

function fail(code: string, message: string, status: number) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  const farNo = (request.nextUrl.searchParams.get('far_no') ?? '').trim();
  if (!farNo || farNo.length > 64) return fail('INVALID_INPUT', 'FAR No를 입력하세요.', 400);

  try {
    const doc = loadTechReport(farNo);
    return NextResponse.json<ApiResult<typeof doc>>({ ok: true, data: doc });
  } catch (err) {
    return fail('LOAD_FAILED', err instanceof Error ? err.message : '불러오지 못했습니다.', 500);
  }
}

export async function PUT(request: NextRequest) {
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 어느 칸이 걸렸는지 알려 준다 — 저장이 조용히 막히면 화면에서는 원인을 알 길이 없다.
    const where = parsed.error.issues[0];
    return fail('INVALID_INPUT', `입력값이 올바르지 않습니다: ${where?.path.join('.') || '알 수 없음'}`, 400);
  }

  try {
    const result = saveTechReport({
      ...parsed.data,
      // 양식에 없는 칸 이름은 저장하지 않는다(모르는 이름이 표에 닿지 않게).
      samples: parsed.data.samples.map((s) => ({
        ...s,
        perf: pick(s.perf, PERF_COLUMNS),
        images: pick(s.images, IMAGE_KEYS),
      })),
    });
    return NextResponse.json<ApiResult<typeof result>>({ ok: true, data: result });
  } catch (err) {
    return fail('SAVE_FAILED', err instanceof Error ? err.message : '저장하지 못했습니다.', 500);
  }
}
