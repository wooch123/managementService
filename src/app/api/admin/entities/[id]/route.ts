import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { requireAdminSession } from '@/lib/auth/require-session';
import { resolveUniqueTableName } from '@/lib/db/entities';
import { applyEntityRename, applyEntityDelete } from '@/lib/data-engine/apply';
import { tableExists, getRowCount } from '@/lib/data-engine/introspect';
import { deleteGraphArtifactsFor } from '@/lib/db/graph';
import { entityUpdateSchema } from '@/types/entity';
import type { ApiResult } from '@/types/auth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.entity.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '엔티티를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = entityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.name && data.name !== existing.name) {
    const taken = await prisma.entity.findUnique({ where: { name: data.name } });
    if (taken && taken.id !== id) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NAME_TAKEN', message: '이미 사용 중인 이름입니다.' } },
        { status: 409 }
      );
    }
  }

  let newTableName = existing.tableName;
  if (data.tableName && data.tableName !== existing.tableName) {
    newTableName = await resolveUniqueTableName(data.tableName, id);
    try {
      applyEntityRename(existing.tableName, newTableName);
    } catch (err) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
        { status: 500 }
      );
    }
  }

  const entity = await prisma.entity.update({
    where: { id },
    data: { name: data.name, tableName: newTableName, description: data.description, order: data.order },
  });

  return NextResponse.json<ApiResult<typeof entity>>({ ok: true, data: entity });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const entity = await prisma.entity.findUnique({ where: { id } });
  if (!entity) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '엔티티를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const referencing = await prisma.field.findMany({ where: { refEntityId: id }, include: { entity: true } });
  if (referencing.length > 0) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'REFERENCED',
          message: `다른 엔티티가 이 엔티티를 참조하고 있어 삭제할 수 없습니다: ${referencing.map((f) => `${f.entity.name}.${f.name}`).join(', ')}`,
        },
      },
      { status: 409 }
    );
  }

  const db = getAppDb();
  const rowCount = tableExists(db, entity.tableName) ? getRowCount(db, entity.tableName) : 0;
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
  if (!confirmed) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'CONFIRM_REQUIRED',
          message: `이 엔티티를 삭제하면 데이터 ${rowCount}행이 함께 삭제됩니다. 확인이 필요합니다.`,
          details: { rowCount },
        },
      },
      { status: 409 }
    );
  }

  await deleteGraphArtifactsFor('ENTITY', id);
  await prisma.entity.delete({ where: { id } });
  try {
    applyEntityDelete(entity.tableName);
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
