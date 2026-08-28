import 'server-only';
import { nanoid } from 'nanoid';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import {
  ALL_IMAGE_KEYS,
  NAND_LOT_COLUMNS,
  PERF_ROWS,
  RTBB_COLUMNS,
  RTBB_DEFAULT_ROWS,
  emptySample,
  type TechReportDoc,
  type TechReportSample,
} from '@/lib/far/tech-report-fields';

/**
 * Tech Report 읽기·쓰기.
 *
 * 두 가지가 한 화면에서 만난다.
 *   · **원장에서 자동으로 채우는 값** — 분석 Tool이 올린 값(FAR 원장)을 Performance table과
 *     NAND Lot 목록에 그대로 옮긴다. 같은 값을 사람이 다시 옮겨 적을 이유가 없다.
 *   · **사람이 적는 값** — 산포·Meta 그림, 분석 의견, RTBB 목록처럼 원장에 없는 것.
 *
 * 둘이 부딪히면 **사람이 적은 값이 이긴다**. 한 번 고쳐 둔 칸을 다시 불러올 때마다 원장 값으로
 * 되돌리면 편집한 의미가 없다. 그래서 저장된 값이 비어 있을 때만 원장 값을 끼워 넣고, 어떤 칸이
 * 그렇게 채워졌는지(`prefilled`)를 함께 알려 화면에서 구분해 보여 준다.
 */

const REPORT_TABLE = 'tech_report';
const SAMPLE_TABLE = 'tech_report_sample';

/** sample 탭이 하나도 없을 때 보여 줄 기본 개수 — 양식(Sample 1~3)과 같다. */
const DEFAULT_SAMPLE_COUNT = 3;

const SAMPLE_COLUMNS = [
  'far_no',
  'sample_no',
  ...PERF_ROWS.map((r) => r.col),
  'nand_opinion',
  'fw_opinion',
  'rtbb_list',
  'nand_lot_list',
  'images',
];

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * NAND Lot ID 배열을 CH/WAY/DIE 표로 편다.
 *
 * 원장은 칩 순서대로 lot id만 담고 있어(제품마다 개수가 다르다) 어느 채널·way인지는 없다.
 * 양식이 쓰던 배치를 그대로 따른다 — 채널마다 way 두 개, die는 0. 실제 배치가 다르면 화면에서
 * 고치면 되고, 고친 값이 저장된다.
 */
function toNandLotRows(lots: string[]): Record<string, string>[] {
  return lots.map((lot, index) => ({
    ch: String(Math.floor(index / 2)),
    way: String(index % 2),
    die: '0',
    nand_lot_id: text(lot),
  }));
}

function emptyRows(columns: readonly string[], count: number): Record<string, string>[] {
  return Array.from({ length: count }, () => Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>);
}

export function loadTechReport(farNo: string): TechReportDoc {
  const db = getAppDb();

  const farRows = db
    .prepare(
      `SELECT "sample_no", "comp_wc", "firmware", "open_count", "spor_count", "npor_count", "reclaim_count",
              "rtbb_count", "slc_max_ec", "slc_avg_ec", "slc_min_ec", "mlc_max_ec", "mlc_avg_ec", "mlc_min_ec",
              "nand_lotid", "visual_inspaction_top", "visual_inspaction_bottom"
         FROM "far_table" WHERE "far_no" = ? ORDER BY CAST("sample_no" AS INTEGER) ASC`
    )
    .all(farNo) as Record<string, unknown>[];

  const report = db.prepare(`SELECT * FROM ${quoteIdent(REPORT_TABLE)} WHERE "far_no" = ?`).get(farNo) as
    | Record<string, unknown>
    | undefined;
  const savedSamples = db
    .prepare(`SELECT * FROM ${quoteIdent(SAMPLE_TABLE)} WHERE "far_no" = ? ORDER BY CAST("sample_no" AS INTEGER) ASC`)
    .all(farNo) as Record<string, unknown>[];
  const savedBySample = new Map(savedSamples.map((row) => [text(row.sample_no), row]));

  // 탭 목록: 원장의 sample이 기준이다. 원장에 없고 저장본에만 있는 sample도 잃지 않게 함께 세운다.
  const sampleNos = [...new Set([...farRows.map((r) => text(r.sample_no)), ...savedBySample.keys()])].sort(
    (a, b) => Number(a) - Number(b) || a.localeCompare(b)
  );
  const effective = sampleNos.length > 0 ? sampleNos : Array.from({ length: DEFAULT_SAMPLE_COUNT }, (_, i) => String(i + 1));
  const farBySample = new Map(farRows.map((r) => [text(r.sample_no), r]));

  const samples: TechReportSample[] = effective.map((sampleNo) => {
    const base = emptySample(sampleNo);
    const far = farBySample.get(sampleNo);
    const saved = savedBySample.get(sampleNo);
    const prefilled: string[] = [];

    for (const row of PERF_ROWS) {
      const savedValue = saved ? text(saved[row.col]) : '';
      if (savedValue !== '') {
        base.perf[row.col] = savedValue;
        continue;
      }
      const fromLedger = row.from && far ? text(far[row.from]) : '';
      base.perf[row.col] = fromLedger;
      if (fromLedger !== '') prefilled.push(row.col);
    }

    base.nand_opinion = saved ? text(saved.nand_opinion) : '';
    base.fw_opinion = saved ? text(saved.fw_opinion) : '';

    const savedRtbb = parseJson<Record<string, string>[]>(saved?.rtbb_list, []);
    base.rtbb_list = savedRtbb.length > 0 ? savedRtbb : emptyRows(RTBB_COLUMNS, RTBB_DEFAULT_ROWS);

    const savedLots = parseJson<Record<string, string>[]>(saved?.nand_lot_list, []);
    if (savedLots.length > 0) {
      base.nand_lot_list = savedLots;
    } else {
      const lots = parseJson<string[]>(far?.nand_lotid, []);
      base.nand_lot_list = Array.isArray(lots) && lots.length > 0 ? toNandLotRows(lots) : emptyRows(NAND_LOT_COLUMNS, 0);
      if (base.nand_lot_list.length > 0) prefilled.push('nand_lot_list');
    }

    base.images = parseJson<Record<string, string>>(saved?.images, {});
    base.prefilled = prefilled;
    return base;
  });

  const firstFar = farRows[0];
  return {
    far_no: farNo,
    overall_opinion: report ? text(report.overall_opinion) : '',
    visual_top: report ? text(report.visual_top) : '',
    visual_bottom: report ? text(report.visual_bottom) : '',
    author: report ? text(report.author) : '',
    visual_top_path: firstFar ? text(firstFar.visual_inspaction_top) : '',
    visual_bottom_path: firstFar ? text(firstFar.visual_inspaction_bottom) : '',
    samples,
    saved: Boolean(report),
    updated_at: report ? text(report.updated_at) : null,
  };
}

