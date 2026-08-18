import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/require-session';
import { getPageNodes } from '@/lib/db/nodes';
import type { ApiResult } from '@/types/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const nodes = await getPageNodes(id);
  return NextResponse.json<ApiResult<typeof nodes>>({ ok: true, data: nodes });
}
