import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { getActionList } from '@/lib/db/actions';
import { actionCreateSchema } from '@/types/graph';
import { defaultConfigFor } from '@/lib/actions/schema';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const actions = await getActionList();
  return NextResponse.json<ApiResult<typeof actions>>({ ok: true, data: actions });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = actionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const existing = await prisma.action.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NAME_TAKEN', message: '이미 사용 중인 이름입니다.' } },
      { status: 409 }
    );
  }

  const config = parsed.data.config ?? defaultConfigFor(parsed.data.kind);
  const action = await prisma.action.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      description: parsed.data.description ?? null,
      configJson: JSON.stringify(config),
    },
  });

  return NextResponse.json<ApiResult<typeof action>>({ ok: true, data: action });
}
