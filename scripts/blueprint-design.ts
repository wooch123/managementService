/**
 * 청사진(estorage-desktop-blueprints) 16화면의 설계 — 이 파일이 "무엇을 어디에 놓을지"의 원본이다.
 *
 * 좌표는 12칼럼 기준이고 `row`/`rowSpan`은 위에서부터의 줄이다(줄 높이 8px + 줄 간격 16px이라
 * 실제 높이는 `rowSpan × 24 − 16`px). 겹침은 apply 스크립트가 검사한다.
 *
 * 청사진이 화면마다 반복해서 요구한 것 세 가지를 뼈대로 삼았다:
 *   ① 목록에서 고르면 그 항목의 상세·이력·다음 행동이 같은 화면에서 이어진다(주소의 `sel`).
 *   ② 식별번호를 사람이 적지 않는다(액션의 자동 번호).
 *   ③ 단순 건수보다 지연·부하·마감처럼 조치가 필요한 것을 위에 둔다.
 */
import type { ActionPlan, FilterPlan, NodePlan, PagePlan, EntityInfo } from './blueprint-lib';
import { enumOf } from './blueprint-lib';

type Schema = Map<string, EntityInfo>;

// ── 짧은 조립 도구 ──────────────────────────────────────────────────────────

/** 조회 기간 필터가 걸리는 두 조건(그 페이지에 기간 필터가 있을 때만 의미가 있다). */
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

/** 상태 세그먼트 필터가 거는 조건. 고르지 않았으면 제한 없음. */
const byParam = (col: string, param: string): FilterPlan => ({ col, op: 'eq', source: 'query', ref: param });

const title = (row: number, text: string, description: string): NodePlan => ({
  type: 'page-title',
  col: 1,
  span: 12,
  row,
  rowSpan: 2,
  props: { title: text, description },
});

const heading = (row: number, text: string): NodePlan => ({
  type: 'typography',
  col: 1,
  span: 12,
  row,
  rowSpan: 2,
  props: { variant: 'h4', text },
});

type KpiOptions = { unit?: string; color?: 'primary' | 'positive' | 'accent' | 'warning' | 'neutral'; compare?: boolean };

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
  type: 'chart',
  col,
  span: 3,
  row,
  rowSpan: 6,
  props: { title: text, chartType: 'bar', color: options.color ?? 'primary', unit: options.unit ?? '건', yLabel: '' },
  bind: { mode: 'aggregate', table, fn, field, filters, compare: options.compare ?? false },
});

const input = (key: string, col: number, row: number, span: number, label: string, type = 'text'): NodePlan => ({
  key,
  type: 'input',
  col,
  span,
  row,
  rowSpan: 4,
  props: { label, placeholder: '', type },
});

const pick = (key: string, col: number, row: number, span: number, label: string, options: string[]): NodePlan => ({
  key,
  type: 'option-select',
  col,
  span,
  row,
  rowSpan: 4,
  props: { label, placeholder: '선택하세요', options },
});

const note = (key: string, col: number, row: number, span: number, rowSpan: number, label: string, placeholder: string): NodePlan => ({
  key,
  type: 'textarea',
  col,
  span,
  row,
  rowSpan,
  props: { label, placeholder, rows: 3 },
});

const action = (
  col: number,
  row: number,
  span: number,
  label: string,
  actionKey: string,
  variant: 'default' | 'outline' | 'secondary' = 'default',
  rowSpan = 4
): NodePlan => ({
  type: 'button',
  col,
  span,
  row,
  rowSpan,
  props: { label, variant, size: 'default' },
  on: { onClick: actionKey },
});

// ── 페이지 ──────────────────────────────────────────────────────────────────

export function buildPages(schema: Schema): PagePlan[] {
  const claimStatus = enumOf(schema, 'claims', 'claim_status');
  const failModes = enumOf(schema, 'claims', 'fail_mode');
  const faStatusValues = enumOf(schema, 'fa_assignments', 'fa_status');
  const priority = enumOf(schema, 'fa_assignments', 'priority');
  const packages = enumOf(schema, 'reball_requests', 'package_type');
  const reqStatus = enumOf(schema, 'analysis_requests', 'req_status');
  const reqPriority = enumOf(schema, 'analysis_requests', 'priority');
  const tipCategory = enumOf(schema, 'tips', 'category');
  const destruct = enumOf(schema, 'analysis_requests', 'destruct_approval');

  return [
    claimDashboard(),
    claimAnalysis(claimStatus),
    faAssign(priority),
    faStatus(faStatusValues, priority),
    faTechReport(failModes),
    reballDashboard(),
    reballRequest(packages),
    reballStatus(),
    requestHub(reqPriority),
    ...REQUEST_TYPES.map((type) => requestPage(type, reqStatus, reqPriority, destruct)),
    tips(tipCategory),
    feedback(),
  ];
}

// ① Claim 종합 현황 — 차트 나열을 걷어내고 지연 위험을 위로 올린다.
function claimDashboard(): PagePlan {
  const p = period('received_date');
  return {
    slug: 'claim-dashboard',
    title: 'Claim 종합 현황',
    nodes: [
      title(1, 'eMMC · UFS Claim 통합 현황', '고른 기간의 접수 건을 대상으로, 지연 위험을 먼저 보여줍니다.'),
      { type: 'date-range-filter', col: 1, span: 10, row: 3, rowSpan: 3, props: { title: '조회 기간', defaultPreset: '3m', showPresets: true, showCustom: true } },
      action(11, 3, 2, 'CSV 내보내기', 'act-claim-export', 'outline', 3),
      kpi(1, 6, '총 접수 Claim', 'claims', 'count', p, { compare: true }),
      kpi(4, 6, '분석 진행 중', 'claims', 'count', [{ col: 'claim_status', op: 'in', source: 'fixed', value: ['접수', '배정', '분석중'] }, ...p], { compare: true }),
      kpi(7, 6, '평균 TAT', 'claims', 'avg', p, { unit: '일', color: 'warning', compare: true }, 'tat_days'),
      kpi(10, 6, '개발실 인계', 'claims', 'count', [{ col: 'dev_transfer', op: 'eq', source: 'fixed', value: 'Y' }, ...p], { color: 'positive', compare: true }),
      {
        type: 'chart',
        col: 1,
        span: 7,
        row: 12,
        rowSpan: 14,
        props: { title: '월별 Claim 접수 추이', chartType: 'line', color: 'primary', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'claims', groupField: 'received_date', groupTransform: 'month', fn: 'count', filters: p, orderBy: 'label', limit: 60 },
      },
      {
        // 청사진 ①의 핵심: "지연 건에 바로 접근할 수 없다" → 표 맨 아래가 아니라 추이 옆에 둔다.
        type: 'list-panel',
        col: 8,
        span: 5,
        row: 12,
        rowSpan: 14,
        props: { title: '지연 우선 대응', subtitle: 'TAT 20일 초과 · 오래된 순', emptyText: '지연 건이 없습니다', maxItems: 8, badgeSuffix: '일' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'fail_mode', 'owner', 'tat_days'],
          filters: [{ col: 'tat_days', op: 'gt', source: 'fixed', value: 20 }, ...p],
          sort: [['tat_days', 'desc']],
          pageSize: 8,
        },
      },
      {
        type: 'chart',
        col: 1,
        span: 3,
        row: 26,
        rowSpan: 13,
        props: { title: '제품군별 접수', chartType: 'bar', color: 'primary', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'claims', groupField: 'product_group', fn: 'count', filters: p, orderBy: 'value', limit: 20 },
      },
      {
        type: 'chart',
        col: 4,
        span: 5,
        row: 26,
        rowSpan: 13,
        props: { title: 'Fail Mode 분포', chartType: 'bar-horizontal', color: 'warning', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'claims', groupField: 'fail_mode', fn: 'count', filters: p, orderBy: 'value', limit: 20 },
      },
      {
        type: 'chart',
        col: 9,
        span: 4,
        row: 26,
        rowSpan: 13,
        props: { title: '고객사별 접수', chartType: 'bar-horizontal', color: 'accent', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'claims', groupField: 'customer', fn: 'count', filters: p, orderBy: 'value', limit: 20 },
      },
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 39,
        rowSpan: 24,
        props: { title: '최근 접수 Claim', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '데이터가 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'received_date', 'customer', 'product_group', 'fail_mode', 'severity', 'claim_status', 'owner', 'tat_days'],
          filters: p,
          sort: [['received_date', 'desc']],
          pageSize: 30,
        },
      },
    ],
  };
}

