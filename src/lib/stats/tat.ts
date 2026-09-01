import 'server-only';
import { getAppDb } from '@/lib/db/app-db';

/**
 * TAT(Turn-Around Time) 분포 — 가로축은 걸린 일수, 세로축은 FAR 건수(사용자 지정, 2026-09-01).
 *
 * ── TAT를 무엇으로 세는가 ───────────────────────────────────────────────────────
 * 원장에 '완료일' 칸이 따로 없다. 대신 **분석값이 언제 들어왔는지**가 분석 이력
 * (`far_analysis_log.recorded_at`)에 남는다. 그래서
 *
 *   · 분석값이 들어온 건  → 처음 기록된 시각 − 접수일   (다 걸린 시간)
 *   · 아직 안 들어온 건    → 오늘 − 접수일               (지금도 흐르는 중)
 *
 * 로 센다. 지금 원장 723건 중 완료 424건은 전부 이력에 시각이 있고, 접수일이 빈 건은 없다 —
 * 즉 **한 건도 빠뜨리지 않고** 셀 수 있다. 혹시 접수일이 비거나 시각을 찾지 못하는 건이
 * 생기면 세지 않고 `skipped`로 몇 건인지 돌려준다. 지어내서 채우지 않는다(CLAUDE.md §4.2).
 *
 * ── 왜 마지막 칸이 '30일+'인가 ──────────────────────────────────────────────────
 * 오래 열려 있는 건이 있어 최댓값이 400일을 넘는다. 하루 한 칸으로 끝까지 그리면 가로축이
 * 수백 칸이 되어 정작 중요한 앞쪽이 뭉개진다. 그래서 `maxDays`까지는 하루 한 칸으로 두고
 * 그 너머는 한 칸에 모은다 — 넘긴 건이 몇 건인지는 그대로 보인다.
 */

export type TatBucket = {
  /** 이 칸이 나타내는 일수. 마지막 넘침 칸은 `maxDays + 1`을 쓰고 `overflow`가 참이다. */
  days: number;
  label: string;
  count: number;
  /** 기준을 넘긴 칸인가 — 화면에서 색을 가르는 데 쓴다. */
  over: boolean;
  overflow: boolean;
};

export type TatSummary = {
  /** 초과 기준(일). 이 값을 **넘으면** 초과다(14면 15일부터). */
  threshold: number;
  maxDays: number;
  buckets: TatBucket[];
  total: number;
  within: number;
  over: number;
  /** 완료된 건만의 중앙값 — 진행 중인 건은 아직 끝나지 않아 median을 끌어올린다. */
  medianDone: number | null;
  done: number;
  running: number;
  /** 접수일이나 완료 시각을 찾지 못해 세지 못한 건. 0이어야 정상이다. */
  skipped: number;
};

const DAY_MS = 86_400_000;

/**
 * 주소의 조건 하나를 정수로 읽는다. **없거나 빈 값이면 기본값**, 있으면 범위 안으로 자른다.
 *
 * 없을 때를 따로 보는 이유: `searchParams.get()`은 없으면 `null`을 주는데 `Number(null)`은
 * `0`이고 `Number.isFinite(0)`은 참이다. "숫자가 아니면 기본값"으로만 걸러 두면 **생략했을 때
 * 기본값이 아니라 최솟값으로 잘린다.** 실제로 그랬다 — `threshold`를 빼고 부르면 14가 아닌
 * 1이 되어 2일짜리까지 전부 초과로 세었다(화면은 늘 값을 붙여 불러서 드러나지 않았고, API를
 * 직접 부른 새 클론에서 723건 전부 초과로 나와 잡혔다). 빈 문자열도 `Number('')`가 0이라
 * 같은 함정이다.
 */
export function readIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

type Row = { rcv_date: string | null; done: number; recorded_at: string | null };

/** 'YYYY-MM-DD' 또는 ISO 일시를 UTC 자정으로 맞춘다 — 시:분 차이로 하루가 어긋나지 않게. */
function toUtcMidnight(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const date = new Date(text.length <= 10 ? `${text}T00:00:00Z` : text);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function computeTatSummary(
  rows: Row[],
  options: { threshold: number; maxDays: number; today?: Date }
): TatSummary {
  const { threshold, maxDays } = options;
  const todayMs = Math.floor((options.today ?? new Date()).getTime() / DAY_MS) * DAY_MS;

  const counts = new Array<number>(maxDays + 2).fill(0); // 0..maxDays + 넘침 한 칸
  const doneTats: number[] = [];
  let total = 0;
  let done = 0;
  let running = 0;
  let skipped = 0;

  for (const row of rows) {
    const startMs = row.rcv_date ? toUtcMidnight(row.rcv_date) : null;
    if (startMs === null) {
      skipped += 1;
      continue;
    }

    const finished = row.done === 1 && row.recorded_at;
    const endMs = finished ? toUtcMidnight(row.recorded_at as string) : todayMs;
    if (endMs === null) {
      // 완료 표시는 있는데 시각을 못 읽은 건 — 오늘로 밀어 넣으면 아직 진행 중인 것처럼 보인다.
      skipped += 1;
      continue;
    }

    // 접수일보다 이른 기록은 자료 오류다. 음수로 그리면 축이 무너지므로 0일로 본다.
    const days = Math.max(0, Math.round((endMs - startMs) / DAY_MS));

    total += 1;
    if (finished) {
      done += 1;
      doneTats.push(days);
    } else {
      running += 1;
    }
    counts[Math.min(days, maxDays + 1)] += 1;
  }

  const buckets: TatBucket[] = counts.map((count, days) => {
    const overflow = days === maxDays + 1;
    return {
      days,
      label: overflow ? `${maxDays}+` : String(days),
      count,
      // 넘침 칸은 전부 maxDays보다 크므로, maxDays가 기준 이상인 한 항상 초과다.
      over: overflow ? maxDays >= threshold : days > threshold,
      overflow,
    };
  });

  const within = buckets.filter((b) => !b.over).reduce((s, b) => s + b.count, 0);

  return {
    threshold,
    maxDays,
    buckets,
    total,
    within,
    over: total - within,
    medianDone: median(doneTats),
    done,
    running,
    skipped,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 원장 한 번, 이력 한 번으로 끝낸다.
 *
 * 이력에서 **가장 이른 기록 시각**을 쓴다 — 같은 건이 여러 회차(rev)로 다시 기록되는데,
 * 마지막 회차를 쓰면 나중에 값을 한 번 고칠 때마다 그 건의 TAT가 늘어난다. 처음 결과가
 * 나온 때가 '분석이 끝난 때'다.
 */
export async function getTatSummary(options: { threshold: number; maxDays: number }): Promise<TatSummary> {
  const db = getAppDb();
  const rows = db
    .prepare(
      `SELECT f."rcv_date" AS rcv_date,
              CASE WHEN f."firmware" IS NOT NULL AND f."firmware" <> '' THEN 1 ELSE 0 END AS done,
              (SELECT MIN(l."recorded_at") FROM "far_analysis_log" l
                WHERE l."far_no" = f."far_no" AND l."sample_no" = f."sample_no") AS recorded_at
         FROM "far_table" f`
    )
    .all() as Row[];

  return computeTatSummary(rows, options);
}
