/**
 * 화면 설계 — 「page 구성 및 DB(8.28)」의 페이지 구성을 그대로 옮긴 것이다.
 *
 * 문서가 "미구현으로 비워둘 것"이라 적은 화면은 **메뉴에는 있고 내용은 비운다**. 빈 화면 대신
 * 무엇이 들어올 자리인지 한 줄로 밝힌다 — 아무것도 없으면 "고장난 화면"과 구별되지 않는다
 * (CLAUDE.md §4.2 "미구현이면 명확히 미구현으로 표시").
 *
 * **페이지 머리(제목·설명 카드)를 두지 않는다**(사용자 결정, 2026-08-28). 화면 이름은 사이드바와
 * 이동 경로에 이미 있고, 설명 한 줄을 위해 카드 하나가 첫 화면을 차지했다. 그래서 각 화면은
 * 곧바로 내용으로 시작한다 — 화면을 쓰는 데 꼭 필요한 안내만 그 컴포넌트 안이나 강조 안내로
 * 남겼다(예: "담당자는 같은 FAR No의 모든 sample에 함께 적용됩니다").
 *
 * 좌표는 12칼럼 기준이고 `row`/`rowSpan`은 위에서부터의 줄이다(줄 높이 8px + 줄 간격 16px이라
 * 실제 높이는 `rowSpan × 24 − 16`px). 겹침은 적용 스크립트가 검사한다.
 */
import type { ActionPlan, BindPlan, FilterPlan, NodePlan } from './blueprint-lib';

export type SitePage = {
  slug: string;
  title: string;
  icon: string;
  isHome?: boolean;
  nodes: NodePlan[];
  children?: SitePage[];
};

// ── 조립 도구 ───────────────────────────────────────────────────────────────

/** 조회 기간 필터가 거는 두 조건(그 화면에 기간 필터가 있을 때만 의미가 있다). */
const period = (col: string): FilterPlan[] => [
  { col, op: 'gte', source: 'query', ref: 'from' },
  { col, op: 'lte', source: 'query', ref: 'to' },
];

/** 목록에서 고른 값과 맞추는 조건. 고르기 전에는 **아무것도 보여주지 않는다**. */
const selected = (col: string, param = 'sel'): FilterPlan => ({
  col,
  op: 'eq',
  source: 'query',
  ref: param,
  whenMissing: 'empty',
});

/** 고르지 않았으면 제한 없음. */
const byParam = (col: string, param: string): FilterPlan => ({ col, op: 'eq', source: 'query', ref: param });

/** 마감이 지난 건 — 오늘 날짜는 서버가 넣어 준다(주소로 덮어쓸 수 없다). */
const overdue: FilterPlan = { col: 'due_date', op: 'lt', source: 'query', ref: 'today' };

/** 폼 카드 안에 들어가는 실행 버튼(좌표는 부모가 정한다). */
const submitButton = (label: string, actionKey: string): NodePlan => ({
  type: 'button',
  col: 1,
  span: 3,
  row: 1,
  rowSpan: 4,
  props: { label, variant: 'default', size: 'default' },
  on: { onClick: actionKey },
});

/**
 * 내려받기 버튼. 필터 줄 오른쪽 끝에 놓는다 — 예전에는 페이지 머리에 있었는데, 그 카드를
 * 걷어내면서 **표를 거른 조건 바로 옆**으로 옮겼다(내려받는 대상이 그 표라 오히려 가깝다).
 * 버튼은 내용만큼 늘어나지 않으므로 필터(3줄)보다 한 줄 높게 잡아 눌리지 않게 한다.
 */
const exportButton = (row: number, col: number, span: number, actionKey: string, rowSpan = 4): NodePlan => ({
  type: 'button',
  col,
  span,
  row,
  rowSpan,
  props: { label: 'CSV 내보내기', variant: 'outline', size: 'default' },
  on: { onClick: actionKey },
});

const callout = (row: number, text: string, tone: 'info' | 'warn' | 'good' = 'info', rowSpan = 4): NodePlan => ({
  type: 'callout',
  col: 1,
  span: 12,
  row,
  rowSpan,
  props: { text, tone },
});

type KpiOptions = {
  unit?: string;
  compare?: boolean;
  secondary?: { label: string; filters: FilterPlan[]; higherIsBetter?: boolean };
  link?: { slug?: string; param: string; value?: string };
};

const kpi = (
  col: number,
  row: number,
  text: string,
  table: string,
  fn: 'count' | 'sum' | 'avg',
  filters: FilterPlan[],
  options: KpiOptions = {},
  field?: string
): NodePlan => ({
  type: 'stat-tile',
  col,
  span: 3,
  row,
  rowSpan: 7,
  props: {
    title: text,
    unit: options.unit ?? '건',
    secondaryLabel: options.secondary?.label ?? '',
    secondaryHigherIsBetter: options.secondary?.higherIsBetter ?? false,
    target: null,
    targetLabel: '목표',
    lowerIsBetter: false,
    linkSlug: options.link?.slug ?? '',
    linkParam: options.link?.param ?? '',
    linkValue: options.link?.value ?? '',
  },
  bind: {
    mode: 'aggregate',
    table,
    fn,
    field,
    filters,
    compare: options.compare ?? false,
    secondaryFilters: options.secondary?.filters,
  },
});

const textInput = (key: string, label: string, type = 'text', placeholder = ''): NodePlan => ({
  key,
  type: 'input',
  col: 1,
  span: 4,
  row: 1,
  rowSpan: 8,
  props: { label, placeholder, type },
});

const search = (row: number, col: number, span: number, label: string, placeholder: string, rowSpan = 3, param = 'q'): NodePlan => ({
  type: 'search-filter',
  col,
  span,
  row,
  rowSpan,
  props: { label, placeholder, param },
});