// ② Claim 분석 워크벤치 — 표+칸반 중복을 없애고 선택 상세로 후속 작업을 잇는다.
function claimAnalysis(claimStatus: string[]): PagePlan {
  return {
    slug: 'claim-analysis',
    title: 'Claim 분석',
    nodes: [
      title(1, 'Claim 분석 워크벤치', '목록에서 고르면 상세·FA 이력·후속 작업이 같은 화면에서 이어집니다.'),
      {
        type: 'status-filter',
        col: 1,
        span: 12,
        row: 3,
        rowSpan: 3,
        props: { title: '진행상태', param: 'status', options: [{ label: '전체', value: '' }, ...claimStatus.map((v) => ({ label: v, value: v }))] },
      },
      kpi(1, 6, '미배정(접수)', 'claims', 'count', [{ col: 'claim_status', op: 'eq', source: 'fixed', value: '접수' }]),
      kpi(4, 6, '분석 진행 중', 'claims', 'count', [{ col: 'claim_status', op: 'in', source: 'fixed', value: ['배정', '분석중'] }]),
      kpi(7, 6, '보고완료·종결', 'claims', 'count', [{ col: 'claim_status', op: 'in', source: 'fixed', value: ['보고완료', '종결'] }], { color: 'positive' }),
      kpi(10, 6, 'TAT 20일 초과', 'claims', 'count', [{ col: 'tat_days', op: 'gt', source: 'fixed', value: 20 }], { color: 'warning' }),
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 12,
        rowSpan: 28,
        props: { title: 'Claim 작업 목록', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '데이터가 없습니다', selectParam: 'sel', selectFieldId: 'far_no' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'product_group', 'fail_mode', 'severity', 'claim_status', 'owner', 'tat_days'],
          filters: [byParam('claim_status', 'status')],
          sort: [['received_date', 'desc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 12,
        rowSpan: 15,
        props: { title: '선택 Claim', emptyText: '왼쪽 목록에서 Claim을 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'claim_status', 'market', 'product_group', 'model', 'capacity', 'fail_mode', 'severity', 'owner', 'received_date', 'due_date', 'tat_days', 'dev_transfer'],
          filters: [selected('far_no')],
          sort: [['received_date', 'desc']],
          pageSize: 1,
        },
      },
      {
        type: 'record-timeline',
        col: 8,
        span: 5,
        row: 27,
        rowSpan: 13,
        props: { title: 'FA 배정·인수인계 이력', emptyText: '선택한 Claim의 이력이 없습니다', maxItems: 6 },
        bind: {
          mode: 'list',
          table: 'fa_assignments',
          select: ['assign_type', 'assignee', 'assigned_date', 'fa_status', 'note'],
          filters: [selected('far_no')],
          sort: [['assigned_date', 'desc']],
          pageSize: 6,
        },
      },
      {
        type: 'list-panel',
        col: 1,
        span: 6,
        row: 40,
        rowSpan: 12,
        props: { title: '이 Claim의 분석 의뢰', subtitle: '개발실·Auto·DRAM·pFA', emptyText: '연결된 의뢰가 없습니다', maxItems: 6, badgeSuffix: '' },
        bind: {
          mode: 'list',
          table: 'analysis_requests',
          select: ['request_no', 'request_type', 'requester', 'due_date', 'req_status'],
          filters: [selected('far_no')],
          sort: [['request_date', 'desc']],
          pageSize: 6,
        },
      },
      {
        type: 'list-panel',
        col: 7,
        span: 6,
        row: 40,
        rowSpan: 12,
        props: { title: '이 Claim의 Reball 의뢰', subtitle: '반출~반입 일정', emptyText: '연결된 Reball 의뢰가 없습니다', maxItems: 6, badgeSuffix: '' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'vendor', 'qty', 'in_date', 'reball_status'],
          filters: [selected('far_no')],
          sort: [['request_date', 'desc']],
          pageSize: 6,
        },
      },
      heading(52, '다음 행동 — 선택한 Claim에 바로 반영'),
      input('claim-owner', 1, 54, 3, '담당자'),
      action(4, 54, 2, '담당자 변경', 'act-claim-owner'),
      pick('claim-status', 6, 54, 3, '진행상태', claimStatus),
      action(9, 54, 2, '상태 변경', 'act-claim-status'),
      action(11, 54, 2, 'Tech Report', 'act-go-techreport', 'outline'),
    ],
  };
}

// ③ FA 담당자 배정 — 수기 식별번호 입력을 없애고 대상 선택 + 배정만 남긴다.
function faAssign(priority: string[]): PagePlan {
  return {
    slug: 'fa-assign',
    title: 'FA Assign',
    nodes: [
      title(1, 'FA 담당자 배정', '미배정 Claim을 고르면 식별정보가 연결됩니다. 배정번호(ASG-)는 저장할 때 자동으로 만들어집니다.'),
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 3,
        rowSpan: 26,
        props: { title: '미배정 Claim', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '미배정 Claim이 없습니다', selectParam: 'sel', selectFieldId: 'far_no' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'product_group', 'fail_mode', 'severity', 'received_date'],
          filters: [{ col: 'claim_status', op: 'eq', source: 'fixed', value: '접수' }],
          sort: [['received_date', 'asc']],
          pageSize: 50,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 3,
        rowSpan: 12,
        props: { title: '선택 Claim', emptyText: '왼쪽에서 배정할 Claim을 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'severity', 'product_group', 'fail_mode', 'qty', 'received_date', 'due_date'],
          filters: [selected('far_no')],
          sort: [['received_date', 'desc']],
          pageSize: 1,
        },
      },
      input('assign-assignee', 8, 15, 5, '담당자'),
      input('assign-due', 8, 19, 5, '완료 예정일', 'date'),
      pick('assign-priority', 8, 23, 5, '우선순위', priority),
      note('assign-note', 8, 27, 5, 6, '인계 메모', '재현 조건, 고객 요청사항'),
      action(8, 33, 5, '담당자 배정', 'act-fa-assign'),
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 37,
        rowSpan: 22,
        props: { title: '최근 배정 이력', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '배정 이력이 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'fa_assignments',
          select: ['assign_no', 'far_no', 'assign_type', 'assignee', 'priority', 'assigned_date', 'due_date', 'fa_status'],
          filters: [],
          sort: [['assigned_date', 'desc']],
          pageSize: 50,
        },
      },
    ],
  };
}

