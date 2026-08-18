import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { requireAdminSession } from '@/lib/auth/require-session';
import { computeSchemaDiff, type EntityDraft } from '@/lib/data-engine/diff';
import type { DataType } from '@/types/entity';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const entities = await prisma.entity.findMany({ include: { fields: true } });
  const drafts: EntityDraft[] = entities.map((e) => ({
    tableName: e.tableName,
    fields: e.fields.map((f) => ({
      columnName: f.columnName,
      dataType: f.dataType as DataType,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      defaultVal: f.defaultVal,
    })),
  }));

  const db = getAppDb();
  const changes = computeSchemaDiff(db, drafts);

  return NextResponse.json<ApiResult<typeof changes>>({ ok: true, data: changes });
}
