import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import type { BindingSpec, Filter, Sort } from '@/types/binding';
import type { DataType } from '@/types/entity';
import type { Entity, Field } from '@prisma/client';

export type ResolvedEntity = Entity & { fields: Field[] };

/**
 * 조회 결과의 컬럼 설명. `implicit`은 관리자가 고른 필드가 아니라 엔진이 끼워 넣은 컬럼(모든
 * 테이블의 `id`)을 뜻한다 — 차트/표는 이 플래그로 "관리자가 고른 컬럼"만 골라낸다.
 *
 * WHY: 예전에는 `fieldId === null`을 그 표식으로 썼는데, group 바인딩의 값 컬럼도 개수(count)
 * 집계일 때는 대응하는 필드가 없어 fieldId가 null이었다. 그래서 차트가 값 컬럼을 "내 것이 아닌
 * 컬럼"으로 보고 버린 뒤 라벨 개수를 세어, 항목별 집계 막대가 전부 1로 그려졌다(2026-08-19 발견:
 * 운영 대시보드의 제품군별/Fail Mode별/고객사별 차트 3종). 표식을 명시 플래그로 분리한다.
 */
export type ResultColumn = {
  columnName: string;
  fieldId: string | null;
  dataType: DataType;
  implicit?: boolean;
  /**
   * 관리자가 설계에 적어 둔 표시 이름(예: 'FAR No'). 컬럼명(`far_no`)이 아니라 이 이름을 화면에
   * 쓴다 — 선택 상세·타임라인처럼 열 머리글을 따로 설정하지 않는 컴포넌트가 라벨을 스스로 만들어
   * 낼 수 있어야 하기 때문이다. 데이터 테이블처럼 머리글을 props로 받는 컴포넌트는 그대로 두면 된다.
   */
  label?: string;
};

/** 항목별 집계에서 분류 축을 날짜 버킷으로 묶는 방식. SQL 조각이 고정 문자열이라 사용자 입력이 SQL에 닿지 않는다. */
const GROUP_TRANSFORM_FORMAT: Record<'month' | 'week' | 'year', string> = {
  month: '%Y-%m',
  week: '%Y-W%W',
  year: '%Y',
};

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
    // 여러 컬럼 중 하나라도 맞으면 되는 조건(통합 검색). 각 컬럼은 설계의 fieldId로만 정해지고
    // 값은 그대로 파라미터로 묶이므로, 컬럼 수가 늘어도 주입 경로가 생기지 않는다.
    if (f.fieldIds && f.fieldIds.length > 0 && f.op !== 'in') {
      const parts: string[] = [];
      for (const fieldId of f.fieldIds) {
        const target = resolveField(entity, fieldId);
        const { sql, bind } = opToSqlFragment(target, f.op);
        parts.push(sql);
        params.push(...bind(f.value));
      }
      clauses.push(`(${parts.join(' OR ')})`);
      continue;
    }
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

function resolveSelectColumns(entity: ResolvedEntity, select: string[]): ResultColumn[] {
  const cols: ResultColumn[] = [
    { columnName: 'id', fieldId: null, dataType: 'TEXT', implicit: true, label: 'id' },
  ];
  for (const fieldId of select) {
    const field = resolveField(entity, fieldId);
    cols.push({
      columnName: field.columnName,
      fieldId: field.id,
      dataType: field.dataType as DataType,
      label: field.name,
    });
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
 *
 * `groupTransform`을 주면 분류 축을 날짜 버킷(월·주·연)으로 묶는다 — 추이 차트를 미리 집계해 둔
 * 별도 테이블이 아니라 원본 테이블에서 바로 파생시키기 위한 것이다. 그래야 조회 기간을 바꿀 때
 * 추이도 같이 따라온다(미리 집계한 표는 만들어 둔 구간만 갖고 있어 기간 선택에 반응하지 못한다).
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
  const transform = binding.groupTransform ?? 'none';
  // strftime 서식 문자열은 위 상수 표에서만 나온다(열거형 → 고정 문자열). 컬럼명은 quoteIdent를
  // 거치므로, 이 식에도 사용자 입력이 문자열로 끼어들 자리가 없다.
  const groupExpr =
    transform === 'none'
      ? quoteIdent(groupField.columnName)
      : `strftime('${GROUP_TRANSFORM_FORMAT[transform]}', ${quoteIdent(groupField.columnName)})`;

  let valueExpr = 'COUNT(*)';
  if (binding.fn !== 'count') {
    if (!binding.valueFieldId) throw new Error(`${binding.fn} 집계는 값 필드가 필요합니다`);
    const valueField = resolveField(entity, binding.valueFieldId);
    valueExpr = `${binding.fn.toUpperCase()}(${quoteIdent(valueField.columnName)})`;
  }
  // 정렬 기준은 열거형이라 값이 고정돼 있다(사용자 입력이 SQL에 직접 들어가지 않는다).
  const orderSql = binding.orderBy === 'label' ? `ORDER BY "label" ASC` : 'ORDER BY "value" DESC';
  const inner = `SELECT ${groupExpr} AS "label", ${valueExpr} AS "value" FROM ${table} ${whereSql} GROUP BY ${groupExpr}`;

  // 시계열(날짜 버킷 + 시간순)에서 상한에 걸리면 **오래된 쪽이 아니라 최근 쪽**을 남긴다.
  // 그냥 `ORDER BY label ASC LIMIT n`으로 자르면 기간이 넓을 때 가장 오래된 n개만 그려져
  // "최근 추이"를 보러 온 화면이 과거만 보여준다.
  const sql =
    transform !== 'none' && binding.orderBy === 'label'
      ? `SELECT "label", "value" FROM (${inner} ORDER BY "label" DESC LIMIT ?) ORDER BY "label" ASC`
      : `${inner} ${orderSql} LIMIT ?`;

  const rows = db.prepare(sql).all(...params, binding.limit) as { label: unknown; value: number }[];

  return {
    rows: rows.map((r) => ({ label: r.label ?? '(없음)', value: r.value })),
    total: rows.length,
    columns: [
      { columnName: 'label', fieldId: binding.groupFieldId, dataType: 'TEXT' as DataType },
      { columnName: 'value', fieldId: binding.valueFieldId ?? null, dataType: 'REAL' as DataType },
    ] satisfies ResultColumn[],
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