// ④ FA 진행 현황 — 부하·마감·인수인계를 한 화면에서.
function faStatus(status: string[], priority: string[]): PagePlan {
  return {
    slug: 'fa-status',
    title: 'FA 현황',
    nodes: [
      title(1, 'FA 진행 현황', '담당자 부하와 마감, 인수인계 경위를 같은 맥락에서 확인합니다.'),
      {
        type: 'status-filter',
        col: 1,
        span: 12,
        row: 3,
        rowSpan: 3,
        props: { title: '진행상태', param: 'fastatus', options: [{ label: '전체', value: '' }, ...status.map((v) => ({ label: v, value: v }))] },
      },
      kpi(1, 6, '분석중', 'fa_assignments', 'count', [{ col: 'fa_status', op: 'eq', source: 'fixed', value: '분석중' }]),
      kpi(4, 6, '보고완료', 'fa_assignments', 'count', [{ col: 'fa_status', op: 'eq', source: 'fixed', value: '보고완료' }], { color: 'positive' }),
      kpi(7, 6, '보류 — 확인 필요', 'fa_assignments', 'count', [{ col: 'fa_status', op: 'eq', source: 'fixed', value: '보류' }], { color: 'warning' }),
      kpi(10, 6, '인수인계', 'fa_assignments', 'count', [{ col: 'assign_type', op: 'eq', source: 'fixed', value: '인수인계' }], { color: 'accent' }),
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 12,
        rowSpan: 26,
        props: { title: 'FA 작업 큐', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '작업이 없습니다', selectParam: 'sel', selectFieldId: 'far_no' },
        bind: {
          mode: 'list',
          table: 'fa_assignments',
          select: ['far_no', 'assignee', 'prev_assignee', 'priority', 'due_date', 'fa_status', 'note'],
          filters: [byParam('fa_status', 'fastatus')],
          sort: [['due_date', 'asc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 12,
        rowSpan: 12,
        props: { title: '선택 건', emptyText: '왼쪽 작업 큐에서 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'fa_assignments',
          select: ['far_no', 'assignee', 'fa_status', 'assign_no', 'assign_type', 'prev_assignee', 'priority', 'assigned_date', 'due_date', 'note'],
          filters: [selected('far_no')],
          sort: [['assigned_date', 'desc']],
          pageSize: 1,
        },
      },
      {
        type: 'record-timeline',
        col: 8,
        span: 5,
        row: 24,
        rowSpan: 14,
        props: { title: '인수인계 경위', emptyText: '선택한 건의 이력이 없습니다', maxItems: 8 },
        bind: {
          mode: 'list',
          table: 'fa_assignments',
          select: ['assign_type', 'assignee', 'assigned_date', 'fa_status', 'prev_assignee', 'note'],
          filters: [selected('far_no')],
          sort: [['assigned_date', 'desc']],
          pageSize: 8,
        },
      },
      heading(38, '인수인계 등록 — 선택한 FAR No로 등록됩니다'),
      input('ho-assignee', 1, 40, 3, '인수자(새 담당)'),
      input('ho-prev', 4, 40, 3, '인계자(기존 담당)'),
      input('ho-due', 7, 40, 3, '완료 예정일', 'date'),
      pick('ho-priority', 10, 40, 3, '우선순위', priority),
      note('ho-note', 1, 44, 9, 6, '사유', '휴가·부하 조정 등 인계 사유'),
      action(10, 44, 3, '인수인계 등록', 'act-fa-handover', 'default', 6),
      { type: 'live-chat', col: 1, span: 12, row: 50, rowSpan: 26, props: { title: 'FA 담당자 협의', room: 'fa', placeholder: '메시지를 입력하고 Enter' } },
    ],
  };
}

// ⑤ FA Tech Report — 식별정보 재입력을 없애고 결과·원인·결론을 나눠 적는다.
function faTechReport(failModes: string[]): PagePlan {
  return {
    slug: 'fa-tech-report',
    title: 'FA Tech Report',
    nodes: [
      title(1, 'FA Tech Report', '대상 Claim을 고르면 식별정보가 연결됩니다. 리포트번호(FTR-)는 저장할 때 자동으로 만들어집니다.'),
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 3,
        rowSpan: 24,
        props: { title: '분석 대상 Claim', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '대상 Claim이 없습니다', selectParam: 'sel', selectFieldId: 'far_no' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'product_group', 'model', 'fail_mode', 'severity', 'owner'],
          filters: [{ col: 'claim_status', op: 'in', source: 'fixed', value: ['배정', '분석중'] }],
          sort: [['received_date', 'desc']],
          pageSize: 50,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 3,
        rowSpan: 11,
        props: { title: '선택 Claim', emptyText: '왼쪽에서 대상 Claim을 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'severity', 'product_group', 'model', 'capacity', 'fail_mode', 'owner'],
          filters: [selected('far_no')],
          sort: [['received_date', 'desc']],
          pageSize: 1,
        },
      },
      {
        type: 'checklist',
        col: 8,
        span: 5,
        row: 14,
        rowSpan: 13,
        props: {
          title: '보고서 품질 체크',
          subtitle: '제출 전 확인',
          items: [
            { label: 'Claim 정보 연결', description: '선택한 FAR No가 자동으로 붙습니다', status: '자동' },
            { label: '관찰 결과', description: '측정값과 재현 조건을 함께 적습니다', status: '필수' },
            { label: '추정 원인', description: '근거 문장과 함께 적습니다', status: '필수' },
            { label: '조치·결론', description: '고객 보고용 결론과 후속 조치', status: '필수' },
            { label: '개발실 이관', description: '이관하면 상세분석 의뢰로 이어집니다', status: '선택' },
          ],
        },
      },
      heading(27, '분석 결과 작성'),
      input('tr-author', 1, 29, 3, '작성자'),
      input('tr-location', 4, 29, 3, '불량 위치'),
      pick('tr-failmode', 7, 29, 3, '확인 Fail Mode', failModes),
      pick('tr-dev', 10, 29, 3, '개발실 이관', ['Y', 'N']),
      note('tr-observation', 1, 33, 4, 8, '관찰 결과', '측정값·재현 조건'),
      note('tr-cause', 5, 33, 4, 8, '추정 원인', '근거와 함께'),
      note('tr-conclusion', 9, 33, 4, 8, '조치·결론', '고객 보고용 결론과 후속 조치'),
      action(10, 41, 3, '검토 요청', 'act-techreport'),
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 45,
        rowSpan: 22,
        props: { title: '최근 작성 보고서', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '작성된 보고서가 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'fa_tech_reports',
          select: ['report_no', 'far_no', 'author', 'written_at', 'fail_mode', 'ng_location', 'report_status', 'to_dev_lab'],
          filters: [],
          sort: [['written_at', 'desc']],
          pageSize: 50,
        },
      },
    ],
  };
}

