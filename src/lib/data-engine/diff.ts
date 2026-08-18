import 'server-only';
import type Database from 'better-sqlite3';
import type { DataType } from '@/types/entity';
import { sqlTypeFor } from '@/lib/data-engine/ddl';
import { tableExists, listUserTables, getTableColumns, getRowCount, getUniqueIndexedColumns } from '@/lib/data-engine/introspect';

export type FieldDraft = {
  columnName: string;
  dataType: DataType;
  isRequired: boolean;
  isUnique: boolean;
  defaultVal?: string | null;
};
export type EntityDraft = { tableName: string; fields: FieldDraft[] };

export type ChangeRisk = 'safe' | 'blocked' | 'destructive' | 'conditional';
export type SchemaChange = {
  kind: 'entity_add' | 'field_add' | 'field_type_change' | 'field_delete' | 'entity_delete' | 'index_add';
  risk: ChangeRisk;
  tableName: string;
  columnName?: string;
  reason?: string;
  affectedRows?: number;
};

const IMPLICIT_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

function hasDuplicateValues(db: Database.Database, tableName: string, columnName: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (SELECT "${columnName}" FROM "${tableName}" WHERE "${columnName}" IS NOT NULL GROUP BY "${columnName}" HAVING COUNT(*) > 1)`
    )
    .get() as { c: number };
  return row.c > 0;
}

/**
 * §6.5 표의 분류를 산출한다. 메타(Entity/Field 드래프트) vs app.db 실제 스키마를 비교한다.
 * P4는 엔티티/필드 CRUD 시 DDL을 즉시 적용하는 모델을 택했으므로(PROGRESS.md P4 참고),
 * 평상시 이 함수의 결과는 대체로 비어 있다 — drift 감지기이자 P8 배포 파이프라인이 재사용할
 * 분류 로직의 기반으로 존재한다. rename은 구조적 diff로 감지하지 않는다(rename 전용 API가
 * DDL을 즉시 적용하므로 diff 시점에는 이미 반영되어 있다).
 */
export function computeSchemaDiff(db: Database.Database, entities: EntityDraft[]): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const entity of entities) {
    if (!tableExists(db, entity.tableName)) {
      changes.push({ kind: 'entity_add', risk: 'safe', tableName: entity.tableName });
      continue;
    }

    const existingCols = new Map(getTableColumns(db, entity.tableName).map((c) => [c.name, c]));
    const rowCount = getRowCount(db, entity.tableName);
    const uniqueCols = getUniqueIndexedColumns(db, entity.tableName);
    const draftColNames = new Set(entity.fields.map((f) => f.columnName));

    for (const field of entity.fields) {
      const existing = existingCols.get(field.columnName);
      if (!existing) {
        const blocked = field.isRequired && !field.defaultVal && rowCount > 0;
        changes.push({
          kind: 'field_add',
          risk: blocked ? 'blocked' : 'safe',
          tableName: entity.tableName,
          columnName: field.columnName,
          reason: blocked ? '필수 필드인데 기본값이 없고 기존 행이 있습니다' : undefined,
        });
        continue;
      }

      const expectedType = sqlTypeFor(field.dataType);
      if (existing.type.toUpperCase() !== expectedType) {
        changes.push({
          kind: 'field_type_change',
          risk: 'destructive',
          tableName: entity.tableName,
          columnName: field.columnName,
          affectedRows: rowCount,
        });
      }

      if (field.isUnique && !uniqueCols.has(field.columnName)) {
        const dup = hasDuplicateValues(db, entity.tableName, field.columnName);
        changes.push({
          kind: 'index_add',
          risk: dup ? 'blocked' : 'safe',
          tableName: entity.tableName,
          columnName: field.columnName,
          reason: dup ? '중복된 값이 있어 UNIQUE 인덱스를 생성할 수 없습니다' : undefined,
        });
      }
    }

    for (const col of existingCols.keys()) {
      if (IMPLICIT_COLUMNS.has(col) || draftColNames.has(col)) continue;
      changes.push({
        kind: 'field_delete',
        risk: 'destructive',
        tableName: entity.tableName,
        columnName: col,
        affectedRows: rowCount,
      });
    }
  }

  const draftTableNames = new Set(entities.map((e) => e.tableName));
  for (const table of listUserTables(db)) {
    if (!draftTableNames.has(table)) {
      changes.push({ kind: 'entity_delete', risk: 'destructive', tableName: table, affectedRows: getRowCount(db, table) });
    }
  }

  return changes;
}
