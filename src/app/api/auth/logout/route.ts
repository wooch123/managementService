import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import type { ApiResult } from '@/types/auth';

export async function POST() {
  const session = await getSession();
  session.destroy();

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
