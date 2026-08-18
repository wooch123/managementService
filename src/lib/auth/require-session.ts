import 'server-only';
import { NextResponse } from 'next/server';
import { getSession, type SessionData } from '@/lib/auth/session';
import type { IronSession } from 'iron-session';

/**
 * 모든 /api/admin/* 라우트 핸들러 내부에서 호출한다.
 * CLAUDE.md §7.3 — 미들웨어만 신뢰하지 않고 라우트에서 세션을 재확인한다.
 */
export async function requireAdminSession(): Promise<
  | { ok: true; session: IronSession<SessionData> }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } },
        { status: 401 }
      ),
    };
  }
  return { ok: true, session };
}