const pickFilter = (
  row: number,
  col: number,
  span: number,
  label: string,
  param: string,
  allLabel: string,
  bind: BindPlan,
  rowSpan = 3
): NodePlan => ({
  type: 'select-filter',
  col,
  span,
  row,
  rowSpan,
  props: { label, param, allLabel, options: '' },
  bind,
});

const groupBy = (table: string, groupField: string, limit = 30): BindPlan => ({
  mode: 'group',
  table,
  groupField,
  fn: 'count',
  filters: [],
  orderBy: 'value',
  limit,
});

/**
 * 아직 만들지 않은 화면.
 *
 * 메뉴에는 두되 내용은 비운다 — 문서가 "미구현으로 비워둘 것"이라 적었기 때문이다. 대신 무엇이
 * 들어올 자리인지 한 줄로 남긴다. 빈 화면만 있으면 "아직 안 만든 것"과 "고장난 것"을 구별할 수 없다.
 */
function unbuilt(slug: string, title: string, icon: string, what: string): SitePage {
  return {
    slug,
    title,
    icon,
    nodes: [
      callout(1, `${what} — 설계 문서에서 '미구현으로 비워둘 것'으로 표시된 화면입니다. 메뉴 자리만 잡아 두었습니다.`, 'info', 5),
    ],
  };
}

/** 자식 화면으로 들어가는 묶음 화면(메뉴의 중간 마디) — 바로가기 카드만 둔다. */
function hub(slug: string, title: string, icon: string, items: { title: string; description: string; slug: string; meta: string }[]): SitePage {
  return {
    slug,
    title,
    icon,
    nodes: [
      {
        type: 'nav-cards',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: Math.max(14, Math.ceil(items.length / 3) * 8 + 4),
        props: { title: '', subtitle: '', columns: 3, items },
      },
    ],
  };
}

// ── 화면 ────────────────────────────────────────────────────────────────────

/**
 * ① 종합 현황 — 「sample page/종합 현황.html」의 배치를 그대로 옮긴 화면.
 *
 * 양식의 순서: 작은 카드 셋 → 접수 추이 둘 → 교차 히트맵 둘 → 분류별 누적 막대 둘 →
 * 파레토 한 줄 → 목록 한 줄. 양식과 다른 곳은 두 군데뿐이고, 이유는 이렇다.
 *
 *   · **맨 위 조회 기간 필터** — 양식은 카드마다 'Last 7 months' 상자를 달아 뒀지만, 이 앱의
 *     차트는 화면 하나가 같은 기간 위에서 조회된다(지표끼리 다른 구간을 보면 안 된다).
 *     그래서 카드마다 두는 대신 화면 맨 위에 하나 두고 전부가 그것을 따른다.
 *   · **맨 아래 화면 바로가기** — 양식에는 없다. 홈에서 어느 화면으로도 갈 수 없으면 구성 검증이
 *     나머지를 '도달할 수 없는 페이지'로 잡는다(W-REL-007). 양식의 내용 뒤에 덧붙여 둔다.
 */
