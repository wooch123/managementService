import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { computeSchemaDiff, type EntityDraft } from '@/lib/data-engine/diff';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
});

describe('computeSchemaDiff — §6.5 safe/blocked/destructive 분류', () => {
  it('app.db에 없는 엔티티는 entity_add / safe', () => {
    const draft: EntityDraft[] = [{ tableName: 'orders', fields: [] }];
    const changes = computeSchemaDiff(db, draft);
    expect(changes).toEqual([{ kind: 'entity_add', risk: 'safe', tableName: 'orders' }]);
  });

  it('필드 추가 — nullable/default 있으면 safe', () => {
    db.exec(`CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT);`);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'note', dataType: 'TEXT', isRequired: false, isUnique: false }] },
    ];
    const changes = computeSchemaDiff(db, draft);
    expect(changes).toEqual([{ kind: 'field_add', risk: 'safe', tableName: 'orders', columnName: 'note', reason: undefined }]);
  });

  it('필드 추가 — required + 기본값 없음 + 기존 행 있으면 blocked', () => {
    db.exec(`
      CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT);
      INSERT INTO "orders" VALUES ('1', '2026-01-01', '2026-01-01');
    `);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'status', dataType: 'TEXT', isRequired: true, isUnique: false, defaultVal: null }] },
    ];
    const changes = computeSchemaDiff(db, draft);
    expect(changes[0].risk).toBe('blocked');
    expect(changes[0].kind).toBe('field_add');
  });

  it('필드 추가 — required + 기본값 없음이지만 기존 행이 없으면 safe', () => {
    db.exec(`CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT);`);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'status', dataType: 'TEXT', isRequired: true, isUnique: false, defaultVal: null }] },
    ];
    const changes = computeSchemaDiff(db, draft);
    expect(changes[0].risk).toBe('safe');
  });

  it('필드 타입 변경은 destructive', () => {
    db.exec(`CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "amount" TEXT);`);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'amount', dataType: 'INTEGER', isRequired: false, isUnique: false }] },
    ];
    const changes = computeSchemaDiff(db, draft);
    expect(changes).toEqual([{ kind: 'field_type_change', risk: 'destructive', tableName: 'orders', columnName: 'amount', affectedRows: 0 }]);
  });

  it('메타에 없는 컬럼은 field_delete / destructive', () => {
    db.exec(`CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "legacy_col" TEXT);`);
    const draft: EntityDraft[] = [{ tableName: 'orders', fields: [] }];
    const changes = computeSchemaDiff(db, draft);
    expect(changes).toEqual([
      { kind: 'field_delete', risk: 'destructive', tableName: 'orders', columnName: 'legacy_col', affectedRows: 0 },
    ]);
  });

  it('메타에 없는 테이블은 entity_delete / destructive', () => {
    db.exec(`CREATE TABLE "orphan" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT);`);
    const changes = computeSchemaDiff(db, []);
    expect(changes).toEqual([{ kind: 'entity_delete', risk: 'destructive', tableName: 'orphan', affectedRows: 0 }]);
  });

  it('unique 필드에 중복 값이 있으면 index_add / blocked, 없으면 safe', () => {
    db.exec(`
      CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "code" TEXT);
      INSERT INTO "orders" VALUES ('1', '', '', 'A');
      INSERT INTO "orders" VALUES ('2', '', '', 'A');
    `);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'code', dataType: 'TEXT', isRequired: false, isUnique: true }] },
    ];
    const changes = computeSchemaDiff(db, draft);
    expect(changes.find((c) => c.kind === 'index_add')?.risk).toBe('blocked');
  });

  it('완전히 동기화된 스키마는 변경 사항이 없다', () => {
    db.exec(`CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "status" TEXT);`);
    const draft: EntityDraft[] = [
      { tableName: 'orders', fields: [{ columnName: 'status', dataType: 'TEXT', isRequired: false, isUnique: false }] },
    ];
    expect(computeSchemaDiff(db, draft)).toEqual([]);
  });
});
