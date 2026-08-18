import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { resolveUniqueTableName, nextEntityOrder, getEntityList } from '@/lib/db/entities';
import { toSnakeCase } from '@/lib/data-engine/identifiers';
import { applyEntityCreate } from '@/lib/data-engine/apply';
import { entityCreateSchema } from '@/types/entity';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const data = await getEntityList();
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = entityCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const { name, description } = parsed.data;
  const existingName = await prisma.entity.findUnique({ where: { name } });
  if (existingName) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NAME_TAKEN', message: '이미 사용 중인 이름입니다.' } },
      { status: 409 }
    );
  }

  const baseTableName = parsed.data.tableName ?? toSnakeCase(name);
  const tableName = await resolveUniqueTableName(baseTableName);
  const order = await nextEntityOrder();

  const entity = await prisma.entity.create({ data: { name, tableName, description: description ?? null, order } });

  try {
    applyEntityCreate(tableName, []);
  } catch (err) {
    await prisma.entity.delete({ where: { id: entity.id } });
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'DDL_FAILED', message: err instanceof Error ? err.message : 'DDL 적용에 실패했습니다.' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResult<typeof entity>>({ ok: true, data: entity });
}
