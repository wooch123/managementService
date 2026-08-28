/**
 * Tech Report 양식의 칸 정의 — 화면·서버·설계 스크립트가 같은 목록을 읽는다.
 *
 * 양식 자체(`sample page/tech report page.html`)가 기준이다. 순서와 이름을 여기서 한 번만 정하면
 * 표를 그리는 쪽과 저장하는 쪽이 어긋날 수 없다.
 */

/** Performance table의 줄 — 표시명과 저장 칸 이름. 세로 표(라벨 | 값)로 그린다. */
export type PerfRow = {
  col: string;
  label: string;
  /** 불러오기로 자동으로 채울 때 FAR 원장에서 가져올 칸(없으면 사람이 직접 적는 칸이다). */
  from?: string;
};

export const PERF_ROWS: PerfRow[] = [
  { col: 'fw_version', label: 'fw version', from: 'firmware' },
  { col: 'week_code', label: 'week code', from: 'comp_wc' },
  { col: 'open_count', label: 'open count', from: 'open_count' },
  { col: 'spo_count', label: 'spo count', from: 'spor_count' },
  { col: 'npo_count', label: 'npo count', from: 'npor_count' },
  { col: 'reclaim_count', label: 'reclaim count', from: 'reclaim_count' },
  { col: 'rtbb_count', label: 'rtbb count', from: 'rtbb_count' },
  // 아래 넷은 원장에 없는 값이다 — 분석 Tool이 아직 올리지 않으므로 사람이 적는다.
  { col: 'uecc_count', label: 'uecc count' },
  { col: 'psf_count', label: 'psf count' },
  { col: 'esf_count', label: 'esf count' },
  { col: 'slc_max_ec', label: 'slc max ec', from: 'slc_max_ec' },
  { col: 'slc_avg_ec', label: 'slc avg ec', from: 'slc_avg_ec' },
  { col: 'slc_min_ec', label: 'slc min ec', from: 'slc_min_ec' },
  { col: 'mlc_max_ec', label: 'mlc max ec', from: 'mlc_max_ec' },
  { col: 'mlc_avg_ec', label: 'mlc avg ec', from: 'mlc_avg_ec' },
  { col: 'mlc_min_ec', label: 'mlc min ec', from: 'mlc_min_ec' },
  { col: 'sram_test_result', label: 'sram test result' },
  { col: 'dc_test_result', label: 'DC Test Result' },
  { col: 'comment', label: 'comment' },
];

/** 사람이 적는 긴 글 두 칸. */
export const OPINION_COLUMNS = ['nand_opinion', 'fw_opinion'] as const;

/** RTBB 목록의 열. */
export const RTBB_COLUMNS = ['ch', 'way', 'die', 'page', 'block', 'mat'] as const;
/** 양식이 비워 둔 기본 줄 수. */
export const RTBB_DEFAULT_ROWS = 6;

/** NAND Lot ID 목록의 열. */
export const NAND_LOT_COLUMNS = ['ch', 'way', 'die', 'nand_lot_id'] as const;

/** 그림 칸 — 양식의 배치 순서 그대로다. */
export type ImageSlot = { key: string; label: string };

export const IMAGE_SLOTS: ImageSlot[] = [
  { key: 'stack', label: 'Stack 정보' },
  { key: 'wafer_map', label: 'Wafer map' },
  { key: 'dist1', label: '산포' },
  { key: 'dist2', label: '산포' },
  { key: 'dist3', label: '산포' },
  { key: 'dist4', label: '산포' },
];

/** FW 분석 내용 아래의 그림 칸. */
export const META_SLOTS: ImageSlot[] = [
  { key: 'meta1', label: 'Meta' },
  { key: 'meta2', label: 'Meta' },
  { key: 'meta3', label: 'Meta' },
];

export const ALL_IMAGE_KEYS = [...IMAGE_SLOTS, ...META_SLOTS].map((s) => s.key);

/** sample 탭 하나가 담는 것. */
export type TechReportSample = {
  sample_no: string;
  perf: Record<string, string>;
  nand_opinion: string;
  fw_opinion: string;
  rtbb_list: Record<string, string>[];
  nand_lot_list: Record<string, string>[];
  images: Record<string, string>;
  /** 불러오기가 원장에서 채워 준 칸들(사람이 아직 손대지 않은 값) — 화면에서 표시만 한다. */
  prefilled?: string[];
};

export type TechReportDoc = {
  far_no: string;
  overall_opinion: string;
  visual_top: string;
  visual_bottom: string;
  author: string;
  /** FAR 원장에 적힌 사진 경로 — 업로드 전에는 이 경로를 안내한다. */
  visual_top_path?: string;
  visual_bottom_path?: string;
  samples: TechReportSample[];
  /** 저장된 보고서가 이미 있었는지(불러오기 결과를 화면에서 구분해 알리기 위해). */
  saved?: boolean;
  updated_at?: string | null;
};

export function emptySample(sample_no: string): TechReportSample {
  return {
    sample_no,
    perf: Object.fromEntries(PERF_ROWS.map((r) => [r.col, ''])),
    nand_opinion: '',
    fw_opinion: '',
    rtbb_list: Array.from({ length: RTBB_DEFAULT_ROWS }, () =>
      Object.fromEntries(RTBB_COLUMNS.map((c) => [c, ''])) as Record<string, string>
    ),
    nand_lot_list: [],
    images: {},
  };
}