// ⑥ Reball 운영 현황 — 같은 막대 나열 대신 단계 흐름·일정·지연.
function reballDashboard(): PagePlan {
  return {
    slug: 'reball',
    title: 'Reball 현황',
    nodes: [
      title(1, 'Reball 운영 현황', '단계별 병목과 다가오는 반입 일정을 먼저 봅니다.'),
      kpi(1, 3, '전체 의뢰', 'reball_requests', 'count', []),
      kpi(4, 3, '진행중', 'reball_requests', 'count', [{ col: 'reball_status', op: 'in', source: 'fixed', value: ['의뢰', '반출', '작업중', '반입'] }], { color: 'warning' }),
      kpi(7, 3, '완료', 'reball_requests', 'count', [{ col: 'reball_status', op: 'eq', source: 'fixed', value: '완료' }], { color: 'positive' }),
      kpi(10, 3, '총 수량', 'reball_requests', 'sum', [], { unit: 'ea', color: 'neutral' }, 'qty'),
      {
        type: 'chart',
        col: 1,
        span: 4,
        row: 9,
        rowSpan: 14,
        props: { title: '단계별 작업량', chartType: 'bar-horizontal', color: 'primary', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'reball_requests', groupField: 'reball_status', fn: 'count', filters: [], orderBy: 'value', limit: 10 },
      },
      {
        type: 'list-panel',
        col: 5,
        span: 4,
        row: 9,
        rowSpan: 14,
        props: { title: '다가오는 반입 일정', subtitle: '진행 중 · 반입 예정일 순', emptyText: '예정된 일정이 없습니다', maxItems: 8, badgeSuffix: '' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'requester', 'vendor', 'in_date', 'reball_status'],
          filters: [{ col: 'reball_status', op: 'in', source: 'fixed', value: ['의뢰', '반출', '작업중', '반입'] }],
          sort: [['in_date', 'asc']],
          pageSize: 8,
        },
      },
      {
        type: 'chart',
        col: 9,
        span: 4,
        row: 9,
        rowSpan: 14,
        props: { title: '패키지별 의뢰', chartType: 'bar-horizontal', color: 'accent', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'reball_requests', groupField: 'package_type', fn: 'count', filters: [], orderBy: 'value', limit: 10 },
      },
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 23,
        rowSpan: 24,
        props: { title: 'Reball 전체 의뢰', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '의뢰가 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'far_no', 'requester', 'qty', 'package_type', 'vendor', 'out_date', 'in_date', 'reball_status'],
          filters: [],
          sort: [['request_date', 'desc']],
          pageSize: 60,
        },
      },
    ],
  };
}

// ⑦ Reball 의뢰서 — Claim 연결 → 샘플 → 일정의 3단계.
function reballRequest(packages: string[]): PagePlan {
  return {
    slug: 'reball-request',
    title: 'Reball 의뢰서',
    nodes: [
      title(1, 'Reball 의뢰서', 'Claim을 고르면 의뢰자·식별정보가 연결됩니다. 의뢰번호(RB-)는 저장할 때 자동으로 만들어집니다.'),
      { type: 'stepper', col: 1, span: 12, row: 3, rowSpan: 3, props: { steps: ['Claim 선택', '샘플 정보', '일정 확인'], current: 1 } },
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 6,
        rowSpan: 20,
        props: { title: '대상 Claim', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '대상 Claim이 없습니다', selectParam: 'sel', selectFieldId: 'far_no' },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'product_group', 'fail_mode', 'qty', 'owner'],
          filters: [{ col: 'claim_status', op: 'in', source: 'fixed', value: ['배정', '분석중'] }],
          sort: [['received_date', 'desc']],
          pageSize: 40,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 6,
        rowSpan: 10,
        props: { title: '선택 Claim', emptyText: '왼쪽에서 Claim을 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'claims',
          select: ['far_no', 'customer', 'fail_mode', 'product_group', 'qty', 'owner', 'due_date'],
          filters: [selected('far_no')],
          sort: [['received_date', 'desc']],
          pageSize: 1,
        },
      },
      {
        // 청사진 07의 "중복 의뢰 확인" — 같은 FAR로 이미 나간 의뢰가 있는지 그 자리에서 본다.
        type: 'list-panel',
        col: 8,
        span: 5,
        row: 16,
        rowSpan: 10,
        props: { title: '이 FAR의 기존 의뢰', subtitle: '중복 의뢰 확인', emptyText: '기존 의뢰가 없습니다', maxItems: 5, badgeSuffix: '' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'vendor', 'qty', 'in_date', 'reball_status'],
          filters: [selected('far_no')],
          sort: [['request_date', 'desc']],
          pageSize: 5,
        },
      },
      heading(26, '샘플 정보와 일정'),
      input('rb-requester', 1, 28, 3, '의뢰자'),
      input('rb-qty', 4, 28, 3, '수량(ea)', 'number'),
      pick('rb-package', 7, 28, 3, '패키지', packages),
      pick('rb-vendor', 10, 28, 3, '업체', ['협력사 A', '협력사 B', '협력사 C', '사내 Reball실']),
      input('rb-out', 1, 32, 3, '반출 예정', 'date'),
      input('rb-in', 4, 32, 3, '반입 예정', 'date'),
      note('rb-note', 1, 36, 9, 6, '작업 요청', '샘플 조건과 주의사항'),
      action(10, 36, 3, 'Reball 의뢰 등록', 'act-reball-request', 'default', 6),
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 42,
        rowSpan: 22,
        props: { title: '최근 의뢰', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '의뢰가 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'far_no', 'requester', 'qty', 'package_type', 'vendor', 'out_date', 'in_date', 'reball_status'],
          filters: [],
          sort: [['request_date', 'desc']],
          pageSize: 30,
        },
      },
    ],
  };
}

// ⑧ Reball 작업 현황 — 일정(간트) → 목록 → 선택 항목의 상태 이력.
function reballStatus(): PagePlan {
  // update_type과 reball_status 두 ENUM에 **함께 있는 값**만 쓴다 — 한 번의 조작으로 이력과 단계를
  // 같이 남기기 때문이다(한쪽에만 있는 '작업중'·'지연'은 CHECK 제약에 걸린다).
  const sharedStages = ['반출', '반입', '완료', '취소'];
  return {
    slug: 'reball-status',
    title: 'Reball 작업 현황',
    nodes: [
      title(1, 'Reball 작업 현황', '일정과 상태 변경 사유를 한 작업 맥락에서 확인합니다.'),
      {
        type: 'status-filter',
        col: 1,
        span: 12,
        row: 3,
        rowSpan: 3,
        props: {
          title: '진행 단계',
          param: 'rbstatus',
          options: [{ label: '전체', value: '' }, ...['의뢰', '반출', '작업중', '반입', '완료', '취소'].map((v) => ({ label: v, value: v }))],
        },
      },
      {
        type: 'gantt-chart',
        col: 1,
        span: 12,
        row: 6,
        rowSpan: 22,
        props: { title: '반출 ~ 반입 예정 일정', showToday: true },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'out_date', 'in_date'],
          filters: [byParam('reball_status', 'rbstatus')],
          sort: [['out_date', 'asc']],
          pageSize: 40,
        },
      },
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 28,
        rowSpan: 22,
        props: { title: '진행 목록', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '의뢰가 없습니다', selectParam: 'sel', selectFieldId: 'request_no' },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'far_no', 'vendor', 'qty', 'out_date', 'in_date', 'reball_status'],
          filters: [byParam('reball_status', 'rbstatus')],
          sort: [['in_date', 'asc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 28,
        rowSpan: 10,
        props: { title: '선택 의뢰', emptyText: '왼쪽 목록에서 의뢰를 선택하세요', subtitleCount: 2 },
        bind: {
          mode: 'list',
          table: 'reball_requests',
          select: ['request_no', 'far_no', 'reball_status', 'requester', 'vendor', 'qty', 'package_type', 'request_date', 'out_date', 'in_date', 'done_date', 'work_note'],
          filters: [selected('request_no')],
          sort: [['request_date', 'desc']],
          pageSize: 1,
        },
      },
      {
        type: 'record-timeline',
        col: 8,
        span: 5,
        row: 38,
        rowSpan: 12,
        props: { title: '상태 변경 이력', emptyText: '선택한 의뢰의 이력이 없습니다', maxItems: 8 },
        bind: {
          mode: 'list',
          table: 'reball_updates',
          select: ['update_type', 'update_date', 'worker', 'note'],
          filters: [selected('request_no')],
          sort: [['update_date', 'desc']],
          pageSize: 8,
        },
      },
      heading(50, '진행 상태 업데이트 — 이력과 단계가 함께 반영됩니다'),
      pick('rs-stage', 1, 52, 3, '진행 단계', sharedStages),
      input('rs-date', 4, 52, 3, '일자', 'date'),
      input('rs-worker', 7, 52, 3, '작업자'),
      note('rs-note', 1, 56, 9, 6, '내용', '변경 사유와 특이사항'),
      action(10, 56, 3, '상태 업데이트', 'act-reball-progress', 'default', 6),
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 62,
        rowSpan: 22,
        props: { title: '전체 진행 업데이트 이력', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '이력이 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'reball_updates',
          select: ['update_date', 'request_no', 'far_no', 'update_type', 'worker', 'note'],
          filters: [],
          sort: [['update_date', 'desc']],
          pageSize: 60,
        },
      },
    ],
  };
}

