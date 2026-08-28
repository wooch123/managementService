import 'server-only';
import { nanoid } from 'nanoid';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import { toStorageValue } from '@/lib/data-engine/crud';
import {
  ANALYSIS_COLUMNS,
  ANALYSIS_TYPE_BY_COLUMN,
  FAR_ANALYSIS_LOG_TABLE,
  FAR_TABLE,
} from '@/lib/far/analysis-fields';

/**
 * 분석 값 기록 — **덮어써도 예전 값이 남는다**.
 *
 * 한 번의 호출로 두 가지가 함께 일어난다.
 *   ① `far_analysis_log`에 그 시점의 분석 값 **전부**를 담은 줄을 하나 더한다(회차 1,2,3…).
 *   ② `far_table`의 해당 sample 행을 새 값으로 갱신한다(목록·집계가 조인 없이 읽는 '지금 값').
 *
 * 둘은 한 트랜잭션이다 — 갱신만 되고 이력이 빠지는 상태는 만들어지지 않는다. 이력 줄에는 이번에
 * 보낸 값뿐 아니라 **바뀌지 않은 값까지** 함께 담는다. 회차 하나만 읽어도 그때의 상태가 온전히
 * 복원되어야, 나중에 "3회차 때는 얼마였나"에 다른 줄을 뒤지지 않고 답할 수 있다.
 *
 * 이력 표는 고쳐 쓰거나 지울 수 없다(app.db에 걸린 트리거가 UPDATE/DELETE를 거부한다).
 */

export type AnalysisWriteResult = {
  far_no: string;
  sample_no: string;
  rev: number;
  recorded_at: string;
  /** 이번 호출로 실제 값이 바뀐 칸 수 */
  changed: number;
};

export class FarSampleNotFound extends Error {
  constructor(far_no: string, sample_no: string) {
    super(`해당 sample을 찾을 수 없습니다: ${far_no} / ${sample_no}`);
    this.name = 'FarSampleNotFound';
  }
}

/** 들어온 값 중 분석 칸만 남기고, 각 칸의 타입에 맞는 저장 형태로 바꾼다. */
export function toAnalysisStorageValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const type = ANALYSIS_TYPE_BY_COLUMN[key];
    if (!type) continue; // 분석 칸이 아닌 것은 이 길로 들어올 수 없다(접수 정보는 외부 API 담당)
    out[key] = value === null ? null : toStorageValue(type, value);
  }
  return out;
}

export function writeAnalysis(
  far_no: string,
  sample_no: string,
  values: Record<string, unknown>,
  source: string
): AnalysisWriteResult {
  const db = getAppDb();
  const incoming = toAnalysisStorageValues(values);
  const now = new Date().toISOString();
  const farTable = quoteIdent(FAR_TABLE);
  const logTable = quoteIdent(FAR_ANALYSIS_LOG_TABLE);
  const analysisCols = ANALYSIS_COLUMNS.map(quoteIdent).join(', ');

  const run = db.transaction((): AnalysisWriteResult => {
    const current = db
      .prepare(`SELECT ${analysisCols} FROM ${farTable} WHERE "far_no" = ? AND "sample_no" = ?`)
      .get(far_no, sample_no) as Record<string, unknown> | undefined;
    if (!current) throw new FarSampleNotFound(far_no, sample_no);

    // 이번에 온 값을 지금 값 위에 덮어 그 시점의 완전한 상태를 만든다.
    const snapshot: Record<string, unknown> = { ...current, ...incoming };
    const changed = Object.entries(incoming).filter(([col, v]) => current[col] !== v).length;

    const revRow = db
      .prepare(`SELECT MAX("rev") AS n FROM ${logTable} WHERE "far_no" = ? AND "sample_no" = ?`)
      .get(far_no, sample_no) as { n: number | null };
    const rev = (revRow?.n ?? 0) + 1;

    const logColumns = [
      'id', 'created_at', 'updated_at',
      'far_no', 'sample_no', 'rev', 'recorded_at', 'source',
      ...ANALYSIS_COLUMNS,
    ];
    db.prepare(
      `INSERT INTO ${logTable} (${logColumns.map(quoteIdent).join(', ')}) VALUES (${logColumns.map(() => '?').join(', ')})`
    ).run(
      nanoid(), now, now,
      far_no, sample_no, rev, now, source,
      ...ANALYSIS_COLUMNS.map((col) => snapshot[col] ?? null)
    );

    if (Object.keys(incoming).length > 0) {
      const setSql = [...Object.keys(incoming).map((c) => `${quoteIdent(c)} = ?`), '"updated_at" = ?'].join(', ');
      db.prepare(`UPDATE ${farTable} SET ${setSql} WHERE "far_no" = ? AND "sample_no" = ?`).run(
        ...Object.values(incoming),
        now,
        far_no,
        sample_no
      );
    }

    return { far_no, sample_no, rev, recorded_at: now, changed };
  });

  return run();
}

/** 한 sample의 기록 이력 — 최신 회차부터. */
export function readAnalysisHistory(far_no: string, sample_no: string, limit: number) {
  const db = getAppDb();
  const columns = ['rev', 'recorded_at', 'source', ...ANALYSIS_COLUMNS];
  const rows = db
    .prepare(
      `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent(FAR_ANALYSIS_LOG_TABLE)}
        WHERE "far_no" = ? AND "sample_no" = ?
        ORDER BY "rev" DESC LIMIT ?`
    )
    .all(far_no, sample_no, limit) as Record<string, unknown>[];
  return rows;
}
