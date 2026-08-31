/**
 * 목록을 **묶어서** 읽기 — 한 FAR의 sample 여러 줄을 한 줄로 접고 몇 개인지 센다.
 *
 * 원장은 행 하나가 sample 하나라, FA Assign처럼 **FAR 단위로 고르는** 목록에서는 그냥 늘어놓으면
 * sample 열 개짜리 FAR이 열 줄을 차지한다. 묶어야 목록이 읽힌다.
 *
 * 함께 확인하는 것 하나: 쪽 넘김이 쓰는 `total`은 원래 줄 수가 아니라 **묶음 수**여야 한다.
 * 그러지 않으면 마지막 쪽들이 빈 채로 남는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  dbHolder: { current: null as unknown as Database.Database },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { entity: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/db/app-db', () => ({ getAppDb: () => mocks.dbHolder.current }));

const { runListQuery, COUNT_TOKEN } = await import('@/lib/data-engine/query');

const ENTITY = {
  id: 'e1',
  tableName: 'far_table',
  fields: [
    { id: 'f-far', columnName: 'far_no', dataType: 'TEXT' },
    { id: 'f-sample', columnName: 'sample_no', dataType: 'TEXT' },
    { id: 'f-name', columnName: 'name', dataType: 'TEXT' },
  ],
};

/** FAR 셋 — sample이 각각 3개·1개·2개다. */
const ROWS: [string, string, string][] = [
  ['FAR-A', '1', '김분석'],
  ['FAR-A', '2', '김분석'],
  ['FAR-A', '3', '김분석'],
  ['FAR-B', '1', '이신뢰'],
  ['FAR-C', '1', '박품질'],
  ['FAR-C', '2', '박품질'],
];

let testDb: Database.Database;

beforeEach(() => {
  testDb = new Database(':memory:');
  mocks.dbHolder.current = testDb;
  testDb.exec(`
    CREATE TABLE "far_table" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT,
                              "far_no" TEXT, "sample_no" TEXT, "name" TEXT);
  `);
  const insert = testDb.prepare('INSERT INTO "far_table" VALUES (?, ?, ?, ?, ?, ?)');
  ROWS.forEach(([far, sample, name], i) => insert.run(String(i), '2026-01-01', '2026-01-01', far, sample, name));
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue(ENTITY);
});

const base = {
  mode: 'list' as const,
  entityId: 'e1',
  filters: [],
  sort: [{ fieldId: 'f-far', dir: 'asc' as const }],
  pageSize: 50,
};

describe('목록 묶어 읽기', () => {
  it('묶지 않으면 sample 하나가 한 줄이다', async () => {
    const r = await runListQuery({ ...base, select: ['f-far', 'f-sample'] });
    expect(r.rows).toHaveLength(6);
    expect(r.total).toBe(6);
  });

  it('far_no로 묶으면 FAR 하나가 한 줄이고, count()가 sample 수를 센다', async () => {
    const r = await runListQuery({ ...base, select: ['f-far', COUNT_TOKEN, 'f-name'], groupByFieldId: 'f-far' });
    expect(r.rows.map((x) => [x.far_no, x.group_count, x.name])).toEqual([
      ['FAR-A', 3, '김분석'],
      ['FAR-B', 1, '이신뢰'],
      ['FAR-C', 2, '박품질'],
    ]);
  });

  it('total은 원래 줄 수가 아니라 묶음 수다 — 쪽 넘김이 이 수를 따른다', async () => {
    const r = await runListQuery({ ...base, select: ['f-far', COUNT_TOKEN], groupByFieldId: 'f-far' });
    expect(r.total).toBe(3);
  });

  it('묶은 뒤에도 조건은 먼저 걸린다 — 거른 것만 센다', async () => {
    const r = await runListQuery({
      ...base,
      select: ['f-far', COUNT_TOKEN],
      groupByFieldId: 'f-far',
      filters: [{ fieldId: 'f-name', op: 'eq', source: 'fixed', value: '김분석' }],
    });
    expect(r.rows).toEqual([expect.objectContaining({ far_no: 'FAR-A', group_count: 3 })]);
    expect(r.total).toBe(1);
  });

  it('count() 칸은 결과 칸 목록에도 들어간다 — 표가 그것을 보고 그린다', async () => {
    const r = await runListQuery({ ...base, select: ['f-far', COUNT_TOKEN], groupByFieldId: 'f-far' });
    const counted = r.columns.find((c) => c.columnName === 'group_count');
    expect(counted).toBeTruthy();
    // 필드가 아니라 세어서 만든 값이므로 fieldId가 없다.
    expect(counted?.fieldId).toBeNull();
    expect(counted?.dataType).toBe('INTEGER');
  });
});