// ⑨ 분석 의뢰 허브 — 유형별 진입 + SLA·긴급도 기준 통합 큐.
function requestHub(reqPriority: string[]): PagePlan {
  return {
    slug: 'requests',
    title: '의뢰서 허브',
    nodes: [
      title(1, '분석 의뢰 허브', '유형별 진입과 우선 처리 대상을 한 화면에서 판단합니다.'),
      kpi(1, 3, '전체 의뢰', 'analysis_requests', 'count', []),
      kpi(4, 3, '진행중', 'analysis_requests', 'count', [{ col: 'req_status', op: 'eq', source: 'fixed', value: '진행중' }], { color: 'warning' }),
      kpi(7, 3, '완료', 'analysis_requests', 'count', [{ col: 'req_status', op: 'eq', source: 'fixed', value: '완료' }], { color: 'positive' }),
      kpi(10, 3, '긴급 · 미완료', 'analysis_requests', 'count', [
        { col: 'priority', op: 'eq', source: 'fixed', value: '긴급' },
        { col: 'req_status', op: 'in', source: 'fixed', value: ['접수', '진행중', '보류'] },
      ], { color: 'accent' }),
      {
        type: 'nav-cards',
        col: 1,
        span: 7,
        row: 9,
        rowSpan: 16,
        props: {
          title: '의뢰 유형',
          subtitle: '카드를 누르면 해당 작업 큐로 이동합니다',
          columns: 3,
          items: [
            { title: '개발실 상세분석', description: 'Die 레벨 정밀 분석', slug: 'req-dev-lab', meta: 'FA 재현 건 인계' },
            { title: 'Auto향 이력 확인', description: 'Lot·신뢰성 이력 조회', slug: 'req-auto', meta: '차량용 제품' },
            { title: 'DRAM 분석', description: '동반 불량 상관 분석', slug: 'req-dram', meta: '스토리지 + DRAM' },
            { title: 'pFA 비파괴', description: 'X-ray·SAT 선행 분석', slug: 'req-pfa-nd', meta: '시료 보존' },
            { title: 'pFA 파괴', description: 'Decap·Die 표면 분석', slug: 'req-pfa-d', meta: '승인 필요' },
          ],
        },
      },
      {
        type: 'chart',
        col: 8,
        span: 5,
        row: 9,
        rowSpan: 16,
        props: { title: '유형별 의뢰 건수', chartType: 'bar-horizontal', color: 'accent', unit: '건', yLabel: '' },
        bind: { mode: 'group', table: 'analysis_requests', groupField: 'request_type', fn: 'count', filters: [], orderBy: 'value', limit: 10 },
      },
      {
        type: 'status-filter',
        col: 1,
        span: 12,
        row: 25,
        rowSpan: 3,
        props: { title: '긴급도', param: 'priority', options: [{ label: '전체', value: '' }, ...reqPriority.map((v) => ({ label: v, value: v }))] },
      },
      {
        type: 'data-table',
        col: 1,
        span: 12,
        row: 28,
        rowSpan: 26,
        props: { title: '통합 우선 처리 큐 — 완료 요청일 순', showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '처리할 의뢰가 없습니다', selectParam: '', selectFieldId: '' },
        bind: {
          mode: 'list',
          table: 'analysis_requests',
          select: ['request_no', 'far_no', 'request_type', 'requester', 'handler', 'priority', 'due_date', 'req_status'],
          filters: [
            { col: 'req_status', op: 'in', source: 'fixed', value: ['접수', '진행중', '보류'] },
            byParam('priority', 'priority'),
          ],
          sort: [['due_date', 'asc']],
          pageSize: 60,
        },
      },
    ],
  };
}

// ⑩~⑭ 유형별 의뢰 화면 — 공통 뼈대 + 유형별 고유 칸.
type RequestType = {
  slug: string;
  pageTitle: string;
  typeValue: string;
  headline: string;
  description: string;
  /** 유형별 입력 칸(최대 4개, col 1/4/7/10에 나란히) */
  extras: { key: string; col: string; label: string; type?: string; options?: 'destruct' }[];
  checklist: { label: string; description: string; status: string }[];
};

const REQUEST_TYPES: RequestType[] = [
  {
    slug: 'req-dev-lab',
    pageTitle: '개발실 상세분석',
    typeValue: '개발실 상세분석',
    headline: '개발실 상세분석 의뢰',
    description: 'FA 재현 건을 Die 레벨 분석으로 넘깁니다. 초도 분석 결과와 재현 조건을 함께 적습니다.',
    extras: [
      { key: 'x-scope', col: 'analysis_scope', label: '분석 범위' },
      { key: 'x-qty', col: 'sample_qty', label: '시료 수량(ea)', type: 'number' },
      { key: 'x-preserve', col: 'preserve_cond', label: '보존 필요' },
    ],
    checklist: [
      { label: '초도 분석 결과', description: 'Tech Report 링크 또는 요약', status: '필수' },
      { label: '재현 조건', description: '시험 환경과 재현율', status: '필수' },
      { label: '시료 준비', description: '수량과 보존 조건', status: '필수' },
      { label: '첨부 자료', description: 'X-ray·파형 등 근거', status: '선택' },
    ],
  },
  {
    slug: 'req-auto',
    pageTitle: 'Auto향 이력 확인',
    typeValue: 'Auto향 이력 확인',
    headline: 'Auto향 이력 확인 의뢰',
    description: '차량용 제품의 출하 Lot·신뢰성 이력을 조회합니다.',
    extras: [
      { key: 'x-lot', col: 'lot_no', label: '출하 Lot' },
      { key: 'x-vehicle', col: 'vehicle_project', label: '차종/프로젝트' },
      { key: 'x-scope', col: 'analysis_scope', label: '조회 범위' },
    ],
    checklist: [
      { label: '출하 Lot', description: '조회 대상 Lot 번호', status: '필수' },
      { label: '차종/프로젝트', description: '적용 차종 또는 플랫폼', status: '필수' },
      { label: '조회 범위', description: '출하·신뢰성·공정 중 선택', status: '필수' },
      { label: 'AEC-Q100 이력', description: '해당 시 함께 조회', status: '선택' },
    ],
  },
  {
    slug: 'req-dram',
    pageTitle: 'DRAM 분석',
    typeValue: 'DRAM 분석',
    headline: 'DRAM 분석 의뢰',
    description: '스토리지와 DRAM의 동반 불량 상관을 분석합니다.',
    extras: [
      { key: 'x-dram', col: 'dram_model', label: 'DRAM 모델' },
      { key: 'x-scope', col: 'analysis_scope', label: '분석 범위' },
      { key: 'x-qty', col: 'sample_qty', label: '시료 수량(ea)', type: 'number' },
    ],
    checklist: [
      { label: 'DRAM 모델', description: '동반 부품 모델명', status: '필수' },
      { label: '증상 연동', description: '동시 발생 조건', status: '필수' },
      { label: '재현 로그', description: '스토리지 로그 첨부', status: '선택' },
    ],
  },
  {
    slug: 'req-pfa-nd',
    pageTitle: 'pFA(비파괴)',
    typeValue: 'pFA(비파괴)',
    headline: 'pFA(비파괴) 의뢰',
    description: '샘플을 보존한 상태에서 X-ray·SAT·CT로 확인합니다. 권장 순서는 X-ray → SAT → 필요 시 CT입니다.',
    extras: [
      { key: 'x-scope', col: 'analysis_scope', label: '분석 방법' },
      { key: 'x-qty', col: 'sample_qty', label: '시료 수량(ea)', type: 'number' },
      { key: 'x-preserve', col: 'preserve_cond', label: '보존 조건' },
    ],
    checklist: [
      { label: '분석 방법', description: 'X-ray / SAT / CT', status: '필수' },
      { label: '보존 조건', description: '외관 유지 여부', status: '필수' },
      { label: '권장 순서', description: 'X-ray → SAT → CT', status: '안내' },
    ],
  },
  {
    slug: 'req-pfa-d',
    pageTitle: 'pFA(파괴)',
    typeValue: 'pFA(파괴)',
    headline: 'pFA(파괴) 의뢰',
    description: 'Decap 후 Die 표면·본딩을 확인합니다. 되돌릴 수 없으므로 파괴 승인과 잔여 시료 보존을 먼저 확인합니다.',
    extras: [
      { key: 'x-scope', col: 'analysis_scope', label: '분석 방법' },
      { key: 'x-qty', col: 'sample_qty', label: '시료 수량(ea)', type: 'number' },
      { key: 'x-approval', col: 'destruct_approval', label: '파괴 승인', options: 'destruct' },
      { key: 'x-preserve', col: 'preserve_cond', label: '잔여 시료' },
    ],
    checklist: [
      { label: '파괴 승인', description: '승인 없이는 진행하지 않습니다', status: '필수' },
      { label: '잔여 시료 보존', description: '재분석용 시료를 남깁니다', status: '필수' },
      { label: '분석 순서', description: '비파괴 선행 결과 확인 후 진행', status: '필수' },
      { label: '중단 기준', description: '목표 부위 확인 시 중단', status: '안내' },
    ],
  },
];

