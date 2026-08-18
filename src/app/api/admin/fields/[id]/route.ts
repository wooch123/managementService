import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { requireAdminSession } from '@/lib/auth/require-session';
import { resolveUniqueColumnName } from '@/lib/db/entities';
import { applyFieldRename, applyFieldTypeChange, applyFieldDelete, applyUniqueToggle } from '@/lib/data-engine/apply';
import { toFieldDdlSpec } from '@/lib/data-engine/ddl';
import { getRowCount } from '@/lib/data-engine/introspect';
import { fieldUpdateSchema, type DataType } from '@/types/entity';
import type { ApiResult } from '@/types/auth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.field.findUnique({ where: { id }, include: { entity: true } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '필드를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = fieldUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const tableName = existing.entity.tableName;

  let newColumnName = existing.columnName;
  if (data.columnName && data.columnName !== existing.columnName) {
    newColumnName = await resolveUniqueColumnName(existing.entityId, data.columnName, id);
    try {
      applyFieldRename(tableName, existing.columnName, newColumnName);
    } catch (err) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
        { status: 500 }
      );
    }
  }

  if (data.dataType && data.dataType !== existing.dataType) {
    const db = getAppDb();
    const rowCount = getRowCount(db, tableName);
    if (!data.confirmDestructive) {
      return NextResponse.json<ApiResult<never>>(
        {
          ok: false,
          error: {
            code: 'CONFIRM_REQUIRED',
            message: `타입을 변경하면 ${rowCount}개 행의 데이터가 재작성됩니다. 확인이 필요합니다.`,
            details: { rowCount },
          },
        },
        { status: 409 }
      );
    }
    try {
      applyFieldTypeChange(tableName, newColumnName, data.dataType as DataType);
    } catch (err) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'CAST_FAILED', message: err instanceof Error ? err.message : '타입 변환에 실패했습니다.' } },
        { status: 409 }
      );
    }
  }

  const mergedIsUnique = data.isUnique ?? existing.isUnique;
  const mergedIsPrimary = data.isPrimary ?? existing.isPrimary;
  const wasIndexed = existing.isUnique || existing.isPrimary;
  const willBeIndexed = mergedIsUnique || mergedIsPrimary;
  if (wasIndexed !== willBeIndexed) {
    const ddlSpec = toFieldDdlSpec({ ...existing, columnName: newColumnName, isUnique: mergedIsUnique, isPrimary: mergedIsPrimary });
    try {
      applyUniqueToggle(tableName, ddlSpec, willBeIndexed);
    } catch (err) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
        { status: 500 }
      );
    }
  }

  const field = await prisma.field.update({
    where: { id },
    data: {
      name: data.name,
      columnName: newColumnName,
      dataType: data.dataType,
      isRequired: data.isRequired,
      isUnique: data.isUnique,
      isPrimary: data.isPrimary,
      defaultVal: data.defaultVal,
      enumValues: data.enumValues ? JSON.stringify(data.enumValues) : undefined,
      refEntityId: data.refEntityId,
      order: data.order,
    },
  });

  return NextResponse.json<ApiResult<typeof field>>({ ok: true, data: field });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.field.findUnique({ where: { id }, include: { entity: true } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '필드를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const db = getAppDb();
  const rowCount = getRowCount(db, existing.entity.tableName);
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
  if (!confirmed) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'CONFIRM_REQUIRED',
          message: `이 필드를 삭제하면 ${rowCount}개 행의 값이 함께 삭제됩니다. 확인이 필요합니다.`,
          details: { rowCount },
        },
      },
      { status: 409 }
    );
  }

  await prisma.field.delete({ where: { id } });
  try {
    if (existing.isUnique || existing.isPrimary) {
      applyUniqueToggle(existing.entity.tableName, toFieldDdlSpec(existing), false);
    }
    applyFieldDelete(existing.entity.tableName, existing.columnName);
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
