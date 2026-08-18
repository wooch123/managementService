import 'server-only';
import type Database from 'better-sqlite3';
import type { Field } from '@prisma/client';
import type { DataType } from '@/types/entity';
import { quoteIdent } from '@/lib/data-engine/identifiers';

export type FieldDdlSpec = {
  columnName: string;
  dataType: DataType;
  isRequired: boolean;
  isUnique: boolean;
  isPrimary: boolean;
  defaultVal?: string | null;
  enumValues?: string[] | null;
};

export function toFieldDdlSpec(field: Field): FieldDdlSpec {
  return {
    columnName: field.columnName,
    dataType: field.dataType as DataType,
    isRequired: field.isRequired,
    isUnique: field.isUnique,
    isPrimary: field.isPrimary,
    defaultVal: field.defaultVal,
    enumValues: field.enumValues ? (JSON.parse(field.enumValues) as string[]) : null,
  };
}

/** §6.2 타입 매핑 — 설계 dataType → SQLite 물리 타입 */
export function sqlTypeFor(dataType: DataType): 'TEXT' | 'INTEGER' | 'REAL' {
  switch (dataType) {
    case 'INTEGER':
    case 'BOOLEAN':
      return 'INTEGER';
    case 'REAL':
      return 'REAL';
    default:
      return 'TEXT';
  }
}

function escapeStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 신뢰할 수 없는 문자열(defaultVal, enumValues)을 dataType에 맞춰 안전한 SQL 리터럴로 변환한다.
 * DDL(ADD COLUMN ... DEFAULT, CHECK)은 better-sqlite3가 파라미터 바인딩을 지원하지 않으므로,
 * 타입별로 엄격히 검증한 뒤 직접 이스케이프한 리터럴만 사용한다.
 */
export function sqlLiteral(value: string, dataType: DataType): string {
  switch (dataType) {
    case 'INTEGER': {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`정수가 아닙니다: ${value}`);
      return String(n);
    }
    case 'REAL': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`숫자가 아닙니다: ${value}`);
      return String(n);
    }
    case 'BOOLEAN': {
      if (value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
        throw new Error(`불리언 값이 아닙니다: ${value}`);
      }
      return value === 'true' || value === '1' ? '1' : '0';
    }
    default:
      return escapeStringLiteral(value);
  }
}

function columnDefFragment(field: FieldDdlSpec): string {
  const parts = [quoteIdent(field.columnName), sqlTypeFor(field.dataType)];
  if (field.isRequired || field.isPrimary) parts.push('NOT NULL');
  if (field.defaultVal != null && field.defaultVal !== '') {
    parts.push('DEFAULT', sqlLiteral(field.defaultVal, field.dataType));
  }
  if (field.dataType === 'ENUM' && field.enumValues && field.enumValues.length > 0) {
    const list = field.enumValues.map((v) => sqlLiteral(v, 'TEXT')).join(', ');
    parts.push(`CHECK (${quoteIdent(field.columnName)} IN (${list}))`);
  }
  return parts.join(' ');
}

const IMPLICIT_COLUMNS_SQL = `"id" TEXT PRIMARY KEY, "created_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL`;

export function createEntityTable(db: Database.Database, tableName: string, fields: FieldDdlSpec[]): void {
  const ident = quoteIdent(tableName);
  const cols = fields.map(columnDefFragment);
  const sql = `CREATE TABLE ${ident} (${IMPLICIT_COLUMNS_SQL}${cols.length ? ', ' + cols.join(', ') : ''})`;
  db.exec(sql);
  for (const field of fields) {
    createUniqueIndexIfNeeded(db, tableName, field);
  }
}

export function createUniqueIndexIfNeeded(db: Database.Database, tableName: string, field: FieldDdlSpec): void {
  if (!field.isUnique && !field.isPrimary) return;
  const idxName = `idx_${tableName}_${field.columnName}_uq`;
  db.exec(
    `CREATE UNIQUE INDEX ${quoteIdent(idxName)} ON ${quoteIdent(tableName)} (${quoteIdent(field.columnName)})`
  );
}

export function dropUniqueIndex(db: Database.Database, tableName: string, columnName: string): void {
  const idxName = `idx_${tableName}_${columnName}_uq`;
  db.exec(`DROP INDEX IF EXISTS ${quoteIdent(idxName)}`);
}

