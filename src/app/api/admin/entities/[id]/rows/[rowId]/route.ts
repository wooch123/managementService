import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/require-session';
import { updateEntityRow, deleteEntityRow } from '@/lib/data-engine/crud';
import type { ApiResult } from '@/types/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id, rowId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  try {
    const row = await updateEntityRow(id, rowId, body as Record<string, unknown>);
    return NextResponse.json<ApiResult<typeof row>>({ ok: true, data: row });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'UPDATE_FAILED', message: err instanceof Error ? err.message : '수정에 실패했습니다.' } },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id, rowId } = await params;
  try {
    await deleteEntityRow(id, rowId);
    return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'DELETE_FAILED', message: err instanceof Error ? err.message : '삭제에 실패했습니다.' } },
      { status: 400 }
    );
  }
}