function overview(): SitePage {
  const p = period('rcv_date');
  /** 마감이 코앞인 건 — 오늘부터 임박 기준선(서버가 넣는 `soon`) 사이. */
  const dueSoon: FilterPlan[] = [
    { col: 'due_date', op: 'gte', source: 'query', ref: 'today' },
    { col: 'due_date', op: 'lte', source: 'query', ref: 'soon' },
  ];

  return {
    slug: 'overview',
    title: '종합 현황',
    icon: 'gauge',
    isHome: true,
    nodes: [
      { type: 'date-range-filter', col: 1, span: 12, row: 1, rowSpan: 3, props: { title: '조회 기간', defaultPreset: '12m', showPresets: true, showCustom: true } },

      // ── 작은 카드 셋 ────────────────────────────────────────────────────
      {
        type: 'callout',
        col: 1,
        span: 4,
        row: 4,
        rowSpan: 7,
        props: {
          text: '상세 분석 인계 현황 — 설계 문서에서 미구현으로 표시된 자리입니다.',
          tone: 'info',
        },
      },
      {
        type: 'stat-tile',
        col: 5,
        span: 4,
        row: 4,
        rowSpan: 7,
        props: {
          title: 'TAT Meet율',
          unit: '건',
          secondaryLabel: '기한 내 처리',
          secondaryHigherIsBetter: true,
          percentMode: 'complement',
          target: null,
          targetLabel: '목표',
          lowerIsBetter: false,
          linkSlug: 'fa-status',
          linkParam: 'q',
          linkValue: '',
        },
        /**
         * 완료 시각을 적는 칸이 원장에 없어 '지킨 건'을 직접 셀 수 없다. 대신 **놓친 건**은
         * 정확히 셀 수 있다 — 마감일이 지났는데 아직 분석값이 들어오지 않은 건. 그것을 세고
         * 전체에서 뺀 비율을 보여 준다(percentMode: complement).
         *
         * 아직 마감 전인 건을 '지킨 것'으로 세지 않는 이유: 그 기준으로는 한 해치 이력이 쌓인
         * 지금 7.6%가 나온다 — 대부분이 마감일을 이미 지난 과거 건이라서다. 그 숫자는 준수율이
         * 아니라 '최근에 들어온 건의 비중'을 말한다.
         */
        bind: {
          mode: 'aggregate',
          table: 'far_table',
          fn: 'count',
          filters: [overdue, { col: 'firmware', op: 'isNull', source: 'fixed' }, ...p],
          compare: false,
          secondaryFilters: p,
        },
      },
      {
        type: 'nav-cards',
        col: 9,
        span: 4,
        row: 4,
        rowSpan: 7,
        props: {
          title: 'Claim 할당 현황',
          subtitle: '',
          columns: 1,
          items: [{ title: '현황 보기로 이동', description: '담당자 지정 · 인수인계', slug: 'fa-assign', meta: '' }],
        },
      },

      // ── 접수 추이 둘 ────────────────────────────────────────────────────
      {
        type: 'chart-stacked',
        col: 1,
        span: 6,
        row: 11,
        rowSpan: 13,
        props: { title: '주간 접수', subtitle: '', unit: '건', yLabel: '', maxSeries: 6, showLegend: true },
        bind: {
          mode: 'group',
          table: 'far_table',
          groupField: 'rcv_date',
          groupTransform: 'week',
          seriesField: 'failmode1',
          fn: 'count',
          filters: p,
          orderBy: 'label',
          limit: 16,
        },
      },
      {
        type: 'stat-moving-average',
        col: 7,
        span: 6,
        row: 11,
        rowSpan: 13,
        // 월간 접수는 막대, 3개월 이동평균은 선(사용자 지정) — '이번 달 얼마'와 '흐름'이 갈린다.
        props: { title: '월간 접수 변동 (3개월 이동 평균)', window: 3, yLabel: '', baseAs: 'bar', baseLabel: '월간 접수' },
        bind: { mode: 'group', table: 'far_table', groupField: 'rcv_date', groupTransform: 'month', fn: 'count', filters: p, orderBy: 'label', limit: 24 },
      },

      // ── 교차 히트맵 둘 ──────────────────────────────────────────────────
      {
        type: 'stat-crosstab',
        col: 1,
        span: 6,
        row: 24,
        rowSpan: 14,
        props: { title: 'Fail Mode × NAND', subtitle: '', maxColumns: 8, showLegend: true },
        bind: { mode: 'group', table: 'far_table', groupField: 'failmode1', seriesField: 'nand', fn: 'count', filters: p, orderBy: 'value', limit: 10 },
      },
      {
        type: 'stat-crosstab',
        col: 7,
        span: 6,
        row: 24,
        rowSpan: 14,
        props: { title: 'Fail Mode × CTRL', subtitle: '', maxColumns: 8, showLegend: true },
        bind: { mode: 'group', table: 'far_table', groupField: 'failmode1', seriesField: 'ctrl', fn: 'count', filters: p, orderBy: 'value', limit: 10 },
      },

      // ── 분류별 누적 막대 둘 ─────────────────────────────────────────────
      {
        type: 'chart-stacked',
        col: 1,
        span: 6,
        row: 38,
        rowSpan: 15,
        props: { title: '고객사 별 접수 (Top 10)', subtitle: '', unit: '건', yLabel: '', maxSeries: 6, showLegend: true },
        bind: { mode: 'group', table: 'far_table', groupField: 'cust_name', seriesField: 'failmode1', fn: 'count', filters: p, orderBy: 'value', limit: 10 },
      },
      {
        type: 'chart-stacked',
        col: 7,
        span: 6,
        row: 38,
        rowSpan: 15,
        props: { title: '제품 별 접수', subtitle: '', unit: '건', yLabel: '', maxSeries: 6, showLegend: true },
        bind: { mode: 'group', table: 'far_table', groupField: 'device', seriesField: 'failmode1', fn: 'count', filters: p, orderBy: 'value', limit: 10 },
      },

      // ── 파레토 한 줄 ────────────────────────────────────────────────────
      {
        type: 'stat-pareto',
        col: 1,
        span: 12,
        row: 53,
        rowSpan: 14,
        props: { title: 'TAT 현황', subtitle: '마감을 넘긴 건을 담당자별로 — 점선은 누적 80%', yLabel: '' },
        bind: { mode: 'group', table: 'far_table', groupField: 'name', fn: 'count', filters: [overdue, ...p], orderBy: 'value', limit: 12 },
      },

      // ── TAT 임박 목록 ───────────────────────────────────────────────────
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 67,
        rowSpan: 21,
        props: {
          title: 'TAT 임박 List',
          showSearch: true,
          showExport: true,
          showCopy: true,
          selectable: false,
          density: 'default',
          emptyText: '일주일 안에 마감인 건이 없습니다',
          selectParam: 'sel',
          selectFieldId: 'far_no',
          selectSlug: 'fa-status',
        },
        /**
         * 양식의 마지막 칸은 'TAT 현황'이지만 원장에 그런 상태 컬럼이 없다. 지어내는 대신
         * 근거가 되는 **마감일**을 그 자리에 둔다 — 이 목록은 이미 '일주일 안 마감'으로
         * 걸러져 있어 행마다 상태를 따로 적을 필요가 크지 않다.
         */
        headers: ['FAR No', 'Sample No', 'W/C', 'Part ID', '담당자', '접수일', '마감일'],
        bind: {
          mode: 'list',
          table: 'far_table',
          select: ['far_no', 'sample_no', 'comp_wc', 'part_id', 'name', 'rcv_date', 'due_date'],
          filters: [
            { col: 'far_no', cols: ['far_no', 'cust_name', 'device', 'part_id'], op: 'contains', source: 'query', ref: 'q' },
            ...dueSoon,
          ],
          sort: [['due_date', 'asc']],
          pageSize: 30,
        },
      },

      {
        type: 'nav-cards',
        col: 1,
        span: 12,
        row: 88,
        rowSpan: 16,
        props: {
          title: '화면 바로가기',
          subtitle: '',
          columns: 4,
          items: [
            { title: '접수 / 분석 현황', description: '담당자 지정 · 분석 진행', slug: 'intake', meta: '' },
            { title: 'Reball', description: '의뢰서 작성 · 진행 현황', slug: 'reball', meta: '' },
            { title: '분석 의뢰서', description: '유형별 의뢰서', slug: 'request', meta: '' },
            { title: '주요 Issue', description: '이슈 기록', slug: 'issues', meta: '' },
            { title: '정보', description: '제품 정보 · 분석 Tip · 계산기', slug: 'info', meta: '' },
            { title: '분석 Infra 관리', description: '장비 · 기능 요구사항', slug: 'infra', meta: '' },
            { title: '접속자 통계', description: '일간 접속자 · 화면별 이용률', slug: 'visit-stats', meta: '' },
            { title: '피드백 게시판', description: '개선 요청 · 불편 접수', slug: 'feedback', meta: '' },
          ],
        },
      },
    ],
  };
}