export function addColumn(db: Database.Database, tableName: string, field: FieldDdlSpec): void {
  db.exec(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${columnDefFragment(field)}`);
  createUniqueIndexIfNeeded(db, tableName, field);
}

export function renameColumn(db: Database.Database, tableName: string, oldName: string, newName: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(newName)}`);
}

export function renameTable(db: Database.Database, oldName: string, newName: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`);
}

export function dropColumn(db: Database.Database, tableName: string, columnName: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(columnName)}`);
}

export function dropTable(db: Database.Database, tableName: string): void {
  db.exec(`DROP TABLE ${quoteIdent(tableName)}`);
}

/** 값이 새 dataType으로 손실 없이 캐스팅 가능한지 검사 — 재작성 전 사전 차단용 */
function isCastable(value: unknown, dataType: DataType): boolean {
  if (value == null) return true;
  const str = String(value);
  switch (dataType) {
    case 'INTEGER':
      return Number.isFinite(Number(str)) && Number.isInteger(Number(str));
    case 'REAL':
      return Number.isFinite(Number(str));
    case 'BOOLEAN':
      return str === '0' || str === '1';
    case 'JSON':
      try {
        JSON.parse(str);
        return true;
      } catch {
        return false;
      }
    case 'DATE':
      return /^\d{4}-\d{2}-\d{2}$/.test(str);
    case 'DATETIME':
      return !Number.isNaN(Date.parse(str));
    default:
      return true;
  }
}

/**
 * 필드 타입 변경 — SQLite는 컬럼 타입을 직접 바꿀 수 없어 임시 테이블로 재작성한다.
 * 캐스팅 불가 행이 하나라도 있으면 아무것도 실행하지 않고 예외를 던진다(§6.5 "destructive").
 */
export function rewriteTableForTypeChange(
  db: Database.Database,
  tableName: string,
  columnName: string,
  newDataType: DataType
): void {
  const rows = db
    .prepare(`SELECT ${quoteIdent(columnName)} AS v FROM ${quoteIdent(tableName)}`)
    .all() as { v: unknown }[];
  const badCount = rows.filter((r) => !isCastable(r.v, newDataType)).length;
  if (badCount > 0) {
    throw new Error(`${badCount}개 행이 새 타입으로 변환할 수 없습니다`);
  }

  const columns = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all() as {
    name: string;
    type: string;
  }[];
  const indexList = db.prepare(`PRAGMA index_list(${quoteIdent(tableName)})`).all() as {
    name: string;
    unique: 0 | 1;
    origin: string;
  }[];
  const indexDefs = indexList
    .filter((idx) => idx.origin === 'c' && idx.unique === 1)
    .map((idx) => {
      const cols = (db.prepare(`PRAGMA index_info(${quoteIdent(idx.name)})`).all() as { name: string }[]).map(
        (c) => c.name
      );
      return { name: idx.name, columns: cols };
    });
  const tmpName = `__rewrite_${tableName}_${Date.now()}`;
  const selectList = columns
    .map((c) =>
      c.name === columnName
        ? `CAST(${quoteIdent(c.name)} AS ${sqlTypeFor(newDataType)}) AS ${quoteIdent(c.name)}`
        : quoteIdent(c.name)
    )
    .join(', ');
  const colList = columns.map((c) => quoteIdent(c.name)).join(', ');
  const newColDefs = columns
    .map((c) => (c.name === columnName ? `${quoteIdent(c.name)} ${sqlTypeFor(newDataType)}` : `${quoteIdent(c.name)} ${c.type}`))
    .join(', ');

  const tx = db.transaction(() => {
    db.exec(`CREATE TABLE ${quoteIdent(tmpName)} (${newColDefs})`);
    db.exec(`INSERT INTO ${quoteIdent(tmpName)} (${colList}) SELECT ${selectList} FROM ${quoteIdent(tableName)}`);
    db.exec(`DROP TABLE ${quoteIdent(tableName)}`);
    db.exec(`ALTER TABLE ${quoteIdent(tmpName)} RENAME TO ${quoteIdent(tableName)}`);
    for (const idx of indexDefs) {
      const idxCols = idx.columns.map((c) => quoteIdent(c)).join(', ');
      db.exec(`CREATE UNIQUE INDEX ${quoteIdent(idx.name)} ON ${quoteIdent(tableName)} (${idxCols})`);
    }
  });
  tx();
}
