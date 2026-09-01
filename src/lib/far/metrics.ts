import 'server-only';
import { getAppDb } from '@/lib/db/app-db';

/**
 * FAR 원장에서 **EC와 Write size**를 끌어온다 — Issue 표의 펼친 칸이 쓴다
 * (사용자 지정, 2026-09-01).
 *
 * ── 왜 Issue 줄에 복사해 두지 않는가 ────────────────────────────────────────────
 * 이 값들은 원장(`far_table`)이 진실 공급원이다. Issue 줄에 베껴 저장하면 나중에 원장 값이
 * 고쳐졌을 때 두 값이 어긋나고, 어느 쪽이 맞는지 화면만 보고는 알 수 없게 된다. 그래서
 * **저장하지 않고 볼 때마다 원장에서 읽는다.** Issue 줄에는 이미 `far_no`와 `sample_no`가
 * 있으니 그것으로 찾으면 된다.
 *
 * ── 한 번에 모아서 읽는다 ───────────────────────────────────────────────────────
 * 표에 줄이 여럿이고 아무 줄이나 펼칠 수 있다. 펼칠 때마다 한 건씩 물어보면 줄 수만큼 왕복이
 * 생기고, 펼치는 순간 값이 비어 있다가 뒤늦게 채워진다. 표를 그릴 때 한 번에 받아 두면 펼치는
 * 즉시 보인다.
 */

/** 원장에서 읽어 올 칸 — 이름을 여기 고정해 둔다(SQL에 바깥 문자열이 닿지 않는다). */
const METRIC_COLUMNS = [
  'slc_max_ec',
  'slc_avg_ec',
  'slc_min_ec',
  'mlc_max_ec',
  'mlc_avg_ec',
  'mlc_min_ec',
  'write_size',
] as const;

export type FarMetrics = {
  slc: { max: number | null; avg: number | null; min: number | null };
  mlc: { max: number | null; avg: number | null; min: number | null };
  writeSize: number | null;
};

/**
 * 결과는 **찾은 짝을 그대로 달고 있는 목록**으로 돌려준다. 맵으로 접어서 주지 않는다.
 *
 * 처음에는 `` `${farNo} ${sampleNo}` `` 같은 열쇠 문자열로 맵을 만들어 줬는데, 그러면 서버와
 * 화면이 **같은 열쇠 규칙을 따로 적어 두고 맞춰야** 한다. 실제로 한쪽 구분자가 눈에 안 보이는
 * 문자로 들어가는 바람에 값이 다 있는데도 화면에는 전부 '—'로 보였다(원인이 화면에 드러나지
 * 않는 종류의 어긋남이다). 짝을 그대로 실어 보내면 맞출 규칙 자체가 없어진다.
 */
export type FarMetricsRow = FarMetrics & { farNo: string; sampleNo: string };

export type MetricKey = { farNo: string; sampleNo: string };

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 주어진 (FAR No, Sample No) 짝들의 값을 한 번에 읽는다.
 *
 * 짝이 없거나 원장에 그 줄이 없으면 결과에 안 담긴다 — 부르는 쪽에서 "값 없음"으로 다루면 된다.
 * 없는 것을 0으로 채우지 않는다: 0회 쓴 것과 모르는 것은 다르다.
 */
export function getFarMetrics(keys: MetricKey[]): FarMetricsRow[] {
  const wanted = keys.filter((k) => k.farNo && k.sampleNo);
  if (wanted.length === 0) return [];

  const db = getAppDb();
  const columns = METRIC_COLUMNS.map((c) => `"${c}"`).join(', ');

  // (far_no, sample_no) 짝으로 찾는다. 짝의 수만큼 자리표를 만들고 값은 전부 바인딩한다.
  const placeholders = wanted.map(() => '(?, ?)').join(', ');
  const params = wanted.flatMap((k) => [k.farNo, k.sampleNo]);

  const rows = db
    .prepare(
      `SELECT "far_no", "sample_no", ${columns}
         FROM "far_table"
        WHERE ("far_no", "sample_no") IN (${placeholders})`
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    farNo: String(row.far_no ?? ''),
    sampleNo: String(row.sample_no ?? ''),
    slc: {
      max: toNumber(row.slc_max_ec),
      avg: toNumber(row.slc_avg_ec),
      min: toNumber(row.slc_min_ec),
    },
    mlc: {
      max: toNumber(row.mlc_max_ec),
      avg: toNumber(row.mlc_avg_ec),
      min: toNumber(row.mlc_min_ec),
    },
    writeSize: toNumber(row.write_size),
  }));
}
