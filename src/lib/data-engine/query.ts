import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import type { BindingSpec, Filter, Sort } from '@/types/binding';
import type { DataType } from '@/types/entity';
import type { Entity, Field } from '@prisma/client';

export type ResolvedEntity = Entity & { fields: Field[] };

/**
 * §6.4 "쿼리 빌더 규칙": entityId/fieldId는 반드시 활성 스펙(meta.db)에서 조회해 실제
 * 테이블명/컬럼명으로 치환한다. 치환에 실패하면 쿼리를 만들지 않고 에러를 던진다.
 * 클라이언트가 보낸 테이블/컬럼 이름 문자열은 이 함수들을 거치지 않고는 SQL에 닿지 않는다.
 */
export async function resolveEntity(entityId: string): Promise<ResolvedEntity> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId }, include: { fields: true } });
  if (!entity) throw new Error(`엔티티를 찾을 수 없습니다: ${entityId}`);
  return entity;
}

export function resolveField(entity: ResolvedEntity, fieldId: string): Field {
  const field = entity.fields.find((f) => f.id === fieldId);
  if (!field) throw new Error(`필드를 찾을 수 없습니다: ${fieldId}`);
  return field;
}

function opToSqlFragment(field: Field, op: Filter['op']): { sql: string; bind: (value: unknown) => unknown[] } {
  const col = quoteIdent(field.columnName);
  switch (op) {
    case 'eq':
      return { sql: `${col} = ?`, bind: (v) => [v] };
    case 'ne':
      return { sql: `${col} != ?`, bind: (v) => [v] };
    case 'gt':
      return { sql: `${col} > ?`, bind: (v) => [v] };
    case 'gte':
      return { sql: `${col} >= ?`, bind: (v) => [v] };
    case 'lt':
      return { sql: `${col} < ?`, bind: (v) => [v] };
    case 'lte':
      return { sql: `${col} <= ?`, bind: (v) => [v] };
    case 'contains':
      return { sql: `${col} LIKE ? ESCAPE '\\'`, bind: (v) => [`%${String(v).replace(/[\\%_]/g, '\\$&')}%`] };
    case 'isNull':
      return { sql: `${col} IS NULL`, bind: () => [] };
    case 'in':
      return { sql: '', bind: () => [] }; // 아래에서 개별 처리 (값 개수만큼 placeholder 필요)
  }
}

