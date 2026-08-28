/**
 * 데이터 설계 — 「page 구성 및 DB(8.28)」의 세 표를 그대로 옮기고, 이력 표 하나를 더한다.
 *
 * 컬럼 이름은 문서에 적힌 이름을 **그대로** 쓴다(`app`, `init`, `date`, `count`처럼 짧은 이름도
 * 바꾸지 않는다). 사람이 읽을 이름은 `name`에 따로 둔다 — CLAUDE.md §4.3의 "물리 이름은
 * snake_case, 표시명은 메타에 별도 보관".
 *
 * 문서에서 한 곳만 고쳤다: 단가표의 `urgnet` → `urgent`(같은 표의 뜻은 "긴급건일 때 가격"이고
 * 의뢰서 표에도 `urgent`가 있다). 오타가 컬럼 이름으로 굳으면 되돌리기 어려워 여기서 바로잡고
 * 표시명에 "긴급 가산"을 남긴다.
 *
 * ── 분석 값을 덮어써도 예전 값이 남는 구조 ──────────────────────────────────────
 * 문서에서 "분석 이후에 분석 Tool 통해 DB에 update 할 값"으로 표시된 18개 칸은 **같은 sample에
 * 대해 여러 번 갱신된다**. 한 칸에 최신 값만 두면 두 번째 측정이 첫 번째를 덮어 지워, "그때는
 * 얼마였나"를 되물을 방법이 없어진다.
 *
 * 그래서 두 곳에 나눠 적는다.
 *   · `far_table`        — **지금 값**. 목록·필터·집계가 조인 없이 바로 읽는다.
 *   · `far_analysis_log` — **기록될 때마다 한 줄**. 그 시점의 18개 값 전부를 통째로 담는다.
 *
 * 로그는 고쳐 쓰거나 지울 수 없다(app.db에 트리거를 걸어 UPDATE/DELETE를 막는다 — apply-site.ts).
 * 갱신 API(`POST /api/far/analysis`)는 로그 추가와 현재 값 갱신을 한 트랜잭션으로 처리하므로,
 * 현재 값만 바뀌고 이력이 빠지는 상태가 생기지 않는다.
 */
import type { DataType } from '../src/types/entity';
import { ANALYSIS_FIELDS } from '../src/lib/far/analysis-fields';

export type FieldPlan = {
  /** 사람이 읽는 이름(관리자 화면·표 머리글에 쓰인다) */
  name: string;
  col: string;
  type: DataType;
  required?: boolean;
  unique?: boolean;
  enumValues?: string[];
};

export type EntityPlan = {
  name: string;
  table: string;
  description: string;
  fields: FieldPlan[];
};

/**
 * 분석 Tool이 갱신하는 값들 — 설계 문서에서 "분석 이후에 분석 Tool 통해 DB에 update 할 값
 * (server API 제공 필요)"으로 표시된 칸 그대로다. 현재 값 표와 이력 표가 **같은 목록**을 쓰도록
 * 한 곳에 둔다(둘이 어긋나면 이력이 반쪽만 남는다).
 */
export const TOOL_FIELDS: FieldPlan[] = ANALYSIS_FIELDS;

/** 이력 표에서 분석 값을 절대 지우지 못하게 막는 대상 — apply-site.ts가 트리거를 건다. */
export const APPEND_ONLY_TABLES = ['far_analysis_log'] as const;

/** 접수·제품 정보 — 외부 서버 API로 채울 값(이관 후 연동). */
const INTAKE_FIELDS: FieldPlan[] = [
  { name: '접수일', col: 'rcv_date', type: 'DATE' },
  { name: '마감일', col: 'due_date', type: 'DATE' },
  { name: '고객명', col: 'cust_name', type: 'TEXT' },
  { name: '불량 발생 위치', col: 'fail_loc', type: 'TEXT' },
  { name: '고객 불량 정보', col: 'fail_symptom', type: 'TEXT' },
  { name: 'Part ID', col: 'part_id', type: 'TEXT' },
  { name: '응용처', col: 'app', type: 'TEXT' },
  { name: '제품명', col: 'device', type: 'TEXT' },
  { name: 'Controller', col: 'ctrl', type: 'TEXT' },
  { name: 'NAND', col: 'nand', type: 'TEXT' },
  { name: 'DRAM', col: 'dram', type: 'TEXT' },
  { name: 'Ball Type', col: 'fbga', type: 'TEXT' },
  { name: '불량 대분류', col: 'failmode1', type: 'TEXT' },
  { name: '불량 중분류', col: 'failmode2', type: 'TEXT' },
  { name: '출하 Week Code', col: 'comp_wc', type: 'TEXT' },
  { name: 'Lot ID', col: 'lot_id', type: 'TEXT' },
  { name: '용량', col: 'density', type: 'TEXT' },
];

