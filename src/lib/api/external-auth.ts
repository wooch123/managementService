import 'server-only';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { externalSignals } from '@/lib/api/internal-network';

/**
 * 바깥 창구의 문지기.
 *
 * **사내에서 부르면 토큰이 필요 없고, 인터넷에서 부르면 토큰이 필요하다**(사용자 지정, 2026-09-01).
 * 사내 시스템이 헤더를 맞추느라 고생할 일은 없애되, 공개 주소로는 열지 않는다.
 *
 * 사내인지 아닌지 가르는 판단은 `internal-network.ts`에 있다 — cloudflared가 터널 요청을
 * 127.0.0.1로 넘기기 때문에 소켓 IP로는 가를 수 없고, 지나온 경로가 남긴 표식을 본다.
 *
 * ── 그래도 잠그고 싶을 때 ───────────────────────────────────────────────────────
 * `.env.local`에 `EXTERNAL_API_REQUIRE_TOKEN=always`를 두면 사내에서도 토큰을 받는다.
 */

export type AccessDecision = {
  allowed: boolean;
  /** 무엇으로 통과했는지 — 기록과 진단용. */
  via: 'internal' | 'token' | 'session' | 'denied';
  /** 바깥에서 온 것으로 본 근거(비어 있으면 사내로 판단). */
  signals: string[];
};

export async function decideExternalAccess(request: NextRequest): Promise<AccessDecision> {
  const signals = externalSignals(request.headers, process.env.PUBLIC_HOSTNAME);
  const alwaysToken = (process.env.EXTERNAL_API_REQUIRE_TOKEN || '').toLowerCase() === 'always';

  // 사내에서 직접 부른 요청 — 토큰 없이 통과.
  if (signals.length === 0 && !alwaysToken) {
    return { allowed: true, via: 'internal', signals };
  }

  const token = process.env.EXTERNAL_API_TOKEN || process.env.FAR_API_TOKEN;
  if (token) {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ') && timingSafeEqual(header.slice(7), token)) {
      return { allowed: true, via: 'token', signals };
    }
  }

  const session = await getSession();
  if (session.isLoggedIn) return { allowed: true, via: 'session', signals };

  return { allowed: false, via: 'denied', signals };
}

export async function authorizeExternal(request: NextRequest): Promise<boolean> {
  return (await decideExternalAccess(request)).allowed;
}

/** 길이가 같은 두 글자열을 **끝까지** 견준다 — 몇 글자가 맞았는지가 걸린 시간으로 새지 않게. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
