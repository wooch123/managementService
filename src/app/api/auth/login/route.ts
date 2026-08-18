import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/session';
import { checkLockout, recordFailure, resetAttempts } from '@/lib/auth/rate-limit';
import { loginSchema } from '@/types/auth';
import type { ApiResult } from '@/types/auth';

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const lockout = checkLockout(ip);
  if (lockout.locked) {
    const minutes = Math.ceil(lockout.remainingMs / 60000);
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'LOCKED_OUT',
          message: `로그인 시도가 너무 많습니다. 약 ${minutes}분 후 다시 시도하세요.`,
        },
      },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;
  const user = await prisma.adminUser.findUnique({ where: { username } });
  const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordValid) {
    recordFailure(ip);
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '아이디 또는 비밀번호가 올바르지 않습니다.',
        },
      },
      { status: 401 }
    );
  }

  resetAttempts(ip);

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json<ApiResult<{ username: string }>>({
    ok: true,
    data: { username: user.username },
  });
}
