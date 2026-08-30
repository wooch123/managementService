/**
 * 글자로 적힌 번호를 **수로** 정렬한다 — Sample No가 그렇다.
 *
 * `sample_no`는 TEXT다. 그냥 정렬하면 글자 순서라 1 다음이 10이고 2는 11 뒤로 밀린다.
 * 칸을 숫자 타입으로 바꾸면 될 것 같지만 안 된다 — 이 칸에는 `1-2`, `A3`처럼 수가 아닌 값도
 * 들어온다. 그래서 정렬할 때만 수로 읽고, 수로 읽히지 않는 값은 글자 순서로 뒤를 가른다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  dbHolder: { current: null as unknown as Database.Database },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { entity: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/db/app-db', () => ({ getAppDb: () => mocks.dbHolder.current }));

const { buildOrderClause, resolveEntity, runListQuery } = await import('@/lib/data-engine/query');

const ENTITY = {
  id: 'e1',
  tableName: 'far_table',
  fields: [
    { id: 'f-sample', columnName: 'sample_no', dataType: 'TEXT' },
    { id: 'f-rev', columnName: 'rev', dataType: 'INTEGER' },
  ],
};

/** 표에 넣을 sample 번호 — 일부러 뒤섞어 넣는다. */
const SAMPLES = ['10', '2', '1', '11', '3'];

let testDb: Database.Database;

beforeEach(() => {
  testDb = new Database(':memory:');
  mocks.dbHolder.current = testDb;
  testDb.exec(`
    CREATE TABLE "far_table" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT, "sample_no" TEXT, "rev" INTEGER);
  `);
  const insert = testDb.prepare('INSERT INTO "far_table" VALUES (?, ?, ?, ?, ?)');
  SAMPLES.forEach((s, i) => insert.run(String(i), '2026-01-01', '2026-01-01', s, 1));
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue(ENTITY);
});

async function order(numeric: boolean): Promise<string[]> {
  const result = await runListQuery({
    mode: 'list',
    entityId: 'e1',
    select: ['f-sample'],
    filters: [],
    sort: [{ fieldId: 'f-sample', dir: 'asc', numeric }],
    pageSize: 50,
  });
  return result.rows.map((r) => String(r.sample_no));
}

describe('정렬 — 글자로 적힌 번호', () => {
  it('numeric 없이는 글자 순서다(1 다음에 10)', async () => {
    expect(await order(false)).toEqual(['1', '10', '11', '2', '3']);
  });

  it('numeric이면 수 순서다(1, 2, 3, 10, 11)', async () => {
    expect(await order(true)).toEqual(['1', '2', '3', '10', '11']);
  });

  it('수로 읽히지 않는 값끼리는 글자 순서로 가른다 — 같은 자리에 뭉치지 않는다', async () => {
    const insert = testDb.prepare('INSERT INTO "far_table" VALUES (?, ?, ?, ?, ?)');
    insert.run('x1', '2026-01-01', '2026-01-01', 'B', 1);
    insert.run('x2', '2026-01-01', '2026-01-01', 'A', 1);
    // CAST가 둘 다 0으로 읽으므로 수로는 맨 앞이고, 그 안에서는 A → B다.
    expect(await order(true)).toEqual(['A', 'B', '1', '2', '3', '10', '11']);
  });

  it('SQL은 CAST와 원래 칸 두 벌로 만든다 — 컬럼 이름은 설계에서 찾은 것만 들어간다', async () => {
    const entity = await resolveEntity('e1');
    expect(buildOrderClause(entity, [{ fieldId: 'f-sample', dir: 'asc', numeric: true }])).toBe(
      'ORDER BY CAST("sample_no" AS INTEGER) ASC, "sample_no" ASC'
    );
    expect(buildOrderClause(entity, [{ fieldId: 'f-sample', dir: 'desc' }])).toBe('ORDER BY "sample_no" DESC');
  });

  it('numeric은 정렬 하나에만 붙는다 — 뒤따르는 정렬은 그대로다', async () => {
    const entity = await resolveEntity('e1');
    expect(
      buildOrderClause(entity, [
        { fieldId: 'f-sample', dir: 'asc', numeric: true },
        { fieldId: 'f-rev', dir: 'desc' },
      ])
    ).toBe('ORDER BY CAST("sample_no" AS INTEGER) ASC, "sample_no" ASC, "rev" DESC');
  });
});
