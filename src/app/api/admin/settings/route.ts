import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/auth/require-session';
import { getAppSettings, saveAppSettings } from '@/lib/db/app-settings';
import type { ApiResult } from '@/types/auth';

/** 사이드바 상단에 보이는 사이트 이름/부제 — 페이지 설계가 아니라 앱 전역 설정이라 배포 없이 바로 반영된다. */
const settingsSchema = z.object({
  siteTitle: z.string().trim().min(1, '이름을 입력하세요').max(40).optional(),
  siteSubtitle: z.string().trim().max(40).optional(),
});

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const data = await getAppSettings();
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다(이름 1~40자).', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const data = await saveAppSettings(parsed.data);
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
