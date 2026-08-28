import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { recordVisit, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from '@/lib/stats/visits';
import type { ApiResult } from '@/types/auth';

/**
 * 방문 기록 — 운영 화면이 열릴 때 브라우저가 한 번 부른다(§접속자 통계).
 *
 * 화면 이름을 클라이언트가 보내지 않는다. slug만 받고 **배포된 스펙에서 제목을 찾아** 적는다 —
 * 보내온 문자열을 그대로 저장하면 아무 이름이나 통계에 끼워 넣을 수 있기 때문이다. 스펙에 없는
 * slug는 조용히 무시한다(404를 내면 지워진 화면을 열어 둔 탭이 계속 오류를 낸다).
 *
 * 브라우저 구분용 열쇠는 **서버가** 만들어 httpOnly 쿠키로 준다. 스크립트가 읽거나 바꿀 수 없고,
 * 개인을 가리키는 정보가 들어가지 않는다(무작위 UUID 하나).
 */
const bodySchema = z.object({ slug: z.string().trim().min(1).max(80) });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const spec = await getActiveSpec();
  const page = spec?.pages.find((p) => p.slug === parsed.data.slug);

  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existing && existing.length <= 64 ? existing : randomUUID();

  if (page) {
    try {
      await recordVisit({ slug: page.slug, title: page.title, visitorId });
    } catch {
      // 통계 기록이 실패해도 화면은 아무 일 없이 계속 보여야 한다 — 조용히 넘어간다.
    }
  }

  const response = NextResponse.json<ApiResult<{ recorded: boolean }>>({ ok: true, data: { recorded: Boolean(page) } });
  if (!existing) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}
