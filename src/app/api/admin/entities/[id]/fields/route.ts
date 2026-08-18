import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { resolveUniqueColumnName, nextFieldOrder } from '@/lib/db/entities';
import { toSnakeCase } from '@/lib/data-engine/identifiers';
import { applyFieldAdd } from '@/lib/data-engine/apply';
import { toFieldDdlSpec } from '@/lib/data-engine/ddl';
import { fieldCreateSchema } from '@/types/entity';
import type { ApiResult } from '@/types/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const fields = await prisma.field.findMany({ where: { entityId: id }, orderBy: { order: 'asc' } });
  return NextResponse.json<ApiResult<typeof fields>>({ ok: true, data: fields });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await request.json().catch(() => null);
  const parsed = fieldCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const data = parsed.data;
  if (data.dataType === 'REF' && data.refEntityId) {
    const target = await prisma.entity.findUnique({ where: { id: data.refEntityId } });
    if (!target) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'REF_TARGET_NOT_FOUND', message: '참조 대상 엔티티를 찾을 수 없습니다.' } },
        { status: 400 }
      );
    }
  }

  const baseColumnName = data.columnName ?? toSnakeCase(data.name);
  const columnName = await resolveUniqueColumnName(id, baseColumnName);
  const order = await nextFieldOrder(id);

  const field = await prisma.field.create({
    data: {
      entityId: id,
      name: data.name,
      columnName,
      dataType: data.dataType,
      isRequired: data.isRequired,
      isUnique: data.isUnique,
      isPrimary: data.isPrimary,
      defaultVal: data.defaultVal ?? null,
      enumValues: data.enumValues ? JSON.stringify(data.enumValues) : null,
      refEntityId: data.dataType === 'REF' ? (data.refEntityId ?? null) : null,
      order,
    },
  });

  const result = applyFieldAdd(entity.tableName, toFieldDdlSpec(field));
  if (!result.ok) {
    await prisma.field.delete({ where: { id: field.id } });
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'BLOCKED', message: result.reason } },
      { status: 409 }
    );
  }

  return NextResponse.json<ApiResult<typeof field>>({ ok: true, data: field });
}
