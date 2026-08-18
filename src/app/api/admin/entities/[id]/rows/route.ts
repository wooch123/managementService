import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/require-session';
import { listEntityRows, createEntityRow } from '@/lib/data-engine/crud';
import { filterSchema, sortSchema } from '@/types/binding';
import { z } from 'zod';
import type { ApiResult } from '@/types/auth';

function parseJsonParam<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  const parsed = schema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : fallback;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get('page') ?? '1') || 1;
  const pageSize = Number(sp.get('pageSize') ?? '20') || 20;
  const sort = parseJsonParam(sp.get('sort'), sortSchema.array(), []);
  const filters = parseJsonParam(sp.get('filters'), filterSchema.array(), []);

  try {
    const result = await listEntityRows(id, { page, pageSize, sort, filters });
    return NextResponse.json<ApiResult<typeof result>>({ ok: true, data: result });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'QUERY_FAILED', message: err instanceof Error ? err.message : '조회에 실패했습니다.' } },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  try {
    const row = await createEntityRow(id, body as Record<string, unknown>);
    return NextResponse.json<ApiResult<typeof row>>({ ok: true, data: row });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'CREATE_FAILED', message: err instanceof Error ? err.message : '생성에 실패했습니다.' } },
      { status: 400 }
    );
  }
}
