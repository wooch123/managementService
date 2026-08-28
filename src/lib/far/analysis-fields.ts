import type { DataType } from '@/types/entity';

/**
 * 분석 Tool이 갱신하는 칸 — 설계 문서(「page 구성 및 DB(8.28)」)에서 "분석 이후에 분석 Tool 통해
 * DB에 update 할 값(server API 제공 필요)"으로 표시된 목록 그대로다.
 *
 * 이 목록이 세 곳의 단일 기준이다.
 *   · `far_table`의 분석 칸(지금 값)
 *   · `far_analysis_log`의 칸(기록될 때마다 남는 그 시점 값)
 *   · 갱신 API(`POST /api/far/analysis`)가 받는 값
 * 셋이 어긋나면 이력이 반쪽만 남으므로 설계 스크립트와 서버가 같은 배열을 읽는다.
 */
export type AnalysisField = { name: string; col: string; type: DataType };

export const ANALYSIS_FIELDS: AnalysisField[] = [
  { name: 'Firmware', col: 'firmware', type: 'TEXT' },
  { name: 'Init Pass', col: 'init', type: 'BOOLEAN' },
  { name: 'SLC Max EC', col: 'slc_max_ec', type: 'REAL' },
  { name: 'SLC Min EC', col: 'slc_min_ec', type: 'REAL' },
  { name: 'SLC Avg EC', col: 'slc_avg_ec', type: 'REAL' },
  { name: 'MLC Max EC', col: 'mlc_max_ec', type: 'REAL' },
  { name: 'MLC Min EC', col: 'mlc_min_ec', type: 'REAL' },
  { name: 'MLC Avg EC', col: 'mlc_avg_ec', type: 'REAL' },
  { name: 'Open Count', col: 'open_count', type: 'REAL' },
  { name: 'Runtime Bad Block', col: 'rtbb_count', type: 'REAL' },
  { name: 'Read Reclaim', col: 'reclaim_count', type: 'REAL' },
  { name: 'Write Size(GB)', col: 'write_size', type: 'REAL' },
  { name: 'Read Size(GB)', col: 'read_size', type: 'REAL' },
  { name: 'LVD Count', col: 'lvd_count', type: 'REAL' },
  { name: 'NPOR Count', col: 'npor_count', type: 'REAL' },
  { name: 'SPOR Count', col: 'spor_count', type: 'REAL' },
  { name: 'ECID', col: 'ecid', type: 'TEXT' },
  { name: 'NAND Lot ID', col: 'nand_lotid', type: 'JSON' },
];

export const ANALYSIS_COLUMNS = ANALYSIS_FIELDS.map((f) => f.col);
export const ANALYSIS_TYPE_BY_COLUMN: Record<string, DataType> = Object.fromEntries(
  ANALYSIS_FIELDS.map((f) => [f.col, f.type])
);

/** 원장(지금 값)과 이력(그때 값)이 쓰는 표 이름. */
export const FAR_TABLE = 'far_table';
export const FAR_ANALYSIS_LOG_TABLE = 'far_analysis_log';
