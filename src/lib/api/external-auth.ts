import 'server-only';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';

/**
 * 바깥 창구의 문지기.
 *
 * 토큰(`EXTERNAL_API_TOKEN`, 없으면 `FAR_API_TOKEN`)이 맞거나 관리자 세션이면 통과한다.
 * `/api/far/analysis`가 쓰던 규칙 그대로다 — 창구가 늘었다고 들어오는 방법이 달라질 이유가 없다.
 *
 * **토큰을 설정하지 않은 환경에서는 관리자 세션으로만 쓸 수 있다.** 토큰이 없다고 문을 열어 두면,
 * 설정을 깜빡한 것과 "누구나 써도 된다"가 구별되지 않는다 — 업무 데이터를 아무나 고칠 수 있게
 * 되는 쪽으로 기울면 안 된다.
 */
export async function authorizeExternal(request: NextRequest): Promise<boolean> {
  const token = process.env.EXTERNAL_API_TOKEN || process.env.FAR_API_TOKEN;
  if (token) {
    const header = request.headers.get('authorization') ?? '';
    // 길이가 다르면 바로 갈리지만, 같은 길이일 때 앞에서부터 한 글자씩 새어 나가지 않게 한다.
    if (header.startsWith('Bearer ') && timingSafeEqual(header.slice(7), token)) return true;
  }
  const session = await getSession();
  return Boolean(session.isLoggedIn);
}

/** 길이가 같은 두 글자열을 **끝까지** 견준다 — 몇 글자가 맞았는지가 걸린 시간으로 새지 않게. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
