import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { tableExists, getRowCount } from '@/lib/data-engine/introspect';

export async function getEntityList() {
  const entities = await prisma.entity.findMany({ include: { fields: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } });
  const db = getAppDb();
  return entities.map((e) => ({
    ...e,
    fieldCount: e.fields.length,
    rowCount: tableExists(db, e.tableName) ? getRowCount(db, e.tableName) : 0,
  }));
}
export type EntityListItem = Awaited<ReturnType<typeof getEntityList>>[number];

export async function resolveUniqueTableName(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.entity.findUnique({ where: { tableName: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

export async function resolveUniqueColumnName(entityId: string, base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.field.findFirst({ where: { entityId, columnName: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

export async function nextFieldOrder(entityId: string): Promise<number> {
  const last = await prisma.field.findFirst({ where: { entityId }, orderBy: { order: 'desc' } });
  return (last?.order ?? -1) + 1;
}

export async function nextEntityOrder(): Promise<number> {
  const last = await prisma.entity.findFirst({ orderBy: { order: 'desc' } });
  return (last?.order ?? -1) + 1;
}
