import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { deleteGraphArtifactsFor } from '@/lib/db/graph';
import { actionUpdateSchema } from '@/types/graph';
import type { ApiResult } from '@/types/auth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.action.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '액션을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = actionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const taken = await prisma.action.findUnique({ where: { name: parsed.data.name } });
    if (taken && taken.id !== id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NAME_TAKEN', message: '이미 사용 중인 이름입니다.' } },
        { status: 409 }
      );
    }
  }

  const { config, ...rest } = parsed.data;
  const action = await prisma.action.update({
    where: { id },
    data: { ...rest, ...(config ? { configJson: JSON.stringify(config) } : {}) },
  });
  return NextResponse.json<ApiResult<typeof action>>({ ok: true, data: action });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.action.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '액션을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  await deleteGraphArtifactsFor('ACTION', id);
  await prisma.action.delete({ where: { id } });
  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
