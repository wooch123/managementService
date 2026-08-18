import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const session = await getSession();

  return NextResponse.json<ApiResult<{ authenticated: boolean; username?: string }>>({
    ok: true,
    data: {
      authenticated: session.isLoggedIn,
      username: session.isLoggedIn ? session.username : undefined,
    },
  });
}