export { REQUEST_TYPES };

/**
 * 노드 별칭은 페이지를 넘나들며 유일해야 한다 — 다섯 개의 의뢰 화면이 같은 모양이라 'req-far' 같은
 * 이름이 그대로 다섯 번 나온다. 슬러그를 앞에 붙여 구분한다(액션도 같은 규칙으로 가리킨다).
 */
const nodeKey = (slug: string, name: string) => `${slug}:${name}`;

function requestPage(type: RequestType, reqStatus: string[], reqPriority: string[], destruct: string[]): PagePlan {
  const k = (name: string) => nodeKey(type.slug, name);
  const typeFilter: FilterPlan = { col: 'request_type', op: 'eq', source: 'fixed', value: type.typeValue };
  const extraCols = ['analysis_scope', 'sample_qty', 'preserve_cond', 'lot_no', 'vehicle_project', 'dram_model', 'destruct_approval'];
  const usedExtras = type.extras.map((e) => e.col);
  const detailSelect = [
    'request_no',
    'far_no',
    'req_status',
    'request_type',
    'requester',
    'handler',
    'priority',
    'request_date',
    'due_date',
    ...extraCols.filter((c) => usedExtras.includes(c)),
    'content',
    'result_summary',
  ];

  return {
    slug: type.slug,
    title: type.pageTitle,
    nodes: [
      title(1, type.headline, type.description),
      kpi(1, 3, '의뢰 건수', 'analysis_requests', 'count', [typeFilter]),
      kpi(4, 3, '진행중', 'analysis_requests', 'count', [typeFilter, { col: 'req_status', op: 'eq', source: 'fixed', value: '진행중' }], { color: 'warning' }),
      kpi(7, 3, '완료', 'analysis_requests', 'count', [typeFilter, { col: 'req_status', op: 'eq', source: 'fixed', value: '완료' }], { color: 'positive' }),
      kpi(10, 3, '긴급', 'analysis_requests', 'count', [typeFilter, { col: 'priority', op: 'eq', source: 'fixed', value: '긴급' }], { color: 'accent' }),
      {
        type: 'data-table',
        col: 1,
        span: 7,
        row: 9,
        rowSpan: 24,
        props: { title: `${type.pageTitle} 작업 큐`, showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '의뢰가 없습니다', selectParam: 'sel', selectFieldId: 'request_no' },
        bind: {
          mode: 'list',
          table: 'analysis_requests',
          select: ['request_no', 'far_no', 'requester', 'handler', 'priority', 'due_date', 'req_status'],
          filters: [typeFilter],
          sort: [['due_date', 'asc']],
          pageSize: 60,
        },
      },
      {
        type: 'record-detail',
        col: 8,
        span: 5,
        row: 9,
        rowSpan: 14,
        props: { title: '선택 의뢰', emptyText: '왼쪽 작업 큐에서 의뢰를 선택하세요', subtitleCount: 2 },
        bind: { mode: 'list', table: 'analysis_requests', select: detailSelect, filters: [selected('request_no')], sort: [['request_date', 'desc']], pageSize: 1 },
      },
      {
        type: 'checklist',
        col: 8,
        span: 5,
        row: 23,
        rowSpan: 10,
        props: { title: '준비 상태 점검', subtitle: '의뢰 전 확인', items: type.checklist },
      },
      heading(33, '결과 등록 — 선택한 의뢰에 반영'),
      note(k('res-summary'), 1, 35, 6, 6, '결과 요약', '분석 결과와 결론'),
      pick(k('res-status'), 7, 35, 3, '진행상태', reqStatus),
      action(10, 35, 3, '결과 등록', `act-req-result-${type.slug}`),
      heading(42, `${type.pageTitle} 의뢰서 작성`),
      input(k('req-far'), 1, 44, 3, 'FAR No'),
      input(k('req-requester'), 4, 44, 3, '의뢰자'),
      input(k('req-due'), 7, 44, 3, '완료 요청일', 'date'),
      pick(k('req-priority'), 10, 44, 3, '우선순위', reqPriority),
      ...type.extras.map((extra, index) =>
        extra.options === 'destruct'
          ? pick(k(extra.key), 1 + index * 3, 48, 3, extra.label, destruct)
          : input(k(extra.key), 1 + index * 3, 48, 3, extra.label, extra.type ?? 'text')
      ),
      note(k('req-content'), 1, 52, 9, 6, '분석 요청 내용', '확인할 증상·조건·기대 결과'),
      action(10, 52, 3, '의뢰 등록', `act-req-create-${type.slug}`, 'default', 6),
    ],
  };
}

