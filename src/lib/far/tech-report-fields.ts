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
/**
 * 제품정보 표의 칸 — 초도 분석 앞에 놓인다(사용자 지정, 2026-08-31).
 *
 * 전부 **원장에서 온 값이라 고칠 수 없다.** 여기서 고칠 수 있게 하면 보고서와 원장이 서서히
 * 어긋나고, 나중에 어느 쪽이 맞는지 물을 곳이 없어진다(적층 정보를 저장하지 않는 것과 같은 이유).
 *
 * **sample마다 한 줄**이다. 한 FAR 안에서도 Part ID는 sample마다 다르고 DRAM·Ctrl·NAND도
 * 갈리는 일이 있어(실제 데이터에서 확인), 한 줄로 접으면 어느 sample 것인지 알 수 없는 값
 * 하나만 남고 나머지는 조용히 사라진다.
 */
export const PRODUCT_COLUMNS = [
  { col: 'part_id', label: 'Part ID' },
  { col: 'device', label: 'Device' },
  { col: 'ctrl', label: 'Ctrl' },
  { col: 'nand', label: 'NAND' },
  { col: 'dram', label: 'DRAM' },
] as const;

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

/**
 * PKG Stack 표에서 끌어온 적층 정보 — Part ID로 찾는다.
 *
 * Tech Report의 'Stack 정보' 칸은 원래 사람이 그림을 올리는 자리였다. 같은 내용을 PKG Stack
 * 화면에 이미 적어 두는데 보고서마다 다시 올리는 일이 되풀이돼, 그 표를 그대로 끌어와
 * **표 다음에 그림** 순서로 보여 준다(사용자 지정, 2026-08-29). 맞는 Part ID가 없으면 null이고,
 * 그때는 지금까지처럼 사람이 올리는 칸이 나온다.
 */
export type SampleStack = {
  part_id: string;
  layers: { ch: string; way: string; chip: string }[];
  /** 저장된 그림 이름(없을 수 있다). */
  image: string;
};

/** sample 탭 하나가 담는 것. */
export type TechReportSample = {
  sample_no: string;
  perf: Record<string, string>;
  nand_opinion: string;
  fw_opinion: string;
  rtbb_list: Record<string, string>[];
  nand_lot_list: Record<string, string>[];
  images: Record<string, string>;
  /**
   * 아래 둘은 **읽을 때만 채워지는 값**이다 — 저장하지 않는다. 화면이 그대로 돌려보내도
   * 저장 경로가 무시하고, 다음에 불러올 때 원장·PKG Stack에서 다시 가져온다.
   */
  /** 이 sample의 Part ID — 적층 정보를 찾는 열쇠다(원장에서 온다). */
  part_id?: string;
  /** 제품정보 표의 한 줄(PRODUCT_COLUMNS 순서). 원장에서 오고 저장하지 않는다. */
  product?: Record<string, string>;
  /** PKG Stack에서 찾은 적층 정보. 없으면 null. */
  stack?: SampleStack | null;
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
    part_id: '',
    stack: null,
  };
}
