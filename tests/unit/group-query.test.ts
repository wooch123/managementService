import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  dbHolder: { current: null as unknown as Database.Database },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { entity: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/db/app-db', () => ({ getAppDb: () => mocks.dbHolder.current }));

const { runGroupQuery } = await import('@/lib/data-engine/query');

/**
 * 항목별 집계(group) 바인딩.
 *
 * WHY: 차트가 list 바인딩으로 원시 행을 pageSize(최대 200)만큼만 가져와 화면에서 세던 시절,
 * 데이터가 쌓이자 5,000건 중 200건만 반영돼 수치가 틀렸다(1,255건짜리 항목이 58로 표시).
 * 이 모드는 DB가 전부 집계하므로 행이 아무리 늘어도 값이 정확해야 한다.
 */
const ENTITY = {
  id: 'e1',
  tableName: 'claims',
  fields: [
    { id: 'f-group', columnName: 'product_group', dataType: 'TEXT' },
    { id: 'f-qty', columnName: 'qty', dataType: 'INTEGER' },
    { id: 'f-status', columnName: 'status', dataType: 'TEXT' },
  ],
};

let testDb: Database.Database;

beforeEach(() => {
  testDb = new Database(':memory:');
  mocks.dbHolder.current = testDb;
  testDb.exec(`
    CREATE TABLE "claims" ("id" TEXT PRIMARY KEY, "created_at" TEXT, "updated_at" TEXT,
                           "product_group" TEXT, "qty" INTEGER, "status" TEXT);
  `);
  const insert = testDb.prepare('INSERT INTO "claims" VALUES (?, ?, ?, ?, ?, ?)');
  const groups = ['UFS 4.0', 'UFS 3.1', 'eMMC 5.1'];
  // 1,000행: UFS 4.0 500 / UFS 3.1 300 / eMMC 5.1 200
  const plan = [500, 300, 200];
  let n = 0;
  plan.forEach((count, gi) => {
    for (let i = 0; i < count; i++) {
      insert.run(String(++n), '2026-01-01', '2026-01-01', groups[gi], i % 5, i % 2 ? '완료' : '진행');
    }
  });
  mocks.findUnique.mockResolvedValue(ENTITY);
});

const base = {
  mode: 'group' as const,
  entityId: 'e1',
  groupFieldId: 'f-group',
  groupTransform: 'none' as const,
  fn: 'count' as const,
  filters: [],
  orderBy: 'value' as const,
  limit: 20,
};

describe('항목별 집계 바인딩', () => {
  it('행이 1,000건이어도 전부 세어 정확한 값을 돌려준다', async () => {
    const r = await runGroupQuery(base, ENTITY as never);
    expect(r.rows).toEqual([
      { label: 'UFS 4.0', value: 500 },
      { label: 'UFS 3.1', value: 300 },
      { label: 'eMMC 5.1', value: 200 },
    ]);
    expect(r.rows.reduce((s, x) => s + x.value, 0)).toBe(1000);
  });

  it('차트가 읽는 봉투(rows/columns) 모양을 그대로 돌려준다', async () => {
    const r = await runGroupQuery(base, ENTITY as never);
    expect(r.columns.map((c) => c.columnName)).toEqual(['label', 'value']);
    expect(r.columns[0].dataType).toBe('TEXT');
  });

  it('분류 이름 순 정렬을 지원한다', async () => {
    const r = await runGroupQuery({ ...base, orderBy: 'label' }, ENTITY as never);
    expect(r.rows.map((x) => x.label)).toEqual(['UFS 3.1', 'UFS 4.0', 'eMMC 5.1']);
  });

  it('항목 수 상한을 지킨다', async () => {
    const r = await runGroupQuery({ ...base, limit: 2 }, ENTITY as never);
    expect(r.rows).toHaveLength(2);
  });

  it('합계(sum) 집계는 값 필드를 쓴다', async () => {
    const r = await runGroupQuery({ ...base, fn: 'sum', valueFieldId: 'f-qty' }, ENTITY as never);
    const total = r.rows.reduce((s, x) => s + x.value, 0);
    const expected = testDb.prepare('SELECT SUM(qty) v FROM claims').get() as { v: number };
    expect(total).toBe(expected.v);
  });

  it('필터를 적용해도 집계가 맞는다', async () => {
    const r = await runGroupQuery(
      { ...base, filters: [{ fieldId: 'f-status', op: 'eq', source: 'fixed', value: '완료' }] },
      ENTITY as never
    );
    const expected = testDb.prepare("SELECT COUNT(*) c FROM claims WHERE status = '완료'").get() as { c: number };
    expect(r.rows.reduce((s, x) => s + x.value, 0)).toBe(expected.c);
  });

  it('값 필드 없이 sum을 요청하면 명확히 실패한다', async () => {
    await expect(runGroupQuery({ ...base, fn: 'sum' }, ENTITY as never)).rejects.toThrow('값 필드');
  });

  it('개수 집계의 값 컬럼은 암묵 컬럼으로 표시되지 않는다', () => {
    // WHY: 이 표시가 어긋나 있던 동안 차트가 값 컬럼을 "내 것이 아닌 컬럼"으로 보고 버린 뒤
    // 라벨 개수를 세어, 운영 대시보드의 항목별 집계 막대가 전부 1로 그려졌다(2026-08-19).
    return runGroupQuery(base, ENTITY as never).then((r) => {
      expect(r.columns.every((c) => !('implicit' in c) || c.implicit !== true)).toBe(true);
    });
  });
});

/** 날짜 버킷 — 추이 차트를 미리 집계한 표가 아니라 원본 테이블에서 바로 만들기 위한 것. */
describe('항목별 집계 — 날짜 묶음', () => {
  const dateEntity = {
    id: 'e2',
    tableName: 'events',
    fields: [
      { id: 'f-date', columnName: 'received_date', dataType: 'DATE' },
      { id: 'f-tat', columnName: 'tat_days', dataType: 'INTEGER' },
    ],
  };
  const dateBase = {
    ...base,
    entityId: 'e2',
    groupFieldId: 'f-date',
    orderBy: 'label' as const,
    limit: 100,
  };

  beforeEach(() => {
    testDb.exec(`CREATE TABLE "events" ("id" TEXT PRIMARY KEY, "received_date" TEXT, "tat_days" INTEGER);`);
    const insert = testDb.prepare('INSERT INTO "events" VALUES (?, ?, ?)');
    // 2026-06-01 ~ 2026-08-30, 하루 한 건 + TAT는 1씩 증가
    let n = 0;
    for (const [month, days] of [
      ['06', 30],
      ['07', 31],
      ['08', 30],
    ] as const) {
      for (let d = 1; d <= days; d++) {
        insert.run(String(++n), `2026-${month}-${String(d).padStart(2, '0')}`, d);
      }
    }
  });

  it('월별로 묶으면 라벨이 YYYY-MM이고 건수가 그 달 전체다', async () => {
    const r = await runGroupQuery({ ...dateBase, groupTransform: 'month' }, dateEntity as never);
    expect(r.rows).toEqual([
      { label: '2026-06', value: 30 },
      { label: '2026-07', value: 31 },
      { label: '2026-08', value: 30 },
    ]);
  });

  it('연도별·주별 묶음도 같은 봉투로 돌려준다', async () => {
    const year = await runGroupQuery({ ...dateBase, groupTransform: 'year' }, dateEntity as never);
    expect(year.rows).toEqual([{ label: '2026', value: 91 }]);

    const week = await runGroupQuery({ ...dateBase, groupTransform: 'week' }, dateEntity as never);
    expect(week.rows.length).toBeGreaterThan(10);
    expect(week.rows[0].label).toMatch(/^2026-W\d{2}$/);
    expect(week.rows.reduce((s, x) => s + x.value, 0)).toBe(91);
  });

  it('묶은 축에도 평균 집계가 걸린다', async () => {
    const r = await runGroupQuery(
      { ...dateBase, groupTransform: 'month', fn: 'avg', valueFieldId: 'f-tat' },
      dateEntity as never
    );
    // 6월(1~30일)의 평균 TAT = 15.5
    expect(r.rows[0]).toEqual({ label: '2026-06', value: 15.5 });
  });

  it('상한에 걸리면 오래된 쪽이 아니라 최근 쪽을 남기고, 순서는 오름차순이다', async () => {
    const r = await runGroupQuery({ ...dateBase, groupTransform: 'month', limit: 2 }, dateEntity as never);
    expect(r.rows.map((x) => x.label)).toEqual(['2026-07', '2026-08']);
  });

  it('기간 필터가 걸리면 그 기간의 버킷만 나온다', async () => {
    const r = await runGroupQuery(
      {
        ...dateBase,
        groupTransform: 'month',
        filters: [
          { fieldId: 'f-date', op: 'gte', source: 'fixed', value: '2026-07-01' },
          { fieldId: 'f-date', op: 'lte', source: 'fixed', value: '2026-08-31' },
        ],
      },
      dateEntity as never
    );
    expect(r.rows.map((x) => x.label)).toEqual(['2026-07', '2026-08']);
  });
});
