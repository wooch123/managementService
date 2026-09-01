import { describe, it, expect } from 'vitest';
import { computeTatSummary } from '@/lib/stats/tat';

/**
 * TAT 분포 — 가로축 걸린 일수, 세로축 FAR 건수.
 *
 * 여기서 지키려는 것은 **경계**다. "14일 초과부터 초과건"이라 14일은 정상이고 15일부터
 * 초과여야 한다. 한 칸씩 밀리면 화면의 색과 숫자가 조용히 어긋난다.
 */

const TODAY = new Date('2026-09-01T00:00:00Z');
const OPTS = { threshold: 14, maxDays: 30, today: TODAY };

/** 접수일 기준으로 `days` 일 걸려 완료된 건 하나. */
function done(days: number) {
  const rcv = new Date(TODAY.getTime() - 400 * 86_400_000);
  const rec = new Date(rcv.getTime() + days * 86_400_000);
  return { rcv_date: rcv.toISOString().slice(0, 10), done: 1, recorded_at: rec.toISOString() };
}

/** 아직 분석값이 안 들어온 건 — 접수한 지 `days` 일 지났다. */
function running(days: number) {
  const rcv = new Date(TODAY.getTime() - days * 86_400_000);
  return { rcv_date: rcv.toISOString().slice(0, 10), done: 0, recorded_at: null };
}

const bucketOf = (s: ReturnType<typeof computeTatSummary>, days: number) =>
  s.buckets.find((b) => b.days === days)!;

describe('computeTatSummary — 14일 경계', () => {
  it('14일은 초과가 아니고 15일부터 초과다', () => {
    const s = computeTatSummary([done(13), done(14), done(15), done(16)], OPTS);
    expect(bucketOf(s, 13).over).toBe(false);
    expect(bucketOf(s, 14).over).toBe(false);
    expect(bucketOf(s, 15).over).toBe(true);
    expect(bucketOf(s, 16).over).toBe(true);
    expect(s.within).toBe(2);
    expect(s.over).toBe(2);
  });

  it('완료 건과 진행 중인 건을 같은 자에 놓는다', () => {
    // 완료는 '기록된 때까지', 진행 중은 '오늘까지' — 둘 다 접수일부터 흐른 일수다.
    const s = computeTatSummary([done(10), running(10)], OPTS);
    expect(bucketOf(s, 10).count).toBe(2);
    expect(s.done).toBe(1);
    expect(s.running).toBe(1);
  });

  it('진행 중인 건은 오늘까지로 세어 계속 늘어난다', () => {
    const s = computeTatSummary([running(20)], OPTS);
    expect(bucketOf(s, 20).count).toBe(1);
    expect(bucketOf(s, 20).over).toBe(true);
  });
});

describe('computeTatSummary — 넘침 칸', () => {
  it('maxDays를 넘는 건은 마지막 한 칸에 모이고 초과로 센다', () => {
    const s = computeTatSummary([done(30), done(31), running(400)], OPTS);
    const overflow = s.buckets[s.buckets.length - 1];
    expect(overflow.overflow).toBe(true);
    expect(overflow.label).toBe('30+');
    expect(overflow.count).toBe(2); // 31일과 400일
    expect(overflow.over).toBe(true);
    expect(bucketOf(s, 30).count).toBe(1);
  });

  it('칸은 0부터 maxDays까지 빠짐없이 있고, 넘침 칸이 하나 더 있다', () => {
    const s = computeTatSummary([], OPTS);
    expect(s.buckets).toHaveLength(32); // 0..30 + 넘침
    expect(s.buckets[0].days).toBe(0);
    expect(s.buckets[30].days).toBe(30);
    expect(s.buckets[30].overflow).toBe(false);
  });

  it('모든 건이 어느 칸엔가 정확히 한 번 들어간다', () => {
    const rows = [done(0), done(5), done(14), done(15), done(30), done(99), running(3), running(200)];
    const s = computeTatSummary(rows, OPTS);
    expect(s.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(s.total);
    expect(s.total).toBe(rows.length);
    expect(s.within + s.over).toBe(s.total);
  });
});

describe('computeTatSummary — 셀 수 없는 건은 지어내지 않는다', () => {
  it('접수일이 없으면 세지 않고 몇 건인지 알린다', () => {
    const s = computeTatSummary([{ rcv_date: null, done: 0, recorded_at: null }, done(5)], OPTS);
    expect(s.skipped).toBe(1);
    expect(s.total).toBe(1);
  });

  it('완료 표시는 있는데 시각을 못 읽으면 진행 중으로 밀어 넣지 않는다', () => {
    // 오늘로 처리하면 아직 안 끝난 것처럼 보인다 — 그 건은 아예 세지 않는다.
    const s = computeTatSummary([{ rcv_date: '2026-08-01', done: 1, recorded_at: 'not-a-date' }], OPTS);
    expect(s.skipped).toBe(1);
    expect(s.total).toBe(0);
  });

  it('접수일보다 이른 기록은 0일로 본다 — 음수로 축을 무너뜨리지 않는다', () => {
    const s = computeTatSummary(
      [{ rcv_date: '2026-08-20', done: 1, recorded_at: '2026-08-10T00:00:00Z' }],
      OPTS
    );
    expect(bucketOf(s, 0).count).toBe(1);
    expect(s.skipped).toBe(0);
  });
});

describe('computeTatSummary — 중앙값', () => {
  it('완료된 건만으로 낸다 — 진행 중인 건은 아직 끝나지 않았다', () => {
    // 진행 중 300일짜리가 섞여도 완료 건의 중앙값은 흔들리지 않아야 한다.
    const s = computeTatSummary([done(10), done(12), done(14), running(300)], OPTS);
    expect(s.medianDone).toBe(12);
  });

  it('완료된 건이 없으면 값이 없다고 답한다', () => {
    const s = computeTatSummary([running(5)], OPTS);
    expect(s.medianDone).toBeNull();
  });

  it('완료 건이 짝수면 가운데 둘의 평균이다', () => {
    const s = computeTatSummary([done(10), done(12)], OPTS);
    expect(s.medianDone).toBe(11);
  });
});

describe('computeTatSummary — 날짜 형식', () => {
  it('날짜만 있는 값과 ISO 일시를 같은 자로 잰다', () => {
    // rcv_date는 'YYYY-MM-DD', recorded_at은 ISO 일시다. 시:분 때문에 하루가 어긋나면 안 된다.
    const s = computeTatSummary(
      [{ rcv_date: '2026-08-01', done: 1, recorded_at: '2026-08-15T23:59:59.000Z' }],
      OPTS
    );
    expect(bucketOf(s, 14).count).toBe(1);
    expect(bucketOf(s, 14).over).toBe(false);
  });
});