/** ②-1 FA Assign — 최초 접수 시 담당자를 지정하고, 인수인계할 때 담당자를 바꾼다. */
function faAssign(): SitePage {
  return {
    slug: 'fa-assign',
    title: 'FA Assign',
    icon: 'user-check',
    nodes: [
      callout(
        1,
        '왼쪽 목록에서 행을 고르면 오른쪽에 그 건의 정보가 열립니다. 담당자는 같은 FAR No의 모든 sample에 함께 적용되며, 인수인계도 같은 자리에서 이름만 바꾸면 됩니다.',
        'info',
        4
      ),

      kpi(1, 5, '담당자 미지정', 'far_table', 'count', [{ col: 'name', op: 'isNull', source: 'fixed' }]),
      kpi(4, 5, '담당자 지정 완료', 'far_table', 'count', [{ col: 'name', op: 'isNotNull', source: 'fixed' }]),
      kpi(7, 5, '마감 초과', 'far_table', 'count', [overdue]),
      kpi(10, 5, '전체 Sample', 'far_table', 'count', []),

      search(12, 1, 5, 'FAR 검색', 'FAR No · 고객명 · 제품명 · Part ID'),
      pickFilter(12, 6, 3, '담당자', 'name', '전체 담당자', groupBy('far_table', 'name')),
      pickFilter(12, 9, 4, '고객사', 'cust', '전체 고객사', groupBy('far_table', 'cust_name')),

      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 15,
        rowSpan: 30,
        props: {
          title: '접수 목록',
          showSearch: false,
          showExport: false,
          selectable: false,
          density: 'compact',
          emptyText: '조건에 맞는 접수 건이 없습니다',
          selectParam: 'sel',
          selectFieldId: 'far_no',
        },
        headers: ['FAR No', 'Sample', '접수일', '마감일', '고객명', '제품명', '담당자'],
        bind: {
          mode: 'list',
          table: 'far_table',
          select: ['far_no', 'sample_no', 'rcv_date', 'due_date', 'cust_name', 'device', 'name'],
          filters: [
            { col: 'far_no', cols: ['far_no', 'cust_name', 'device', 'part_id'], op: 'contains', source: 'query', ref: 'q' },
            byParam('name', 'name'),
            byParam('cust_name', 'cust'),
          ],
          sort: [['rcv_date', 'desc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 15,
        rowSpan: 16,
        props: { title: '선택한 접수 건', emptyText: '왼쪽 목록에서 FAR No를 고르세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'far_table',
          select: ['far_no', 'cust_name', 'name', 'sample_no', 'rcv_date', 'due_date', 'part_id', 'device', 'app', 'failmode1', 'failmode2', 'fail_loc'],
          filters: [selected('far_no')],
          sort: [['sample_no', 'asc']],
          pageSize: 1,
        },
      },
      {
        type: 'form-card',
        col: 8,
        span: 5,
        row: 31,
        rowSpan: 14,
        props: {
          title: '담당자 지정 · 변경',
          description: '고른 FAR No의 모든 sample에 적용됩니다.',
          columns: 1,
          footnote: '인수인계도 이 자리에서 새 담당자 이름으로 바꾸면 됩니다.',
        },
        children: [textInput('assign-name', '분석 담당자', 'text', '예: 홍길동'), submitButton('담당자 저장', 'fa-assign')],
      },
    ],
  };
}

/** ②-2 분석 현황 — 분석 중인 정보를 조회하고 담당자를 확인한다. 분석값 이력도 여기서 본다. */
function faStatus(): SitePage {
  return {
    slug: 'fa-status',
    title: '분석 현황',
    icon: 'clipboard-list',
    nodes: [
      kpi(1, 1, '분석값 등록', 'far_table', 'count', [{ col: 'firmware', op: 'isNotNull', source: 'fixed' }], {
        secondary: { label: '미등록', filters: [{ col: 'firmware', op: 'isNull', source: 'fixed' }] },
      }),
      kpi(4, 1, 'Init Fail', 'far_table', 'count', [{ col: 'init', op: 'eq', source: 'fixed', value: 0 }]),
      kpi(7, 1, '평균 SLC EC', 'far_table', 'avg', [{ col: 'slc_avg_ec', op: 'isNotNull', source: 'fixed' }], { unit: '회' }, 'slc_avg_ec'),
      kpi(10, 1, '평균 Write', 'far_table', 'avg', [{ col: 'write_size', op: 'isNotNull', source: 'fixed' }], { unit: 'GB' }, 'write_size'),

      search(8, 1, 4, '통합 검색', 'FAR No · 고객명 · 제품명 · Firmware'),
      pickFilter(8, 5, 3, '담당자', 'name', '전체 담당자', groupBy('far_table', 'name')),
      pickFilter(8, 8, 3, '불량 대분류', 'fm', '전체 불량 모드', groupBy('far_table', 'failmode1')),
      // FAR 원장 전체를 서버가 만들어 주는 CSV. 표 위 CSV 단추는 지금 화면에 올라온 행만
      // 담으므로(쪽 단위 조회), 원장을 통째로 받는 길은 따로 남겨 둔다.
      // 아래 표가 11줄부터 시작하므로 여기서는 필터와 같은 3줄로 맞춘다.
      exportButton(8, 11, 2, 'far-export', 3),

      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 11,
        rowSpan: 30,
        props: {
          title: '분석 대상 목록',
          showSearch: false,
          showExport: false,
          selectable: false,
          density: 'compact',
          emptyText: '조건에 맞는 건이 없습니다',
          selectParam: 'sel',
          selectFieldId: 'far_no',
        },
        headers: ['FAR No', 'Sample', '담당자', '고객명', '제품명', '불량 대분류', 'Firmware', '마감일'],
        bind: {
          mode: 'list',
          table: 'far_table',
          select: ['far_no', 'sample_no', 'name', 'cust_name', 'device', 'failmode1', 'firmware', 'due_date'],
          filters: [
            { col: 'far_no', cols: ['far_no', 'cust_name', 'device', 'firmware'], op: 'contains', source: 'query', ref: 'q' },
            byParam('name', 'name'),
            byParam('failmode1', 'fm'),
          ],
          sort: [['due_date', 'asc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 11,
        rowSpan: 30,
        props: { title: '선택한 건 — 접수 · 제품 정보', emptyText: '왼쪽 목록에서 FAR No를 고르세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'far_table',
          select: [
            'far_no', 'cust_name', 'name',
            'sample_no', 'rcv_date', 'due_date', 'part_id', 'app', 'device', 'ctrl', 'nand', 'dram',
            'fbga', 'density', 'lot_id', 'comp_wc', 'fail_loc', 'failmode1', 'failmode2', 'fail_symptom',
            'visual_inspaction_top', 'visual_inspaction_bottom',
          ],
          filters: [selected('far_no')],
          sort: [['sample_no', 'asc']],
          pageSize: 1,
        },
      },

      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 41,
        rowSpan: 22,
        props: {
          title: '선택한 FAR No의 sample별 분석값 (지금 값)',
          showSearch: false,
          showExport: false,
          selectable: false,
          density: 'compact',
          emptyText: '위 목록에서 FAR No를 고르면 sample별 분석값이 나옵니다',
          selectParam: '',
          selectFieldId: '',
          selectSlug: '',
        },
        headers: ['Sample', 'Firmware', 'Init', 'SLC Avg EC', 'MLC Avg EC', 'Open', 'RTBB', 'Reclaim', 'Write(GB)', 'Read(GB)', 'SPOR', 'ECID'],
        bind: {
          mode: 'list',
          table: 'far_table',
          select: ['sample_no', 'firmware', 'init', 'slc_avg_ec', 'mlc_avg_ec', 'open_count', 'rtbb_count', 'reclaim_count', 'write_size', 'read_size', 'spor_count', 'ecid'],
          filters: [selected('far_no')],
          sort: [['sample_no', 'asc']],
          pageSize: 50,
        },
      },

      callout(
        63,
        '분석값은 분석 Tool이 여러 번 갱신할 수 있습니다. 갱신될 때마다 그 시점의 값 전부가 아래 이력에 한 줄로 쌓이며, 이력은 고쳐 쓰거나 지울 수 없습니다.',
        'good',
        4
      ),
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 67,
        rowSpan: 24,
        props: {
          title: '분석값 기록 이력 — 회차별 그때의 값',
          showSearch: false,
          showExport: false,
          selectable: false,
          density: 'compact',
          emptyText: '위 목록에서 FAR No를 고르면 기록 이력이 나옵니다',
          selectParam: '',
          selectFieldId: '',
          selectSlug: '',
        },
        headers: ['Sample', '회차', '기록 시각', '기록 주체', 'Firmware', 'Init', 'SLC Avg EC', 'MLC Avg EC', 'Open', 'RTBB', 'Write(GB)', 'ECID'],
        bind: {
          mode: 'list',
          table: 'far_analysis_log',
          select: ['sample_no', 'rev', 'recorded_at', 'source', 'firmware', 'init', 'slc_avg_ec', 'mlc_avg_ec', 'open_count', 'rtbb_count', 'write_size', 'ecid'],
          filters: [selected('far_no')],
          // sample끼리 섞지 않고 묶어서, 각 sample 안에서 최신 회차부터 본다. 시각 하나로만
          // 정렬하면 여러 sample의 기록이 번갈아 나와 "이 sample이 어떻게 변해 왔는지"가 안 보인다.
          sort: [['sample_no', 'asc'], ['rev', 'desc']],
          pageSize: 50,
        },
      },
    ],
  };
}

/**
 * ②-4 Tech Report 작성 — 양식(`sample page/tech report page.html`)의 배치를 그대로 옮겼다.
 *
 * 화면 전체가 컴포넌트 하나다. 카드 스무 장으로 쪼개지 않은 이유는 TechReport.tsx의 주석 참고 —
 * FAR No 하나를 불러오면 모든 탭이 함께 채워지고, 어느 칸을 고치든 같은 문서가 저장되며,
 * 내보내기는 탭 전체를 한 번에 인쇄한다. 셋 다 화면을 가로지르는 동작이다.
 */
function techReport(): SitePage {
  return {
    slug: 'tech-report',
    title: 'Tech Report 작성',
    icon: 'file-text',
    nodes: [
      {
        type: 'tech-report',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 90,
        // 바인딩이 아니라 전용 창구(/api/runtime/tech-report)로 오간다 — 관계도에는 남긴다.
        reads: ['far_table', 'tech_report', 'tech_report_sample'],
        props: { title: '', description: '' },
      },
    ],
  };
}

/**
 * ③-1 Reball 의뢰서 작성 — 표 한 장에 여러 건을 적고 한 번에 등록한다(사용자 지정, 2026-08-29).
 *
 * 예전에는 왼쪽에 폼 카드, 오른쪽에 작업·단가 카드를 두고 **한 건씩** 등록했다. 실제 의뢰는 한
 * 번에 서너 건이 함께 나가는데 그때마다 반출 번호·담당자·일정을 다시 적어야 했다. 표로 두면
 * 위 줄을 본떠 새 줄이 생기고 다른 곳만 고치면 된다. 등록 전에 그대로 복사해 메일에 붙일 수도 있다.
 *
 * 단가를 고치는 자리(작업·단가 카드)는 표 아래에 그대로 남겨 둔다 — 단가표는 이 화면에서
 * 고칠 수 있어야 한다는 설계 문서의 요구가 살아 있다.
 */
function reballRequest(): SitePage {
  const costBind: BindPlan = {
    mode: 'list',
    table: 'reball_cost_table',
    select: ['upper_200ball', 'under_200ball', 'component_detach', 'underfill', 'grinding', 'urgent'],
    filters: [],
    sort: [],
    pageSize: 1,
  };

  return {
    slug: 'reball-request',
    title: 'Reball 의뢰서 작성',
    icon: 'file-plus',
    nodes: [
      {
        key: 'rb-rows',
        type: 'reball-request-table',
        col: 1,
        span: 12,
        row: 1,
        // 줄을 더하면 표가 알아서 늘어난다(growsWithContent) — 여기 값은 한 줄짜리 표의 높이다.
        rowSpan: 12,
        props: {
          title: 'Reball 의뢰서',
          description: '한 줄이 의뢰 한 건입니다. 금액은 고른 작업과 단가표에서 자동 계산되며, 등록 전에 표를 그대로 복사해 메일에 붙일 수 있습니다.',
        },
        bind: costBind,
        on: { onSubmit: 'reball-create' },
      },
      {
        type: 'reball-cost',
        col: 1,
        span: 12,
        row: 13,
        // 접힌 채로 시작하므로 처음 높이는 제목 한 줄이면 된다 — 펴면 내용만큼 늘어난다.
        rowSpan: 5,
        props: {
          title: '단가 확인 · 수정',
          description: '위 표의 금액이 따르는 단가표입니다. 눌러서 펴면 값을 고칠 수 있고, 고친 값은 이후 작성하는 의뢰서에 바로 반영됩니다.',
          defaultOver200ball: true,
          collapsible: true,
        },
        bind: costBind,
      },
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 18,
        rowSpan: 22,
        props: {
          title: '최근 등록한 의뢰',
          showSearch: false,
          showExport: false,
          showCopy: false,
          selectable: false,
          density: 'compact',
          emptyText: '아직 등록된 의뢰가 없습니다',
          selectParam: 'sel',
          selectFieldId: 'far_no',
          selectSlug: 'reball-status',
        },
        headers: ['FAR No', '일정', '담당자', 'PJT', '반출 번호', '긴급', '200ball 이상', '시료 수', '시료당', '총액'],
        formats: [null, null, null, null, null, null, null, null, 'currency', 'currency'],
        bind: {
          mode: 'list',
          table: 'reball_table',
          select: ['far_no', 'date', 'name', 'pjt', 'export_no', 'urgent', 'over_200ball', 'count', 'per_cost', 'total_cost'],
          filters: [],
          sort: [['date', 'desc']],
          pageSize: 20,
        },
      },
    ],
  };
}

/** ③-2 Reball 현황 — 등록된 의뢰의 일정·비용·담당을 본다. */
function reballStatus(): SitePage {
  const p = period('date');
  return {
    slug: 'reball-status',
    title: 'Reball 현황',
    icon: 'list-checks',
    nodes: [
      { type: 'date-range-filter', col: 1, span: 12, row: 1, rowSpan: 3, props: { title: '조회 기간(Reball 일정)', defaultPreset: '12m', showPresets: true, showCustom: true } },

      kpi(1, 4, '의뢰 건수', 'reball_table', 'count', p, {
        compare: true,
        secondary: { label: '긴급', filters: [{ col: 'urgent', op: 'eq', source: 'fixed', value: 1 }, ...p] },
      }),
      kpi(4, 4, '시료 수', 'reball_table', 'sum', p, { unit: '개' }, 'count'),
      kpi(7, 4, '총 비용', 'reball_table', 'sum', p, { unit: '원', compare: true }, 'total_cost'),
      kpi(10, 4, '평균 시료당 단가', 'reball_table', 'avg', p, { unit: '원' }, 'per_cost'),

      {
        type: 'chart',
        col: 1,
        span: 6,
        row: 11,
        rowSpan: 14,
        props: { title: '월별 의뢰 추이', chartType: 'line', color: 'primary', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'reball_table', groupField: 'date', groupTransform: 'month', fn: 'count', filters: p, orderBy: 'label', limit: 60 },
      },
      {
        type: 'chart',
        col: 7,
        span: 6,
        row: 11,
        rowSpan: 14,
        props: { title: '담당자별 총 비용', chartType: 'bar-horizontal', color: 'accent', unit: '원', yLabel: '' },
        bind: { mode: 'group', table: 'reball_table', groupField: 'name', fn: 'sum', valueField: 'total_cost', filters: p, orderBy: 'value', limit: 12 },
      },

      search(25, 1, 4, '의뢰 검색', 'FAR No · 담당자 · PJT · 반출 번호', 4),
      pickFilter(25, 5, 3, '담당자', 'name', '전체 담당자', groupBy('reball_table', 'name'), 4),
      pickFilter(25, 8, 3, 'PJT', 'pjt', '전체 PJT', groupBy('reball_table', 'pjt'), 4),
      exportButton(25, 11, 2, 'reball-export'),

      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 29,
        rowSpan: 26,
        props: {
          title: '의뢰 목록',
          showSearch: false,
          showExport: false,
          selectable: false,
          density: 'compact',
          emptyText: '조건에 맞는 의뢰가 없습니다',
          selectParam: 'sel',
          selectFieldId: 'far_no',
        },
        headers: ['FAR No', '일정', '담당자', 'PJT', '시료 수', '총액'],
        formats: [null, null, null, null, null, 'currency'],
        bind: {
          mode: 'list',
          table: 'reball_table',
          select: ['far_no', 'date', 'name', 'pjt', 'count', 'total_cost'],
          filters: [
            { col: 'far_no', cols: ['far_no', 'name', 'pjt', 'export_no'], op: 'contains', source: 'query', ref: 'q' },
            byParam('name', 'name'),
            byParam('pjt', 'pjt'),
            ...p,
          ],
          sort: [['date', 'desc']],
          pageSize: 50,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 29,
        rowSpan: 26,
        props: { title: '선택한 의뢰', emptyText: '왼쪽 목록에서 의뢰를 고르세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'reball_table',
          select: [
            'far_no', 'date', 'name', 'pjt', 'export_no', 'urgent',
            'is_reball', 'is_component_detach', 'is_underfill', 'is_grinding',
            'over_200ball', 'count', 'per_cost', 'total_cost', 'handling',
          ],
          filters: [selected('far_no')],
          sort: [['date', 'desc']],
          pageSize: 1,
        },
      },
    ],
  };
}

/** ⑥-5 분석 Tip · ⑦-2 기능 요구사항 · ⑨ 피드백 — 슬랙형 대화 게시판. */
function boardPage(slug: string, title: string, icon: string, boardKey: string, boardTitle: string, description: string): SitePage {
  return {
    slug,
    title,
    icon,
    nodes: [
      {
        type: 'board',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 44,
        props: { title: boardTitle, description, boardKey, pageSize: 10, allowWrite: true, searchable: true, categories: '' },
      },
    ],
  };
}

/** ⑥-7 불량률 계산기. */
function failRate(): SitePage {
  return {
    slug: 'info-fail-rate',
    title: '불량률 계산기',
    icon: 'calculator',
    nodes: [
      {
        type: 'fail-rate-calculator',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 36,
        props: {
          title: '',
          description: 'AFR · DPPM · 신뢰구간을 계산합니다. 입력한 값은 저장되지 않습니다.',
          defaultSample: 10000,
          defaultFailures: 3,
        },
      },
      callout(
        37,
        '불량률·DPPM은 Wilson score(일상 보고용)와 Clopper–Pearson(정확 구간, 보수적)을 함께 보여줍니다. AFR·FIT·MTBF는 χ²(2r+2) 기반 단측 상한을 함께 계산해, 고장이 0건이어도 "이보다 나쁠 수는 없다"를 숫자로 남깁니다.',
        'info',
        5
      ),
    ],
  };
}

/** ⑧ 접속자 통계. */
function visitStats(): SitePage {
  return {
    slug: 'visit-stats',
    title: '접속자 통계',
    icon: 'chart-line',
    nodes: [
      {
        type: 'visit-stats',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 44,
        props: {
          title: '',
          description: '운영 화면이 열린 횟수를 셉니다. 개인을 식별하는 정보는 남기지 않습니다.',
          days: 30,
        },
      },
    ],
  };
}

/**
 * ⑨ 피드백 게시판 — **그대로 둔다**.
 *
 * 이번 재구성에서 유일하게 살아남는 화면이다(사용자 지시). `boardKey`를 예전 노드 id로 못 박아
 * 배치를 다시 만들어도 쌓인 대화가 그대로 딸려 온다.
 */
const LEGACY_FEEDBACK_BOARD_KEY = 'cmsyqb57z006xakesh6bdop8u';

function feedback(): SitePage {
  return boardPage(
    'feedback',
    '피드백 게시판',
    'message-square',
    LEGACY_FEEDBACK_BOARD_KEY,
    '피드백 대화',
    '개선 요청과 불편을 자유롭게 남겨 주세요. 화면·재현 조건·스크린샷이 함께 있으면 훨씬 빨리 반영됩니다.'
  );
}

// ── 전체 구성 ───────────────────────────────────────────────────────────────

export function buildSite(): SitePage[] {
  return [
    overview(),
    {
      ...hub('intake', '접수 / 분석 현황', 'microscope', [
        { title: 'FA Assign', description: '최초 접수 담당자 지정 · 인수인계', slug: 'fa-assign', meta: '' },
        { title: '분석 현황', description: '분석 중인 정보 조회 · 담당자 확인', slug: 'fa-status', meta: '' },
        { title: 'DRAM 평가 현황(LF)', description: '미구현', slug: 'dram-lf', meta: '' },
        { title: 'Tech Report 작성', description: 'FAR 불러오기 · sample별 작성 · PDF 발행', slug: 'tech-report', meta: '' },
      ]),
      children: [
        faAssign(),
        faStatus(),
        unbuilt('dram-lf', 'DRAM 평가 현황(LF)', 'memory-stick', 'DRAM LF 평가 현황을 보여줄 자리입니다'),
        techReport(),
      ],
    },
    {
      ...hub('reball', 'Reball', 'cpu', [
        { title: 'Reball 의뢰서 작성', description: '작업 항목 선택 · 단가 자동 계산', slug: 'reball-request', meta: '' },
        { title: 'Reball 현황', description: '일정 · 비용 · 담당 현황', slug: 'reball-status', meta: '' },
        { title: '이력 조사 양식', description: '미구현', slug: 'reball-history', meta: '' },
      ]),
      children: [
        reballRequest(),
        reballStatus(),
        unbuilt('reball-history', '이력 조사 양식', 'history', '이력 조사 양식을 작성하는 자리입니다'),
      ],
    },
    {
      ...hub('request', '분석 의뢰서', 'send', [
        { title: '비 파괴 분석', description: '미구현', slug: 'req-nde', meta: '' },
        { title: '파괴 분석', description: '미구현', slug: 'req-de', meta: '' },
        { title: 'DRAM HF 평가', description: '미구현', slug: 'req-dram-hf', meta: '' },
      ]),
      children: [
        unbuilt('req-nde', '비 파괴 분석', 'scan', '비파괴 분석 의뢰서를 작성하는 자리입니다'),
        unbuilt('req-de', '파괴 분석', 'scissors', '파괴 분석 의뢰서를 작성하는 자리입니다'),
        unbuilt('req-dram-hf', 'DRAM HF 평가', 'activity', 'DRAM HF 평가 의뢰서를 작성하는 자리입니다'),
      ],
    },
    {
      slug: 'issues',
      title: '주요 Issue',
      icon: 'triangle-alert',
      nodes: [
        callout(
          1,
          '주요 이슈를 공통 포맷으로 기록하는 자리입니다 — 설계 문서에서 사용자가 + 버튼으로 페이지를 직접 추가할 수 있어야 한다고 적힌 곳이며, 지금은 메뉴 자리만 잡아 두었습니다.',
          'info',
          5
        ),
      ],
    },
    {
      ...hub('info', '정보', 'book-open', [
        { title: 'PKG Stack 정보', description: '미구현', slug: 'info-pkg-stack', meta: '' },
        { title: '제품 정보', description: '미구현', slug: 'info-product', meta: '' },
        { title: 'NAND Parameter', description: '미구현', slug: 'info-nand-param', meta: '' },
        { title: 'NAND WF Map', description: '미구현', slug: 'info-nand-wf', meta: '' },
        { title: '분석 Tip', description: '분석 노하우를 주고받는 대화', slug: 'info-tips', meta: '' },
        { title: '유사 산포 검색', description: '미구현', slug: 'info-similar', meta: '' },
        { title: '불량률 계산기', description: 'AFR · DPPM · 신뢰구간', slug: 'info-fail-rate', meta: '' },
      ]),
      children: [
        unbuilt('info-pkg-stack', 'PKG Stack 정보', 'layers', 'PKG Stack 구조 정보를 보여줄 자리입니다'),
        unbuilt('info-product', '제품 정보', 'package', '제품 정보를 보여줄 자리입니다'),
        unbuilt('info-nand-param', 'NAND Parameter', 'sliders-horizontal', 'NAND 파라미터를 보여줄 자리입니다'),
        unbuilt('info-nand-wf', 'NAND WF Map', 'grid-3x3', 'NAND Wafer Map을 보여줄 자리입니다'),
        boardPage('info-tips', '분석 Tip', 'lightbulb', 'tips-board', '분석 Tip 대화', '분석 중에 알게 된 것을 짧게 주고받습니다. 이미지도 붙여넣을 수 있습니다.'),
        unbuilt('info-similar', '유사 산포 검색', 'search', '유사 산포를 검색하는 자리입니다'),
        failRate(),
      ],
    },
    {
      ...hub('infra', '분석 Infra 관리', 'server', [
        { title: 'Tester History', description: '미구현 (Git history 연동 예정)', slug: 'infra-tester', meta: '' },
        { title: '기능 요구사항', description: '필요한 기능을 남기는 대화', slug: 'infra-request', meta: '' },
        { title: 'HW 보유 현황', description: '미구현', slug: 'infra-hw', meta: '' },
      ]),
      children: [
        unbuilt('infra-tester', 'Tester History', 'git-branch', 'Tester의 변경 이력을 Git history에서 가져와 보여줄 자리입니다'),
        boardPage('infra-request', '기능 요구사항', 'message-square-plus', 'infra-request-board', '기능 요구사항 대화', '필요한 기능과 개선점을 남겨 주세요.'),
        unbuilt('infra-hw', 'HW 보유 현황', 'hard-drive', '분석 장비 보유 현황을 보여줄 자리입니다'),
      ],
    },
    visitStats(),
    feedback(),
  ];
}

// ── 동작 ────────────────────────────────────────────────────────────────────

/**
 * 화면 사이 이동은 **사이드바와 바로가기 카드**가 맡는다 — 페이지 머리 카드를 걷어내면서
 * 거기 붙어 있던 이동 버튼(그리고 그 버튼만 쓰던 NAVIGATE 동작)도 함께 정리했다. 같은 곳으로
 * 가는 길이 셋이면 어느 것도 눈에 들어오지 않는다.
 */
export function buildActions(): ActionPlan[] {
  return [
    {
      key: 'fa-assign',
      name: 'FA 담당자 지정',
      desc: '고른 FAR No의 모든 sample에 분석 담당자를 지정한다(인수인계 시 변경도 같은 동작)',
      kind: 'UPDATE',
      table: 'far_table',
      keyCol: 'far_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: { name: { from: 'component', node: 'assign-name' } },
    },
    {
      key: 'reball-create',
      name: 'Reball 의뢰 등록',
      desc: '의뢰 정보와 작업 항목을 저장한다 — 시료당 가격·총액은 단가표를 참조해 계산된 값이 그대로 들어간다',
      kind: 'CREATE',
      table: 'reball_table',
      values: {
        // 값은 전부 의뢰 표의 **한 줄**에서 온다. 표는 줄을 하나씩 넘기며 이 액션을 여러 번
        // 실행한다 — 어떤 칸이 어느 컬럼으로 가는지는 여기(배포된 스펙)가 계속 갖고 있다.
        far_no: { from: 'component', node: 'rb-rows', path: 'far_no' },
        export_no: { from: 'component', node: 'rb-rows', path: 'export_no' },
        name: { from: 'component', node: 'rb-rows', path: 'name' },
        pjt: { from: 'component', node: 'rb-rows', path: 'pjt' },
        date: { from: 'component', node: 'rb-rows', path: 'date' },
        urgent: { from: 'component', node: 'rb-rows', path: 'urgent' },
        is_reball: { from: 'component', node: 'rb-rows', path: 'is_reball' },
        is_component_detach: { from: 'component', node: 'rb-rows', path: 'is_component_detach' },
        is_underfill: { from: 'component', node: 'rb-rows', path: 'is_underfill' },
        is_grinding: { from: 'component', node: 'rb-rows', path: 'is_grinding' },
        over_200ball: { from: 'component', node: 'rb-rows', path: 'over_200ball' },
        count: { from: 'component', node: 'rb-rows', path: 'count' },
        per_cost: { from: 'component', node: 'rb-rows', path: 'per_cost' },
        total_cost: { from: 'component', node: 'rb-rows', path: 'total_cost' },
      },
    },

    { key: 'far-export', name: 'FAR 원장 CSV 내보내기', desc: 'FAR 원장을 CSV로 내려받는다', kind: 'EXPORT_CSV', table: 'far_table', filename: 'far_table.csv' },
    { key: 'reball-export', name: 'Reball 의뢰 CSV 내보내기', desc: 'Reball 의뢰 목록을 CSV로 내려받는다', kind: 'EXPORT_CSV', table: 'reball_table', filename: 'reball_table.csv' },
  ];
}
