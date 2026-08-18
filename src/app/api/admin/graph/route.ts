import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/require-session';
import { getGraphData } from '@/lib/db/graph';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const data = await getGraphData();
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
