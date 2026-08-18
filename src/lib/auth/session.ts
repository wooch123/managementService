import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

export type SessionData = {
  userId?: string;
  username?: string;
  isLoggedIn: boolean;
};

const defaultSession: SessionData = { isLoggedIn: false };

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET 환경변수가 없거나 32자 미만입니다. .env.local을 확인하세요.'
    );
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  password: requireSecret(),
  cookieName: 'webapp_v1_session',
  ttl: 60 * 60 * 8, // 8시간, 슬라이딩 갱신 (iron-session이 매 요청마다 만료시각 갱신)
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (session.isLoggedIn === undefined) {
    Object.assign(session, defaultSession);
  }
  return session;
}