export const ENTITIES: EntityPlan[] = [
  {
    name: 'FAR 원장',
    table: 'far_table',
    description:
      'Claim 접수 원장. 한 FAR No에 여러 sample이 달릴 수 있어 행 하나 = sample 하나다. 접수·제품 정보는 외부 서버 API로 채우고(이관 후 연동), 분석 값은 분석 Tool이 갱신한다 — 갱신할 때마다 FAR 분석 이력에 그 시점 값이 함께 쌓인다.',
    fields: [
      { name: 'FAR No', col: 'far_no', type: 'TEXT', required: true },
      { name: 'Sample No', col: 'sample_no', type: 'TEXT', required: true },
      { name: '분석 담당자', col: 'name', type: 'TEXT' },
      ...INTAKE_FIELDS,
      ...TOOL_FIELDS,
      { name: '상단부 사진', col: 'visual_inspaction_top', type: 'TEXT' },
      { name: '하단부 사진', col: 'visual_inspaction_bottom', type: 'TEXT' },
    ],
  },
  {
    name: 'FAR 분석 이력',
    table: 'far_analysis_log',
    description:
      '분석 값이 기록될 때마다 한 줄씩 쌓는다. 그 시점의 값 전부를 담으므로 몇 번을 다시 측정해도 이전 기록을 그대로 조회할 수 있다. 고쳐 쓰거나 지울 수 없다(DB 트리거로 막혀 있다).',
    fields: [
      { name: 'FAR No', col: 'far_no', type: 'TEXT', required: true },
      { name: 'Sample No', col: 'sample_no', type: 'TEXT', required: true },
      /** 그 sample에 대한 몇 번째 기록인지 — 1부터 센다. */
      { name: '기록 회차', col: 'rev', type: 'INTEGER', required: true },
      { name: '기록 시각', col: 'recorded_at', type: 'DATETIME', required: true },
      /** 어디서 들어온 갱신인지 — 분석 Tool / 화면 입력 등. */
      { name: '기록 주체', col: 'source', type: 'TEXT' },
      ...TOOL_FIELDS,
    ],
  },
  {
    name: 'Reball 의뢰',
    table: 'reball_table',
    description: 'Reball 의뢰서 작성 화면에서 등록한다. 시료당 가격·총액은 단가표를 참조해 자동 계산된다.',
    fields: [
      { name: 'FAR No', col: 'far_no', type: 'TEXT', required: true },
      { name: '긴급', col: 'urgent', type: 'BOOLEAN' },
      { name: 'Reball 일정', col: 'date', type: 'DATE' },
      { name: '반출 번호', col: 'export_no', type: 'TEXT' },
      { name: '담당자', col: 'name', type: 'TEXT' },
      { name: 'PJT', col: 'pjt', type: 'TEXT' },
      { name: 'Reball', col: 'is_reball', type: 'BOOLEAN' },
      { name: 'Component Detach', col: 'is_component_detach', type: 'BOOLEAN' },
      { name: 'Underfill 제거', col: 'is_underfill', type: 'BOOLEAN' },
      { name: 'Grinding', col: 'is_grinding', type: 'BOOLEAN' },
      /**
       * Ball 수. 설계 문서의 표에는 없지만 단가표가 `200ball 이상/미만`으로 갈리므로,
       * 계산에 쓴 근거를 함께 남기지 않으면 나중에 "왜 이 단가인가"에 답할 수 없다.
       * 값은 개수 그대로 적는다(FBGA153·221·254처럼 Ball Type이 곧 ball 수다).
       */
      { name: 'Ball 수', col: 'ball_count', type: 'INTEGER' },
      { name: '시료 개수', col: 'count', type: 'REAL' },
      { name: '코멘트', col: 'handling', type: 'TEXT' },
      { name: '시료당 가격', col: 'per_cost', type: 'REAL' },
      { name: '총 가격', col: 'total_cost', type: 'REAL' },
    ],
  },
  {
    name: 'Reball 단가표',
    table: 'reball_cost_table',
    description: '작업 항목별 단가. 값이 바뀔 수 있어 Reball 의뢰서 작성 화면에서 직접 고칠 수 있다(행 하나만 쓴다).',
    fields: [
      { name: '200ball 이상', col: 'upper_200ball', type: 'REAL' },
      { name: '200ball 미만', col: 'under_200ball', type: 'REAL' },
      { name: 'Component Detach', col: 'component_detach', type: 'REAL' },
      { name: 'Underfill 제거', col: 'underfill', type: 'REAL' },
      { name: 'Grinding', col: 'grinding', type: 'REAL' },
      // 설계 문서의 `urgnet`(오타)을 바로잡은 이름.
      { name: '긴급 가산', col: 'urgent', type: 'REAL' },
    ],
  },
];

/** 단가표 첫 줄의 시작값. 실제 단가는 화면에서 고친다 — 여기 값은 계산이 0원으로만 나오지 않게 하는 출발점이다. */
export const DEFAULT_COST_ROW: Record<string, number> = {
  upper_200ball: 35000,
  under_200ball: 25000,
  component_detach: 15000,
  underfill: 20000,
  grinding: 30000,
  urgent: 10000,
};