export function buildWhereClause(entity: ResolvedEntity, filters: Filter[]): { sql: string; params: unknown[] } {
  if (filters.length === 0) return { sql: '', params: [] };
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const f of filters) {
    const field = resolveField(entity, f.fieldId);
    if (f.op === 'in') {
      const values = Array.isArray(f.value) ? f.value : [];
      if (values.length === 0) {
        clauses.push('0 = 1');
        continue;
      }
      clauses.push(`${quoteIdent(field.columnName)} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
      continue;
    }
    const { sql, bind } = opToSqlFragment(field, f.op);
    clauses.push(sql);
    params.push(...bind(f.value));
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function buildOrderClause(entity: ResolvedEntity, sort: Sort[]): string {
  if (sort.length === 0) return '';
  const parts = sort.map((s) => {
    const field = resolveField(entity, s.fieldId);
    const dir = s.dir === 'desc' ? 'DESC' : 'ASC';
    return `${quoteIdent(field.columnName)} ${dir}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

function resolveSelectColumns(entity: ResolvedEntity, select: string[]): { columnName: string; fieldId: string | null; dataType: DataType }[] {
  const cols: { columnName: string; fieldId: string | null; dataType: DataType }[] = [
    { columnName: 'id', fieldId: null, dataType: 'TEXT' },
  ];
  for (const fieldId of select) {
    const field = resolveField(entity, fieldId);
    cols.push({ columnName: field.columnName, fieldId: field.id, dataType: field.dataType as DataType });
  }
  return cols;
}

/**
 * entityOverride: 운영 런타임(§12, lib/runtime/binding-query.ts)이 넘긴다 — 관리자 화면은
 * 드래프트(prisma.entity)를 조회하지만, 운영 모드는 §6.4대로 "활성 스펙"(PublishedSpec)에서
 * 조회해야 한다(재배포 전까지는 드래프트가 앞서갈 수 있어 그대로 쓰면 스키마가 어긋난다).
 * SQL 빌딩 로직 자체는 ResolvedEntity 모양(tableName + fields[].columnName/dataType)만
 * 있으면 되므로 이 함수들을 그대로 재사용한다.
 */
export async function runListQuery(binding: Extract<BindingSpec, { mode: 'list' }>, page = 1, entityOverride?: ResolvedEntity) {
  const entity = entityOverride ?? (await resolveEntity(binding.entityId));
  const cols = resolveSelectColumns(entity, binding.select);
  const { sql: whereSql, params: whereParams } = buildWhereClause(entity, binding.filters);
  const orderSql = buildOrderClause(entity, binding.sort);
  const db = getAppDb();

  const selectList = cols.map((c) => quoteIdent(c.columnName)).join(', ');
  const table = quoteIdent(entity.tableName);
  const offset = Math.max(0, (page - 1) * binding.pageSize);

  const rows = db
    .prepare(`SELECT ${selectList} FROM ${table} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...whereParams, binding.pageSize, offset) as Record<string, unknown>[];

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${whereSql}`).get(...whereParams) as { c: number };

  return { rows, total: totalRow.c, columns: cols };
}

export async function runAggregateQuery(binding: Extract<BindingSpec, { mode: 'aggregate' }>, entityOverride?: ResolvedEntity): Promise<number> {
  const entity = entityOverride ?? (await resolveEntity(binding.entityId));
  const { sql: whereSql, params } = buildWhereClause(entity, binding.filters);
  const db = getAppDb();
  const table = quoteIdent(entity.tableName);

  if (binding.fn === 'count') {
    const row = db.prepare(`SELECT COUNT(*) AS v FROM ${table} ${whereSql}`).get(...params) as { v: number };
    return row.v;
  }
  if (!binding.fieldId) throw new Error(`${binding.fn} 집계는 fieldId가 필요합니다`);
  const field = resolveField(entity, binding.fieldId);
  const fn = binding.fn.toUpperCase();
  const row = db.prepare(`SELECT ${fn}(${quoteIdent(field.columnName)}) AS v FROM ${table} ${whereSql}`).get(...params) as {
    v: number | null;
  };
  return row.v ?? 0;
}

/**
 * 항목별 집계(GROUP BY) — 차트가 쓰는 조회.
 *
 * 결과를 list 조회와 같은 봉투({ rows, columns, total })로 돌려준다. 차트 컴포넌트들이 이미
 * "첫 텍스트 컬럼 = 라벨, 첫 숫자 컬럼 = 값"으로 해석하므로, 컴포넌트를 고치지 않고도 그대로 그려진다.
 */
export async function runGroupQuery(
  binding: Extract<BindingSpec, { mode: 'group' }>,
  entityOverride?: ResolvedEntity
) {
  const entity = entityOverride ?? (await resolveEntity(binding.entityId));
  const groupField = resolveField(entity, binding.groupFieldId);
  const { sql: whereSql, params } = buildWhereClause(entity, binding.filters);
  const db = getAppDb();
  const table = quoteIdent(entity.tableName);
  const groupCol = quoteIdent(groupField.columnName);

  let valueExpr = 'COUNT(*)';
  if (binding.fn !== 'count') {
    if (!binding.valueFieldId) throw new Error(`${binding.fn} 집계는 값 필드가 필요합니다`);
    const valueField = resolveField(entity, binding.valueFieldId);
    valueExpr = `${binding.fn.toUpperCase()}(${quoteIdent(valueField.columnName)})`;
  }
  // 정렬 기준은 열거형이라 값이 고정돼 있다(사용자 입력이 SQL에 직접 들어가지 않는다).
  const orderSql = binding.orderBy === 'label' ? `ORDER BY ${groupCol} ASC` : 'ORDER BY "value" DESC';

  const rows = db
    .prepare(
      `SELECT ${groupCol} AS "label", ${valueExpr} AS "value" FROM ${table} ${whereSql} GROUP BY ${groupCol} ${orderSql} LIMIT ?`
    )
    .all(...params, binding.limit) as { label: unknown; value: number }[];

  return {
    rows: rows.map((r) => ({ label: r.label ?? '(없음)', value: r.value })),
    total: rows.length,
    columns: [
      { columnName: 'label', fieldId: binding.groupFieldId, dataType: 'TEXT' as DataType },
      { columnName: 'value', fieldId: binding.valueFieldId ?? null, dataType: 'REAL' as DataType },
    ],
  };
}

export async function runSingleQuery(binding: Extract<BindingSpec, { mode: 'single' }>, keyValue: string, entityOverride?: ResolvedEntity) {
  const entity = entityOverride ?? (await resolveEntity(binding.entityId));
  const cols = resolveSelectColumns(entity, binding.select);
  const db = getAppDb();
  const selectList = cols.map((c) => quoteIdent(c.columnName)).join(', ');
  const row = db
    .prepare(`SELECT ${selectList} FROM ${quoteIdent(entity.tableName)} WHERE "id" = ?`)
    .get(keyValue) as Record<string, unknown> | undefined;
  return row ?? null;
}