// ⑮ 분석 Tip 라이브러리 — 채팅 중심에서 찾아 쓰는 지식으로.
function tips(categories: string[]): PagePlan {
  return {
    slug: 'tips',
    title: '분석 Tip 게시판',
    nodes: [
      title(1, '분석 Tip 라이브러리', '현장 노하우를 검색·재사용 가능한 지식으로 쌓습니다.'),
      {
        type: 'status-filter',
        col: 1,
        span: 12,
        row: 3,
        rowSpan: 3,
        props: { title: '분류', param: 'cat', options: [{ label: '전체', value: '' }, ...categories.map((v) => ({ label: v, value: v }))] },
      },
      kpi(1, 6, '전체 글', 'tips', 'count', []),
      kpi(4, 6, '누적 조회', 'tips', 'sum', [], { unit: '회', color: 'neutral' }, 'views'),
      kpi(7, 6, '도움됨', 'tips', 'sum', [], { unit: '회', color: 'positive' }, 'helpful'),
      kpi(10, 6, '고정 가이드', 'tips', 'count', [{ col: 'is_pinned', op: 'eq', source: 'fixed', value: 'Y' }], { color: 'accent' }),
      {
        type: 'article-cards',
        col: 1,
        span: 12,
        row: 12,
        rowSpan: 20,
        props: { title: '고정된 핵심 가이드', subtitle: '반복 문의가 많은 표준 절차', emptyText: '고정된 글이 없습니다', columns: 3, maxItems: 3 },
        bind: {
          mode: 'list',
          table: 'tips',
          select: ['title', 'category', 'content', 'author', 'created_date', 'views'],
          filters: [{ col: 'is_pinned', op: 'eq', source: 'fixed', value: 'Y' }, byParam('category', 'cat')],
          sort: [['views', 'desc']],
          pageSize: 3,
        },
      },
      {
        type: 'article-cards',
        col: 1,
        span: 7,
        row: 32,
        rowSpan: 20,
        props: { title: '최근 업데이트', subtitle: '새로 쓰거나 고친 글', emptyText: '글이 없습니다', columns: 2, maxItems: 6 },
        bind: {
          mode: 'list',
          table: 'tips',
          select: ['title', 'category', 'content', 'author', 'updated_date', 'helpful'],
          filters: [byParam('category', 'cat')],
          sort: [['updated_date', 'desc']],
          pageSize: 6,
        },
      },
      {
        type: 'list-panel',
        col: 8,
        span: 5,
        row: 32,
        rowSpan: 20,
        props: { title: '많이 본 Tip', subtitle: '조회수 순', emptyText: '글이 없습니다', maxItems: 8, badgeSuffix: '회' },
        bind: {
          mode: 'list',
          table: 'tips',
          select: ['title', 'category', 'author', 'views'],
          filters: [byParam('category', 'cat')],
          sort: [['views', 'desc']],
          pageSize: 8,
        },
      },
      heading(52, '새 Tip 작성'),
      input('tip-title', 1, 54, 3, '제목'),
      pick('tip-category', 4, 54, 3, '분류', categories),
      input('tip-author', 7, 54, 3, '작성자'),
      input('tip-tags', 10, 54, 3, '태그(쉼표로 구분)'),
      note('tip-content', 1, 58, 9, 8, '내용', '절차·주의점·판단 기준'),
      action(10, 58, 3, 'Tip 등록', 'act-tip-create', 'default', 8),
      { type: 'live-chat', col: 1, span: 12, row: 66, rowSpan: 24, props: { title: '실시간 질문', room: 'tips', placeholder: '메시지를 입력하고 Enter' } },
    ],
  };
}

/**
 * ⑯ 피드백 게시판 — **대화 방식은 그대로 두고** 청사진의 디자인 요소만 입힌다(사용자 지시).
 *
 * 청사진 16은 대화를 이슈 보드로 바꾸자고 제안했지만, 이 게시판은 실제로 쓰이는 대화 창구다
 * (글 21건 · 이미지 17장). 그래서 형태는 유지하고, 청사진이 공통으로 요구한 것만 가져온다:
 *   · 안내문 상자 대신 **페이지 제목**으로 목적을 밝힌다(청사진 공통 ①)
 *   · 재현 조건·스크린샷처럼 **함께 적어야 추적이 되는 것**을 옆에 상시 노출한다(청사진 16의 요지)
 *   · 대화를 화면의 주인공으로 넓게 둔다
 *
 * `boardKey`는 예전 노드 id로 못 박는다 — 배치를 다시 만들어도 글이 그대로 딸려 온다.
 */
const LEGACY_BOARD_KEY = 'cmsyqb57z006xakesh6bdop8u';

function feedback(): PagePlan {
  return {
    slug: 'page-6v05og',
    newSlug: 'feedback',
    title: '피드백 게시판',
    icon: 'message-square',
    nodes: [
      title(1, '제품 피드백', '개선 요청과 불편을 자유롭게 남겨 주세요. 화면·재현 조건·스크린샷이 함께 있으면 훨씬 빨리 반영됩니다.'),
      {
        type: 'board',
        col: 1,
        span: 9,
        row: 3,
        rowSpan: 44,
        props: { title: '피드백 대화', description: '', boardKey: LEGACY_BOARD_KEY, pageSize: 10, allowWrite: true, searchable: true, categories: '' },
      },
      {
        type: 'checklist',
        col: 10,
        span: 3,
        row: 3,
        rowSpan: 16,
        props: {
          title: '남길 때 함께 적어 주세요',
          subtitle: '이 네 가지면 재현이 됩니다',
          items: [
            { label: '어느 화면인지', description: '메뉴 이름 또는 주소', status: '필수' },
            { label: '무엇을 했는지', description: '누른 순서대로', status: '필수' },
            { label: '기대한 결과', description: '어떻게 되길 바랐는지', status: '필수' },
            { label: '스크린샷', description: '붙여넣기(Ctrl+V)로 바로 첨부', status: '권장' },
          ],
        },
      },
      {
        type: 'checklist',
        col: 10,
        span: 3,
        row: 19,
        rowSpan: 14,
        props: {
          title: '이렇게 처리됩니다',
          subtitle: '',
          items: [
            { label: '접수', description: '남긴 글이 그대로 접수됩니다', status: '자동' },
            { label: '검토', description: '재현 확인 후 답글을 답니다', status: '진행' },
            { label: '반영', description: '고쳐지면 이 대화에 알립니다', status: '완료' },
          ],
        },
      },
    ],
  };
}

// ── 액션 ────────────────────────────────────────────────────────────────────

