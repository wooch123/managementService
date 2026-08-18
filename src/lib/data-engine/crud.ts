import 'server-only';
import { nanoid } from 'nanoid';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import { resolveEntity, buildWhereClause, buildOrderClause, type ResolvedEntity } from '@/lib/data-engine/query';
import type { Filter, Sort } from '@/types/binding';
import type { DataType } from '@/types/entity';
import type { Field } from '@prisma/client';

/** §6.2 저장 형태로 변환 (JS 값 → SQLite에 바인딩할 값) */
export function toStorageValue(dataType: DataType, value: unknown): unknown {
  if (value == null) return null;
  switch (dataType) {
    case 'TEXT':
    case 'DATE':
      return String(value);
    case 'DATETIME':
      return new Date(value as string).toISOString();
    case 'INTEGER': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error(`정수가 아닙니다: ${value}`);
      return n;
    }
    case 'REAL': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`숫자가 아닙니다: ${value}`);
      return n;
    }
    case 'BOOLEAN':
      return value ? 1 : 0;
    case 'JSON':
      return JSON.stringify(value);
    case 'ENUM':
      return String(value);
    case 'REF':
      return String(value);
  }
}

/** §6.2 저장 형태 → JS 값 (조회 시 역변환) */
export function fromStorageValue(dataType: DataType, raw: unknown): unknown {
  if (raw == null) return null;
  switch (dataType) {
    case 'TEXT':
    case 'DATE':
    case 'DATETIME':
    case 'ENUM':
    case 'REF':
      return String(raw);
    case 'INTEGER':
      return Number(raw);
    case 'REAL':
      return Number(raw);
    case 'BOOLEAN':
      return Number(raw) === 1;
    case 'JSON':
      return JSON.parse(String(raw));
  }
}

function rowToJs(entity: ResolvedEntity, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const field of entity.fields) {
    if (field.columnName in row) {
      out[field.columnName] = fromStorageValue(field.dataType as DataType, row[field.columnName]);
    }
  }
  return out;
}

export type RowListOptions = { page?: number; pageSize?: number; sort?: Sort[]; filters?: Filter[] };

export async function listEntityRows(entityId: string, opts: RowListOptions = {}) {
  const entity = await resolveEntity(entityId);
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 20, 200);
  const filters = opts.filters ?? [];
  const sort = opts.sort ?? [];

  const db = getAppDb();
  const table = quoteIdent(entity.tableName);
  const { sql: whereSql, params } = buildWhereClause(entity, filters);
  const orderSql = buildOrderClause(entity, sort) || 'ORDER BY "created_at" DESC';
  const offset = Math.max(0, (page - 1) * pageSize);

  const rows = db
    .prepare(`SELECT * FROM ${table} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as Record<string, unknown>[];
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${whereSql}`).get(...params) as { c: number };

  return { rows: rows.map((r) => rowToJs(entity, r)), total: totalRow.c, page, pageSize };
}

export async function getEntityRow(entityId: string, rowId: string) {
  const entity = await resolveEntity(entityId);
  const db = getAppDb();
  const row = db.prepare(`SELECT * FROM ${quoteIdent(entity.tableName)} WHERE "id" = ?`).get(rowId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToJs(entity, row) : null;
}

function validateAndMap(entity: ResolvedEntity, values: Record<string, unknown>, forCreate: boolean): { field: Field; value: unknown }[] {
  const known = new Map(entity.fields.map((f) => [f.columnName, f]));
  const out: { field: Field; value: unknown }[] = [];

  for (const [key, value] of Object.entries(values)) {
    const field = known.get(key);
    if (!field) throw new Error(`알 수 없는 필드입니다: ${key}`);
    out.push({ field, value: toStorageValue(field.dataType as DataType, value) });
  }

  if (forCreate) {
    const provided = new Set(Object.keys(values));
    for (const field of entity.fields) {
      if (field.isRequired && !provided.has(field.columnName) && field.defaultVal == null) {
        throw new Error(`필수 필드가 누락되었습니다: ${field.name}`);
      }
    }
  }

  return out;
}

export async function createEntityRow(entityId: string, values: Record<string, unknown>) {
  const entity = await resolveEntity(entityId);
  const mapped = validateAndMap(entity, values, true);
  const db = getAppDb();

  const id = nanoid();
  const now = new Date().toISOString();
  const columns = ['id', 'created_at', 'updated_at', ...mapped.map((m) => m.field.columnName)];
  const placeholders = columns.map(() => '?').join(', ');
  const params = [id, now, now, ...mapped.map((m) => m.value)];

  db.prepare(
    `INSERT INTO ${quoteIdent(entity.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders})`
  ).run(...params);

  return getEntityRow(entityId, id);
}

export async function updateEntityRow(entityId: string, rowId: string, values: Record<string, unknown>) {
  const entity = await resolveEntity(entityId);
  const mapped = validateAndMap(entity, values, false);
  if (mapped.length === 0) return getEntityRow(entityId, rowId);

  const db = getAppDb();
  const now = new Date().toISOString();
  const setClauses = [...mapped.map((m) => `${quoteIdent(m.field.columnName)} = ?`), `"updated_at" = ?`];
  const params = [...mapped.map((m) => m.value), now, rowId];

  db.prepare(`UPDATE ${quoteIdent(entity.tableName)} SET ${setClauses.join(', ')} WHERE "id" = ?`).run(...params);

  return getEntityRow(entityId, rowId);
}

export async function deleteEntityRow(entityId: string, rowId: string): Promise<void> {
  const entity = await resolveEntity(entityId);
  const db = getAppDb();
  db.prepare(`DELETE FROM ${quoteIdent(entity.tableName)} WHERE "id" = ?`).run(rowId);
}
