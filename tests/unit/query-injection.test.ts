import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  dbHolder: { current: null as unknown as Database.Database },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { entity: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/db/app-db', () => ({ getAppDb: () => mocks.dbHolder.current }));

const { buildWhereClause, resolveEntity, runListQuery } = await import('@/lib/data-engine/query');

const ENTITY = {
  id: 'e1',
  tableName: 'orders',
  fields: [
    { id: 'f-status', columnName: 'status', dataType: 'TEXT' },
    { id: 'f-amount', columnName: 'amount', dataType: 'INTEGER' },
  ],
};

let testDb: Database.Database;

beforeEach(() => {
  testDb = new Database(':memory:');
  mocks.dbHolder.current = testDb;
  testDb.exec(`
    CREATE TABLE "orders" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "status" TEXT, "amount" INTEGER);
    INSERT INTO "orders" VALUES ('1', '2026-01-01', '2026-01-01', 'active', 100);
    INSERT INTO "orders" VALUES ('2', '2026-01-01', '2026-01-01', 'done', 200);
  `);
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue(ENTITY);
});

describe('query.ts — 인젝션 방어', () => {
  it('존재하지 않는 fieldId는 쿼리를 만들지 않고 즉시 에러를 던진다', async () => {
    const entity = await resolveEntity('e1');
    expect(() =>
      buildWhereClause(entity, [{ fieldId: 'status"; DROP TABLE orders; --', op: 'eq', source: 'fixed', value: 'x' }])
    ).toThrow();
    expect(testDb.prepare('SELECT COUNT(*) AS c FROM "orders"').get()).toEqual({ c: 2 });
  });

  it('필터 값에 SQL 조각을 넣어도 파라미터 바인딩되어 테이블에 영향이 없다', async () => {
    const result = await runListQuery({
      mode: 'list',
      entityId: 'e1',
      select: ['f-status'],
      filters: [{ fieldId: 'f-status', op: 'eq', source: 'fixed', value: "x'; DROP TABLE orders; --" }],
      sort: [],
      pageSize: 10,
    });
    expect(result.rows).toEqual([]);
    expect(testDb.prepare('SELECT COUNT(*) AS c FROM "orders"').get()).toEqual({ c: 2 });
  });

  it("'in' 연산자의 값 배열에 SQL 조각이 있어도 파라미터 바인딩된다", async () => {
    const result = await runListQuery({
      mode: 'list',
      entityId: 'e1',
      select: ['f-status'],
      filters: [{ fieldId: 'f-status', op: 'in', source: 'fixed', value: ["'); DROP TABLE orders; --", 'active'] }],
      sort: [],
      pageSize: 10,
    });
    expect(result.rows.length).toBe(1);
    expect(testDb.prepare('SELECT COUNT(*) AS c FROM "orders"').get()).toEqual({ c: 2 });
  });

  it('contains 연산자는 %/_ 와일드카드를 이스케이프해 리터럴로 취급한다', async () => {
    testDb.exec(`INSERT INTO "orders" VALUES ('3', '2026-01-01', '2026-01-01', '50%off', 300);`);
    const result = await runListQuery({
      mode: 'list',
      entityId: 'e1',
      select: ['f-status'],
      filters: [{ fieldId: 'f-status', op: 'contains', source: 'fixed', value: '50%' }],
      sort: [],
      pageSize: 10,
    });
    expect(result.rows.length).toBe(1);
  });

  it('정상 필터는 올바르게 동작한다', async () => {
    const result = await runListQuery({
      mode: 'list',
      entityId: 'e1',
      select: ['f-status', 'f-amount'],
      filters: [{ fieldId: 'f-status', op: 'eq', source: 'fixed', value: 'active' }],
      sort: [],
      pageSize: 10,
    });
    expect(result.rows).toEqual([{ id: '1', status: 'active', amount: 100 }]);
  });
});