/** 화면이 보낸 문서를 통째로 저장한다(있으면 갱신, 없으면 만든다). */
export function saveTechReport(doc: TechReportDoc): { savedSamples: number; updated_at: string } {
  const db = getAppDb();
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    const existing = db.prepare(`SELECT "id" FROM ${quoteIdent(REPORT_TABLE)} WHERE "far_no" = ?`).get(doc.far_no) as
      | { id: string }
      | undefined;
    const head = {
      overall_opinion: doc.overall_opinion ?? '',
      visual_top: doc.visual_top ?? '',
      visual_bottom: doc.visual_bottom ?? '',
      author: doc.author ?? '',
    };
    if (existing) {
      const set = [...Object.keys(head).map((c) => `${quoteIdent(c)} = ?`), '"updated_at" = ?'].join(', ');
      db.prepare(`UPDATE ${quoteIdent(REPORT_TABLE)} SET ${set} WHERE "id" = ?`).run(
        ...Object.values(head),
        now,
        existing.id
      );
    } else {
      const columns = ['id', 'created_at', 'updated_at', 'far_no', ...Object.keys(head)];
      db.prepare(
        `INSERT INTO ${quoteIdent(REPORT_TABLE)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      ).run(nanoid(), now, now, doc.far_no, ...Object.values(head));
    }

    for (const sample of doc.samples) {
      const values: Record<string, unknown> = {
        far_no: doc.far_no,
        sample_no: sample.sample_no,
        ...Object.fromEntries(PERF_ROWS.map((r) => [r.col, text(sample.perf?.[r.col])])),
        nand_opinion: sample.nand_opinion ?? '',
        fw_opinion: sample.fw_opinion ?? '',
        rtbb_list: JSON.stringify(sample.rtbb_list ?? []),
        nand_lot_list: JSON.stringify(sample.nand_lot_list ?? []),
        // 알 수 없는 칸 이름이 저장되지 않게 양식에 있는 그림 칸만 남긴다.
        images: JSON.stringify(
          Object.fromEntries(ALL_IMAGE_KEYS.filter((k) => sample.images?.[k]).map((k) => [k, sample.images[k]]))
        ),
      };
      const row = db
        .prepare(`SELECT "id" FROM ${quoteIdent(SAMPLE_TABLE)} WHERE "far_no" = ? AND "sample_no" = ?`)
        .get(doc.far_no, sample.sample_no) as { id: string } | undefined;
      if (row) {
        const set = [...SAMPLE_COLUMNS.map((c) => `${quoteIdent(c)} = ?`), '"updated_at" = ?'].join(', ');
        db.prepare(`UPDATE ${quoteIdent(SAMPLE_TABLE)} SET ${set} WHERE "id" = ?`).run(
          ...SAMPLE_COLUMNS.map((c) => values[c]),
          now,
          row.id
        );
      } else {
        const columns = ['id', 'created_at', 'updated_at', ...SAMPLE_COLUMNS];
        db.prepare(
          `INSERT INTO ${quoteIdent(SAMPLE_TABLE)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
        ).run(nanoid(), now, now, ...SAMPLE_COLUMNS.map((c) => values[c]));
      }
    }
    return { savedSamples: doc.samples.length, updated_at: now };
  });

  return run();
}