export function buildActions(): ActionPlan[] {
  // 배열 리터럴에 CREATE와 UPDATE를 함께 담으면 TS가 둘을 하나로 뭉뚱그려(각 항목의 없는 속성을
  // `undefined`로 채워) 판별 유니온과 어긋난다. 하나씩 넣어 항목별로 검사받게 한다.
  const requestActions: ActionPlan[] = [];
  for (const type of REQUEST_TYPES) {
    const k = (name: string) => nodeKey(type.slug, name);
    const extras = Object.fromEntries(type.extras.map((e) => [e.col, { from: 'component' as const, node: k(e.key) }]));
    requestActions.push(
      {
        key: `act-req-create-${type.slug}`,
        name: `${type.pageTitle} 의뢰 등록`,
        desc: `${type.pageTitle} 의뢰서를 등록한다(유형 고정 · 의뢰번호 자동)`,
        kind: 'CREATE',
        table: 'analysis_requests',
        values: {
          request_no: { from: 'sequence', prefix: 'REQ-', digits: 6 },
          far_no: { from: 'component', node: k('req-far') },
          request_type: { from: 'literal', value: type.typeValue },
          requester: { from: 'component', node: k('req-requester') },
          due_date: { from: 'component', node: k('req-due') },
          priority: { from: 'component', node: k('req-priority') },
          content: { from: 'component', node: k('req-content') },
          request_date: { from: 'now' },
          req_status: { from: 'literal', value: '접수' },
          ...extras,
        },
      },
      {
        key: `act-req-result-${type.slug}`,
        name: `${type.pageTitle} 결과 등록`,
        desc: `선택한 의뢰에 결과 요약과 진행상태를 반영한다`,
        kind: 'UPDATE',
        table: 'analysis_requests',
        keyCol: 'request_no',
        keyFrom: { from: 'route', param: 'sel' },
        values: {
          result_summary: { from: 'component', node: k('res-summary') },
          req_status: { from: 'component', node: k('res-status') },
        },
      }
    );
  }

  return [
    {
      key: 'act-claim-owner',
      name: 'Claim 담당자 변경',
      desc: '선택한 Claim의 담당자를 바꾼다',
      kind: 'UPDATE',
      table: 'claims',
      keyCol: 'far_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: { owner: { from: 'component', node: 'claim-owner' } },
    },
    {
      key: 'act-claim-status',
      name: 'Claim 진행상태 변경',
      desc: '선택한 Claim의 진행상태를 바꾼다',
      kind: 'UPDATE',
      table: 'claims',
      keyCol: 'far_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: { claim_status: { from: 'component', node: 'claim-status' } },
    },
    { key: 'act-go-techreport', name: 'Tech Report 화면으로', desc: 'FA Tech Report 작성 화면으로 이동한다', kind: 'NAVIGATE', pageSlug: 'fa-tech-report' },
    {
      key: 'act-claim-export',
      name: 'Claim CSV 내보내기',
      desc: 'Claim 원장을 CSV로 내려받는다',
      kind: 'EXPORT_CSV',
      table: 'claims',
      filename: 'claims.csv',
    },
    {
      key: 'act-fa-assign',
      name: 'FA 담당자 배정',
      desc: '선택한 Claim에 담당자를 배정한다(배정번호 자동)',
      kind: 'CREATE',
      table: 'fa_assignments',
      values: {
        assign_no: { from: 'sequence', prefix: 'ASG-', digits: 6 },
        far_no: { from: 'route', param: 'sel' },
        assign_type: { from: 'literal', value: '배정' },
        assignee: { from: 'component', node: 'assign-assignee' },
        due_date: { from: 'component', node: 'assign-due' },
        priority: { from: 'component', node: 'assign-priority' },
        note: { from: 'component', node: 'assign-note' },
        assigned_date: { from: 'now' },
        fa_status: { from: 'literal', value: '배정' },
      },
      onSuccess: 'act-claim-to-assigned',
    },
    {
      // 배정하면 Claim 쪽 상태도 함께 움직여야 한다 — 안 그러면 미배정 목록에 계속 남는다.
      key: 'act-claim-to-assigned',
      name: '배정 후 Claim 상태 반영',
      desc: '배정한 Claim의 진행상태를 배정으로 바꾸고 담당자를 채운다',
      kind: 'UPDATE',
      table: 'claims',
      keyCol: 'far_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: {
        claim_status: { from: 'literal', value: '배정' },
        owner: { from: 'component', node: 'assign-assignee' },
        due_date: { from: 'component', node: 'assign-due' },
      },
    },
    {
      key: 'act-fa-handover',
      name: 'FA 인수인계 등록',
      desc: '선택한 건의 담당을 넘긴다(이력번호 자동)',
      kind: 'CREATE',
      table: 'fa_assignments',
      values: {
        assign_no: { from: 'sequence', prefix: 'ASG-', digits: 6 },
        far_no: { from: 'route', param: 'sel' },
        assign_type: { from: 'literal', value: '인수인계' },
        assignee: { from: 'component', node: 'ho-assignee' },
        prev_assignee: { from: 'component', node: 'ho-prev' },
        due_date: { from: 'component', node: 'ho-due' },
        priority: { from: 'component', node: 'ho-priority' },
        note: { from: 'component', node: 'ho-note' },
        assigned_date: { from: 'now' },
        fa_status: { from: 'literal', value: '분석중' },
      },
      onSuccess: 'act-claim-owner-handover',
    },
    {
      key: 'act-claim-owner-handover',
      name: '인수인계 후 Claim 담당 반영',
      desc: '인계받은 담당자를 Claim 원장에도 반영한다',
      kind: 'UPDATE',
      table: 'claims',
      keyCol: 'far_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: { owner: { from: 'component', node: 'ho-assignee' } },
    },
    {
      key: 'act-techreport',
      name: 'Tech Report 검토 요청',
      desc: '선택한 Claim의 분석 결과를 기록한다(리포트번호·작성일시 자동)',
      kind: 'CREATE',
      table: 'fa_tech_reports',
      values: {
        report_no: { from: 'sequence', prefix: 'FTR-', digits: 6 },
        far_no: { from: 'route', param: 'sel' },
        author: { from: 'component', node: 'tr-author' },
        written_at: { from: 'now' },
        fail_mode: { from: 'component', node: 'tr-failmode' },
        ng_location: { from: 'component', node: 'tr-location' },
        observation: { from: 'component', node: 'tr-observation' },
        root_cause: { from: 'component', node: 'tr-cause' },
        conclusion: { from: 'component', node: 'tr-conclusion' },
        report_status: { from: 'literal', value: '검토요청' },
        to_dev_lab: { from: 'component', node: 'tr-dev' },
      },
    },
    {
      key: 'act-reball-request',
      name: 'Reball 의뢰 등록',
      desc: '선택한 Claim으로 Reball 작업을 의뢰한다(의뢰번호 자동)',
      kind: 'CREATE',
      table: 'reball_requests',
      values: {
        request_no: { from: 'sequence', prefix: 'RB-', digits: 6 },
        far_no: { from: 'route', param: 'sel' },
        requester: { from: 'component', node: 'rb-requester' },
        request_date: { from: 'now' },
        qty: { from: 'component', node: 'rb-qty' },
        package_type: { from: 'component', node: 'rb-package' },
        vendor: { from: 'component', node: 'rb-vendor' },
        out_date: { from: 'component', node: 'rb-out' },
        in_date: { from: 'component', node: 'rb-in' },
        work_note: { from: 'component', node: 'rb-note' },
        reball_status: { from: 'literal', value: '의뢰' },
      },
    },
    {
      key: 'act-reball-update',
      name: 'Reball 진행 이력 등록',
      desc: '선택한 의뢰의 진행 이력을 남긴다',
      kind: 'CREATE',
      table: 'reball_updates',
      values: {
        request_no: { from: 'route', param: 'sel' },
        update_type: { from: 'component', node: 'rs-stage' },
        update_date: { from: 'component', node: 'rs-date' },
        worker: { from: 'component', node: 'rs-worker' },
        note: { from: 'component', node: 'rs-note' },
      },
    },
    {
      key: 'act-reball-stage',
      name: 'Reball 진행 단계 반영',
      desc: '선택한 의뢰의 진행 단계를 바꾼다',
      kind: 'UPDATE',
      table: 'reball_requests',
      keyCol: 'request_no',
      keyFrom: { from: 'route', param: 'sel' },
      values: { reball_status: { from: 'component', node: 'rs-stage' } },
    },
    {
      // 이력과 단계는 반드시 함께 움직여야 한다 — 하나만 남으면 "왜 바뀌었는지 모르는 상태"나
      // "이력은 있는데 목록은 그대로"가 된다. 한 트랜잭션으로 묶는다.
      key: 'act-reball-progress',
      name: 'Reball 상태 업데이트',
      desc: '진행 이력을 남기고 의뢰의 단계를 함께 바꾼다',
      kind: 'COMPOSITE',
      steps: ['act-reball-update', 'act-reball-stage'],
    },
    {
      key: 'act-tip-create',
      name: 'Tip 등록',
      desc: '분석 Tip을 등록한다(글번호·작성일 자동)',
      kind: 'CREATE',
      table: 'tips',
      values: {
        post_no: { from: 'sequence', prefix: 'TIP-', digits: 6 },
        title: { from: 'component', node: 'tip-title' },
        category: { from: 'component', node: 'tip-category' },
        author: { from: 'component', node: 'tip-author' },
        tags: { from: 'component', node: 'tip-tags' },
        content: { from: 'component', node: 'tip-content' },
        created_date: { from: 'now' },
        updated_date: { from: 'now' },
        views: { from: 'literal', value: 0 },
        helpful: { from: 'literal', value: 0 },
        is_pinned: { from: 'literal', value: 'N' },
      },
    },
    ...requestActions,
  ];
}
