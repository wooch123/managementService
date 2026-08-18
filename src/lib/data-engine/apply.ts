import 'server-only';
import { getAppDb } from '@/lib/db/app-db';
import { getRowCount, tableExists } from '@/lib/data-engine/introspect';
import {
  createEntityTable,
  renameTable,
  dropTable,
  addColumn,
  renameColumn,
  dropColumn,
  rewriteTableForTypeChange,
  createUniqueIndexIfNeeded,
  dropUniqueIndex,
  type FieldDdlSpec,
} from '@/lib/data-engine/ddl';
import type { DataType } from '@/types/entity';

export type ApplyResult = { ok: true } | { ok: false; blocked: true; reason: string };

/**
 * P4는 엔티티/필드 CRUD 시 app.db DDL을 즉시 적용하는 모델을 택했다(사용자 승인,
 * PROGRESS.md P4 참고). §8.2의 "실제 DDL은 배포 시에만 실행된다"는 문구는 P8에서
 * 이 즉시적용 경로를 형식을 갖춘 리비전/배포 게이트로 교체하며 대체된다.
 */
export function applyEntityCreate(tableName: string, fields: FieldDdlSpec[]): void {
  const db = getAppDb();
  createEntityTable(db, tableName, fields);
}

export function applyEntityRename(oldTableName: string, newTableName: string): void {
  const db = getAppDb();
  if (tableExists(db, oldTableName)) renameTable(db, oldTableName, newTableName);
}

export function applyEntityDelete(tableName: string): void {
  const db = getAppDb();
  if (tableExists(db, tableName)) dropTable(db, tableName);
}

export function applyFieldAdd(tableName: string, field: FieldDdlSpec): ApplyResult {
  const db = getAppDb();
  const rowCount = tableExists(db, tableName) ? getRowCount(db, tableName) : 0;
  if (field.isRequired && !field.defaultVal && rowCount > 0) {
    return { ok: false, blocked: true, reason: '필수 필드인데 기본값이 없고 기존 행이 있어 안전하게 추가할 수 없습니다' };
  }
  addColumn(db, tableName, field);
  return { ok: true };
}

export function applyFieldRename(tableName: string, oldColumnName: string, newColumnName: string): void {
  const db = getAppDb();
  renameColumn(db, tableName, oldColumnName, newColumnName);
}

export function applyFieldTypeChange(tableName: string, columnName: string, newDataType: DataType): void {
  const db = getAppDb();
  rewriteTableForTypeChange(db, tableName, columnName, newDataType);
}

export function applyFieldDelete(tableName: string, columnName: string): void {
  const db = getAppDb();
  dropColumn(db, tableName, columnName);
}

export function applyUniqueToggle(tableName: string, field: FieldDdlSpec, enable: boolean): void {
  const db = getAppDb();
  if (enable) createUniqueIndexIfNeeded(db, tableName, field);
  else dropUniqueIndex(db, tableName, field.columnName);
}
