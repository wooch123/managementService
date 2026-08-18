import 'server-only';
import { getAppDb } from '@/lib/db/app-db';
import { tableExists, getRowCount, getTableColumns } from '@/lib/data-engine/introspect';
import { isValidIdentifierFormat } from '@/lib/data-engine/identifiers';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import type { ValidationCtx } from '@/lib/validation/types';

function isCastable(value: unknown, dataType: string): boolean {
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

/** app.db 조회가 필요한 규칙(§11.2 EDATA-008/009/010 등)을 위한 실제 ctx. 식별자는 반드시
 * 화이트리스트 형식 검사를 통과해야 쿼리에 쓴다(다른 data-engine 모듈과 동일한 원칙).
 *
 * deployOverride: P8 배포 엔드포인트가 실제 배포 시도 시점의 값(스키마 diff의 destructive
 * 항목, 관리자가 체크한 승인 목록 등)을 주입할 때만 넘긴다 — 그 외(빌더/검증 화면 등)에서는
 * 인자 없이 호출해 §11.5 배포 안전성 규칙이 "P8 이전/배포 시도 아님" 기본값으로 평가되게 둔다. */
export function buildValidationCtx(deployOverride?: Partial<ValidationCtx['deploy']>): ValidationCtx {
  const db = getAppDb();

  return {
    tableExists: (tableName) => isValidIdentifierFormat(tableName) && tableExists(db, tableName),
    getRowCount: (tableName) => {
      if (!isValidIdentifierFormat(tableName) || !tableExists(db, tableName)) return 0;
      return getRowCount(db, tableName);
    },
    hasDuplicateValues: (tableName, columnName) => {
      if (!isValidIdentifierFormat(tableName) || !isValidIdentifierFormat(columnName)) return false;
      if (!tableExists(db, tableName)) return false;
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM (SELECT "${columnName}" FROM "${tableName}" WHERE "${columnName}" IS NOT NULL GROUP BY "${columnName}" HAVING COUNT(*) > 1)`
        )
        .get() as { c: number };
      return row.c > 0;
    },
    getColumnType: (tableName, columnName) => {
      if (!isValidIdentifierFormat(tableName) || !tableExists(db, tableName)) return undefined;
      return getTableColumns(db, tableName).find((c) => c.name === columnName)?.type;
    },
    hasUncastableValues: (tableName, columnName, targetDataType) => {
      if (!isValidIdentifierFormat(tableName) || !isValidIdentifierFormat(columnName)) return false;
      if (!tableExists(db, tableName)) return false;
      const rows = db.prepare(`SELECT "${columnName}" AS v FROM "${tableName}"`).all() as { v: unknown }[];
      return rows.some((r) => !isCastable(r.v, targetDataType));
    },
    getComponentMeta: (type) => nodeMeta[type],
    deploy: {
      pendingDestructiveChanges: [],
      acceptedDestructiveIds: new Set(),
      migrationDryRunError: null,
      previousRevisionPageSlugs: null,
      hasChangesSincePublish: true,
      ...deployOverride,
    },
  };
}
