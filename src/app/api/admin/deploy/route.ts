import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/auth/require-session';
import { publish } from '@/lib/deploy/publish';
import type { ApiResult } from '@/types/auth';

const deployRequestSchema = z.object({
  note: z.string().optional(),
  acceptDestructive: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = deployRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const result = await publish({
    note: parsed.data.note,
    acceptDestructiveIds: parsed.data.acceptDestructive,
    publishedBy: auth.session.username ?? 'admin',
  });

  if (!result.ok) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'DEPLOY_FAILED', message: result.message, details: { step: result.step, issues: result.issues } } },
      { status: 422 }
    );
  }

  return NextResponse.json<ApiResult<typeof result>>({ ok: true, data: result });
}
