import 'server-only';
import type Database from 'better-sqlite3';
import { isValidIdentifierFormat } from '@/lib/data-engine/identifiers';

export type ColumnInfo = {
  name: string;
  type: string;
  notnull: boolean;
  dfltValue: string | null;
  pk: boolean;
};

function assertValidTableName(tableName: string): void {
  if (!isValidIdentifierFormat(tableName)) throw new Error(`유효하지 않은 테이블명입니다: ${tableName}`);
}

export function tableExists(db: Database.Database, tableName: string): boolean {
  assertValidTableName(tableName);
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName);
  return row != null;
}

export function listUserTables(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getTableColumns(db: Database.Database, tableName: string): ColumnInfo[] {
  assertValidTableName(tableName);
  const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
    name: string;
    type: string;
    notnull: 0 | 1;
    dflt_value: string | null;
    pk: 0 | 1;
  }[];
  return rows.map((r) => ({ name: r.name, type: r.type, notnull: r.notnull === 1, dfltValue: r.dflt_value, pk: r.pk === 1 }));
}

export function getRowCount(db: Database.Database, tableName: string): number {
  assertValidTableName(tableName);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM "${tableName}"`).get() as { c: number };
  return row.c;
}

export function getUniqueIndexedColumns(db: Database.Database, tableName: string): Set<string> {
  assertValidTableName(tableName);
  const indexes = db.prepare(`PRAGMA index_list("${tableName}")`).all() as { name: string; unique: 0 | 1 }[];
  const cols = new Set<string>();
  for (const idx of indexes) {
    if (idx.unique !== 1) continue;
    const info = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as { name: string }[];
    if (info.length === 1) cols.add(info[0].name);
  }
  return cols;
}
