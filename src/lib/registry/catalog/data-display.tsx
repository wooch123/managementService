import { z } from 'zod';
import { seriesColor } from '@/lib/theme/series-color';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTable as DataTableUi } from '@/components/ui/data-table';
import { SelectableTable } from '@/components/runtime/SelectableTable';
import { RowActionButton } from '@/components/runtime/RowActionButton';
import { CrosstabTable, CrosstabTablePreview } from '@/components/runtime/CrosstabTable';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyP,
  TypographyLead,
  TypographyMuted,
} from '@/components/ui/typography';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownRight, ArrowUpRight, Inbox } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { categoricalXAxisProps, estimateTextWidth, yAxisLabelProps } from '@/lib/chart-axis';
import { asSeriesResult, selectedColumns, toLabelValueSeries, toMatrixSeries, toStackedRows } from '@/lib/chart-series';
import { cn } from '@/lib/utils';
import { statusBadgeClass } from '@/lib/status-tone';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 계열 색. 테마 토큰만 쓰고(밝기·다크 모드가 함께 따라온다), **의미에 따라** 고른다 —
 * 모든 차트를 브랜드 파랑 하나로 그리면 접수·불량·고객사가 전부 같은 그림으로 보인다(디자인 리뷰 ④).
 */
const COLORWAY = {
  primary: 'var(--chart-1)',  // 핵심 지표·접수량
  positive: 'var(--chart-2)', // 완료·개선처럼 좋은 방향
  accent: 'var(--chart-3)',   // 보조 분류(고객사 등)
  warning: 'var(--chart-4)',  // 불량·지연처럼 살펴야 하는 것
  neutral: 'var(--chart-5)',  // 중립 분포
} as const;

function colorwayConfig(color: keyof typeof COLORWAY = 'primary'): ChartConfig {
  return { value: { label: '값', color: COLORWAY[color] ?? COLORWAY.primary } };
}

const chartConfig = colorwayConfig('primary');
const sampleChartData = [
  { label: '1월', value: 12 },
  { label: '2월', value: 19 },
  { label: '3월', value: 8 },
];

/** 누적 막대의 팔레트 미리보기 — 축이 둘인 결과와 같은 봉투로 만들어 둔다. */
const SAMPLE_STACKED = {
  columns: [
    { columnName: 'label', fieldId: null, dataType: 'TEXT' },
    { columnName: 'series', fieldId: null, dataType: 'TEXT' },
    { columnName: 'value', fieldId: null, dataType: 'REAL' },
  ],
  rows: [
    { label: '1월', series: 'A', value: 12 },
    { label: '1월', series: 'B', value: 7 },
    { label: '2월', series: 'A', value: 19 },
    { label: '2월', series: 'B', value: 11 },
    { label: '3월', series: 'A', value: 8 },
    { label: '3월', series: 'B', value: 14 },
  ],
};

/**
 * 집계 결과를 KPI 타일이 읽는 모양으로. 숫자 하나만 오거나(비교 없음)
 * { value, previous }가 온다(직전 동일 기간과 비교, types/binding.ts의 aggregate.compare).
 */
function toKpi(data: unknown): { value: number; previous: number | null } | null {
  if (typeof data === 'number') return { value: data, previous: null };
  if (data && typeof data === 'object' && 'value' in data) {
    const d = data as { value: unknown; previous?: unknown };
    if (typeof d.value === 'number') {
      return { value: d.value, previous: typeof d.previous === 'number' ? d.previous : null };
    }
  }
  return null;
}

function formatChartNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);
}

/** 조회 결과 → { label, value } 배열. 규칙은 lib/chart-series.ts에 한 벌만 둔다. */
const toChartSeries = toLabelValueSeries;

const asListResult = asSeriesResult;

const DATE_TYPES = new Set(['DATE', 'DATETIME']);
const NUMERIC_TYPES = new Set(['INTEGER', 'REAL']);
const DAY_MS = 86_400_000;

const toDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 간트 막대 — select 순서에서 첫 텍스트 컬럼을 항목명, 첫 두 날짜 컬럼을 시작/종료로 해석한다. */
function toGanttBars(data: unknown): { label: string; start: Date; end: Date }[] {
  const r = asListResult(data);
  if (!r) return [];
  const selected = selectedColumns(r.columns);
  const dateCols = selected.filter((c) => DATE_TYPES.has(c.dataType));
  const labelCol = selected.find((c) => !DATE_TYPES.has(c.dataType) && !NUMERIC_TYPES.has(c.dataType)) ?? selected[0];
  if (!labelCol || dateCols.length === 0) return [];
  const [startCol, endCol] = dateCols;

  const bars: { label: string; start: Date; end: Date }[] = [];
  for (const row of r.rows) {
    const start = toDate(row[startCol.columnName]);
    if (!start) continue;
    const rawEnd = endCol ? toDate(row[endCol.columnName]) : null;
    // 종료일이 없거나 시작보다 이르면 하루짜리 막대(마일스톤)로 그린다.
    const end = rawEnd && rawEnd.getTime() > start.getTime() ? rawEnd : new Date(start.getTime() + DAY_MS);
    bars.push({ label: String(row[labelCol.columnName] ?? '-'), start, end });
  }
  return bars.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** 칸반 — 첫 ENUM(없으면 첫 비숫자) 컬럼으로 열을 나누고, 그 다음 텍스트 컬럼을 카드 제목으로 쓴다. */
function toKanbanBoard(data: unknown): { column: string; cards: { title: string; meta: string[] }[] }[] {
  const r = asListResult(data);
  if (!r) return [];
  const selected = selectedColumns(r.columns);
  const groupCol = selected.find((c) => c.dataType === 'ENUM') ?? selected.find((c) => !NUMERIC_TYPES.has(c.dataType));
  if (!groupCol) return [];
  const titleCol = selected.find((c) => c !== groupCol && !NUMERIC_TYPES.has(c.dataType)) ?? selected.find((c) => c !== groupCol);
  const metaCols = selected.filter((c) => c !== groupCol && c !== titleCol).slice(0, 2);

  const map = new Map<string, { title: string; meta: string[] }[]>();
  for (const row of r.rows) {
    const key = String(row[groupCol.columnName] ?? '미분류');
    const card = {
      title: titleCol ? String(row[titleCol.columnName] ?? '-') : '-',
      meta: metaCols.map((c) => String(row[c.columnName] ?? '')).filter(Boolean),
    };
    map.set(key, [...(map.get(key) ?? []), card]);
  }
  return [...map].map(([column, cards]) => ({ column, cards }));
}

const SAMPLE_GANTT = [
  { label: '접수', start: new Date('2026-08-01'), end: new Date('2026-08-05') },
  { label: '초도 분석', start: new Date('2026-08-04'), end: new Date('2026-08-12') },
  { label: 'Reball', start: new Date('2026-08-10'), end: new Date('2026-08-18') },
  { label: '상세 분석', start: new Date('2026-08-14'), end: new Date('2026-08-26') },
];
const SAMPLE_KANBAN = [
  { column: '접수', cards: [{ title: 'FAR-26-1001', meta: ['김도현'] }, { title: 'FAR-26-1007', meta: ['이서연'] }] },
  { column: '진행중', cards: [{ title: 'FAR-26-1012', meta: ['박준혁'] }] },
  { column: '완료', cards: [{ title: 'FAR-26-1003', meta: ['최민지'] }, { title: 'FAR-26-1009', meta: ['정우성'] }] },
];

type SampleRow = { col1: string; col2: string };
const sampleColumns: ColumnDef<SampleRow>[] = [
  { accessorKey: 'col1', header: '컬럼 1' },
  { accessorKey: 'col2', header: '컬럼 2' },
];

type CellFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'badge' | 'boolean';
type CellAlign = 'left' | 'center' | 'right';

const ALIGN_CLASS: Record<CellAlign, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

/**
 * 칸의 값을 사람이 읽는 문자열로.
 *
 * 조회 결과는 **저장 형태 그대로** 온다 — BOOLEAN은 0/1이고 숫자는 서식이 없다. 그대로 그리면
 * "긴급 1", "총액 120000"이 되어 표가 읽히지 않는다. 어떤 서식을 쓸지는 설계(열의 `format`)가
 * 정한다 — 같은 REAL이라도 EC 값과 가격은 다르게 읽혀야 하기 때문이다.
 */
function formatCellText(raw: unknown, format: CellFormat): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  switch (format) {
    case 'boolean':
      return raw === true || Number(raw) === 1 ? 'Y' : 'N';
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n.toLocaleString('ko-KR') : String(raw);
    }
    case 'currency': {
      const n = Number(raw);
      return Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : String(raw);
    }
    case 'datetime': {
      const text = String(raw);
      return text.includes('T') ? text.replace('T', ' ').slice(0, 16) : text;
    }
    default:
      return String(raw);
  }
}

export const dataDisplayComponents = [
  defineComponent({
    key: 'table',
    label: '기본 테이블',
    group: '데이터 표시',
    icon: 'table',
    description: '정적 HTML 테이블',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      columns: z.array(z.string()).default(['컬럼 1', '컬럼 2']),
    }),
    defaultProps: { columns: ['컬럼 1', '컬럼 2'] },
    defaultGrid: { span: 12, rowSpan: 20 },
    render: ({ props }) => (
      <Table>
        <TableHeader>
          <TableRow>
            {props.columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            {props.columns.map((c) => (
              <TableCell key={c} className="text-muted-foreground">
                —
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    ),
  }),
  defineComponent({
    key: 'data-table',
    label: '데이터 테이블',
    group: '데이터 표시',
    icon: 'table-2',
    description: '정렬·필터·페이지네이션을 지원하는 데이터 그리드',
    isContainer: false,
    bindingModes: ['list'],
    events: [
      { name: 'onRowClick', label: '행 클릭 시', payload: 'row' },
      { name: 'onSelectionChange', label: '선택 변경 시', payload: 'rows' },
      { name: 'onCreateClick', label: '새로 만들기 클릭', payload: null },
    ],
    propsSchema: z.object({
      title: z.string().default(''),
      columns: z
        .array(
          z.object({
            fieldId: z.string(),
            header: z.string(),
            width: z.number().optional(),
            align: z.enum(['left', 'center', 'right']).default('left'),
            format: z.enum(['text', 'number', 'currency', 'date', 'datetime', 'badge', 'boolean']).default('text'),
          })
        )
        .default([]),
      showSearch: z.boolean().default(true),
      /**
       * 한 쪽에 몇 줄을 보여 줄지. 카드 높이에 맞춰 정한다 — 예전에는 열 줄로 고정이라
       * 카드를 키워도 표는 그대로고 아래만 비었다.
       */
      pageSize: z.number().int().min(5).max(100).default(10),
      showExport: z.boolean().default(false),
      /** 표 위 복사 단추 — 스프레드시트에 그대로 붙여 넣을 형식으로 클립보드에 담는다. */
      showCopy: z.boolean().default(false),
      selectable: z.boolean().default(false),
      density: z.enum(['compact', 'default', 'comfortable']).default('default'),
      emptyText: z.string().default('데이터가 없습니다'),
      /**
       * 행을 고르면 그 값을 적을 주소 파라미터 이름(비우면 선택 없는 정적인 표).
       *
       * 청사진의 뼈대인 "목록에서 고르면 상세가 따라온다"를 만드는 곳이다. 선택은 화면 안의
       * 상태가 아니라 **주소**에 남는다 — 기간 필터와 같은 방식이라 상세·이력 패널은 바인딩
       * 필터에 `주소 쿼리`를 걸어 두기만 하면 되고, 고른 화면을 링크로 공유할 수 있다.
       */
      selectParam: z.string().default(''),
      /** 선택값으로 쓸 필드(대개 FAR No·의뢰번호 같은 업무 키) */
      selectFieldId: z.string().default(''),
      /**
       * 행을 누르면 갈 다른 화면(비우면 지금 화면에서 고른다).
       * 상세 패널이 없는 목록에서 행을 눌러도 아무 일이 없으면, 그 목록은 읽을 수만 있고
       * 아무 데도 이어지지 않는다 — 청사진 01의 "행 선택 후 바로 이동"이 이 자리다.
       */
      selectSlug: z.string().default(''),
      /**
       * 마지막 칸에 붙일 **줄 단추**. 셋이 모두 채워져야 나온다.
       *
       * 주소에 싣는 값은 `selectFieldId`가 가리키는 칸이다 — 고를 때 쓰는 업무 키와 넘길 때
       * 쓰는 값이 다를 이유가 없고, 둘을 따로 두면 어긋났을 때 조용히 빈 주소로 넘어간다.
       */
      rowActionLabel: z.string().default(''),
      rowActionSlug: z.string().default(''),
      rowActionParam: z.string().default(''),
    }),
    defaultProps: {
      title: '',
      columns: [],
      showSearch: true,
      pageSize: 10,
      showExport: false,
      showCopy: false,
      selectable: false,
      density: 'default',
      emptyText: '데이터가 없습니다',
      selectParam: '',
      selectFieldId: '',
      selectSlug: '',
      rowActionLabel: '',
      rowActionSlug: '',
      rowActionParam: '',
    },
    defaultGrid: { span: 12, rowSpan: 40 },
    render: ({ props, data }) => {
      // resolveBindingData(list 모드)는 { rows, total, columns }를 반환한다(data-engine/query.ts
      // runListQuery) — 바인딩이 없거나(빌더 캔버스 미리보기) 아직 로드 전이면 data는 undefined다.
      // 행 객체는 fieldId가 아니라 실제 DB columnName으로 키가 잡히므로(§4.3 운영 DB 명명 규칙),
      // TanStack의 accessorKey도 fieldId를 그대로 쓰면 안 되고 이 columns 메타로 columnName을
      // 찾아 써야 한다 — rows와 columns는 항상 같은 runListQuery 호출에서 나와 서로 어긋나지 않는다.
      const resultColumns =
        data && typeof data === 'object' && Array.isArray((data as { columns?: unknown }).columns)
          ? (data as { columns: { fieldId: string | null; columnName: string }[] }).columns
          : [];
      const columnNameByFieldId = new Map(
        resultColumns.filter((c): c is { fieldId: string; columnName: string } => !!c.fieldId).map((c) => [c.fieldId, c.columnName])
      );
      const columns: ColumnDef<Record<string, unknown>>[] =
        props.columns.length > 0
          ? props.columns.map((c) => {
              const align = (c.align ?? 'left') as CellAlign;
              const format = (c.format ?? 'text') as CellFormat;
              return {
                accessorKey: columnNameByFieldId.get(c.fieldId) ?? c.fieldId,
                // 화면 머리글은 서식이 붙은 React 노드다 — 내보낼 때 쓸 글자는 따로 남긴다.
                meta: { exportHeader: c.header },
                // 양식의 표 머리글 규격 — 작은 대문자 라벨(색을 물리고 자간을 벌린다).
                // 한글 머리글은 대문자 변환의 영향을 받지 않아 그대로 읽힌다.
                header: () => (
                  <span className={cn('block text-[11px] font-semibold tracking-wider uppercase text-muted-foreground', ALIGN_CLASS[align])}>
                    {c.header}
                  </span>
                ),
                cell: ({ getValue }: { getValue: () => unknown }) => {
                  const raw = getValue();
                  if (format === 'badge' && raw !== null && raw !== undefined && raw !== '') {
                    return <span className={statusBadgeClass(String(raw))}>{String(raw)}</span>;
                  }
                  return <span className={cn('block', ALIGN_CLASS[align], format === 'number' || format === 'currency' ? 'tabular-nums' : '')}>{formatCellText(raw, format)}</span>;
                },
              };
            })
          : sampleColumns as unknown as ColumnDef<Record<string, unknown>>[];
      const rows =
        data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
          ? ((data as { rows: Record<string, unknown>[] }).rows)
          : [];
      // 선택을 켜려면 "어디에 적을지(selectParam)"와 "무엇을 적을지(selectFieldId)"가 모두 있어야
      // 한다. 필드가 조회 결과에 없으면(설계 변경 등) 조용히 정적인 표로 물러난다.
      const selectColumn = props.selectFieldId ? (columnNameByFieldId.get(props.selectFieldId) ?? null) : null;
      const selectable = props.selectParam !== '' && selectColumn !== null;

      /**
       * 줄 단추는 맨 뒤에 붙인다. 실을 값이 없으면(설계 변경 등) 조용히 붙이지 않는다 —
       * 누를 때마다 빈 주소로 넘어가는 단추보다 없는 편이 낫다.
       *
       * **새 배열을 만든다.** 위의 `columns`는 props에 칸 정의가 없을 때 모듈 상수(sampleColumns)를
       * 그대로 가리키므로, 여기서 push하면 그 상수가 영구히 오염돼 빌더 미리보기의 모든 표에
       * 단추가 쌓인다.
       */
      const withAction: ColumnDef<Record<string, unknown>>[] =
        props.rowActionLabel && props.rowActionSlug && props.rowActionParam && selectColumn
          ? [
              ...columns,
              {
                id: 'row-action',
                // 표가 넘쳐도 이 칸만은 오른쪽에 붙어 있는다(globals.css의 .dt-pin-right).
                meta: { exportHeader: props.rowActionLabel, cellClass: 'dt-pin-right' },
                header: () => (
                  <span className="block text-center text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    {props.rowActionLabel}
                  </span>
                ),
                cell: ({ row }: { row: { original: Record<string, unknown> } }) => (
                  <RowActionButton
                    label={props.rowActionLabel}
                    slug={props.rowActionSlug}
                    param={props.rowActionParam}
                    value={String(row.original[selectColumn] ?? '')}
                  />
                ),
              } as ColumnDef<Record<string, unknown>>,
            ]
          : columns;
      return (
        <div className="flex flex-col gap-2">
          {props.title && <h3 className="chart-title">{props.title}</h3>}
          {selectable ? (
            <SelectableTable
              columns={withAction}
              data={rows}
              emptyText={props.emptyText}
              showSearch={props.showSearch}
              pageSize={props.pageSize}
              showExport={props.showExport}
              showCopy={props.showCopy}
              exportName={props.title || '표'}
              param={props.selectParam}
              column={selectColumn}
              slug={props.selectSlug || undefined}
            />
          ) : (
            <DataTableUi
              columns={withAction}
              data={rows}
              emptyText={props.emptyText}
              showSearch={props.showSearch}
              pageSize={props.pageSize}
              showExport={props.showExport}
              showCopy={props.showCopy}
              exportName={props.title || '표'}
            />
          )}
        </div>
      );
    },
  }),
  defineComponent({
    key: 'chart',
    label: '차트',
    group: '데이터 표시',
    icon: 'chart-column',
    description: '막대/선 차트(list 바인딩) 또는 집계 KPI 숫자(aggregate 바인딩)',
    isContainer: false,
    // 지표 타일과 차트가 한 컴포넌트다 — 표면은 둘 중 더 자주 쓰이는 차트 기준으로 물러나게 두고,
    // 지표는 숫자 자체가 크고 진해 충분히 앞선다.
    surface: 'quiet',
    bindingModes: ['list', 'aggregate', 'group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      chartType: z.enum(['bar', 'bar-horizontal', 'line']).default('bar'),
      /** 계열 색 — 파랑 하나로 모든 차트를 그리면 종류 구분이 안 된다(디자인 리뷰 ④). */
      color: z.enum(['primary', 'positive', 'accent', 'warning', 'neutral']).default('primary'),
      unit: z.string().default(''),
      /** 비워 두면 y축을 그리지 않는다(지금까지의 모양). 값을 넣으면 축과 함께 세로 이름이 붙는다. */
      yLabel: z.string().default(''),
    }),
    defaultProps: { title: '', chartType: 'bar', color: 'primary', unit: '', yLabel: '' },
    defaultGrid: { span: 6, rowSpan: 25 },
    render: ({ props, data }) => {
      const heading = props.title ? <h3 className="chart-title">{props.title}</h3> : null;

      // data === undefined: 바인딩 데이터를 주지 않는 호출자(빌더 캔버스/팔레트 미리보기)다.
      // 이때만 샘플 데이터로 모양을 보여준다 — 운영 렌더러는 항상 값(숫자/객체/null)을 넘긴다.
      if (data === undefined) {
        return (
          <div className="flex h-full min-h-[120px] flex-col gap-2">
            {heading}
            <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-0 w-full flex-1">
              <BarChart data={sampleChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...categoricalXAxisProps(sampleChartData.map((d) => d.label))} />
                {(props.yLabel ?? '').trim() ? (
                  <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            </ChartContainer>
          </div>
        );
      }

      // aggregate 바인딩 → 숫자 하나(§6.4), 비교를 켜면 { value, previous }. KPI 타일로 렌더한다.
      const kpi = toKpi(data);
      if (kpi) {
        const delta = kpi.previous !== null && kpi.previous !== 0 ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) : null;
        return (
          // Tremor KPI 카드 규격: 레이블 14px/500 회색, 지표 30px/600 진한 회색.
          <div className="flex h-full flex-col justify-center gap-1.5">
            {props.title && <span className="text-sm font-medium text-muted-foreground">{props.title}</span>}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold text-foreground tabular-nums">
                {formatChartNumber(kpi.value)}
                {props.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{props.unit}</span>}
              </span>
              {/* 직전 같은 길이의 기간 대비 증감. 숫자 하나만 크게 띄우면 많은 건지 적은 건지
                  알 수 없다 — 견줄 값이 있을 때만 붙인다. 색은 좋고 나쁨이 아니라 방향만 나타낸다. */}
              {delta !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
                    delta > 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : delta < 0 ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    : 'bg-muted text-muted-foreground'
                  )}
                  title={`직전 동일 기간 ${formatChartNumber(kpi.previous ?? 0)}${props.unit}`}
                >
                  {delta > 0 ? <ArrowUpRight className="size-3" /> : delta < 0 ? <ArrowDownRight className="size-3" /> : null}
                  {delta > 0 ? '+' : ''}
                  {(delta * 100).toFixed(delta !== 0 && Math.abs(delta) < 0.1 ? 1 : 0)}%
                </span>
              )}
            </div>
          </div>
        );
      }

      // list 바인딩 → { rows, total, columns }. x축은 첫 번째 비숫자 컬럼, 값은 첫 번째 숫자
      // 컬럼을 쓴다(숫자 컬럼이 없으면 카테고리별 건수). select 순서는 관리자가 바인딩 편집기에서
      // 정하므로, 이 규칙이 곧 "먼저 고른 것이 축, 그 다음 숫자가 값"이라는 예측 가능한 계약이 된다.
      const series = toChartSeries(data);
      if (series.length === 0) {
        return (
          <div className="flex h-full flex-col gap-2">
            {heading}
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 데이터가 없습니다
            </div>
          </div>
        );
      }

      return (
        // 그리드 셀 높이를 그대로 쓴다 — ChartContainer 기본값(aspect-video)을 그대로 두면 폭 넓은
        // 차트가 셀보다 훨씬 커져 아래 컴포넌트를 덮는다(실제로 대시보드에서 겹침 발생).
        <div className="flex h-full min-h-[120px] flex-col gap-2">
          {heading}
          <ChartContainer config={colorwayConfig(props.color)} className="aspect-auto h-full min-h-0 w-full flex-1">
            {props.chartType === 'bar-horizontal' ? (
              /**
               * 가로 막대 — 항목이 많거나 이름이 긴 분류에 쓴다.
               *
               * 세로 막대는 항목 이름을 가로축에 늘어놓아야 해서, 열 개쯤 되면 -35°~-60°로 기울고
               * 서로 겹쳐 읽기 어렵다(Fail Mode 10종·고객사 8종에서 실제로 그랬다). 가로로 눕히면
               * 이름이 한 줄로 반듯하게 서고 값의 길이 비교도 그대로 된다.
               */
              <BarChart data={series} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  // 하나도 건너뛰지 않는다. 기본값(preserveEnd)은 자리가 빠듯하면 이름을 통째로
                  // 빼버려, 열 개 중 다섯 개만 이름이 붙은 그래프가 된다(실측).
                  interval={0}
                  // 가장 긴 이름이 **한 줄로** 들어갈 만큼 넓힌다. 좁으면 recharts가 글자를 접어
                  // 두 줄로 만들어 막대와 어긋난다. 너무 넓히면 막대가 그만큼 짧아지므로 상한을 둔다.
                  width={Math.min(200, Math.max(64, Math.ceil(Math.max(...series.map((s) => estimateTextWidth(s.label))) * 1.25 + 24)))}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            ) : props.chartType === 'line' ? (
              <LineChart data={series}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...categoricalXAxisProps(series.map((s) => s.label))} />
                {(props.yLabel ?? '').trim() ? (
                  <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={series}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...categoricalXAxisProps(series.map((s) => s.label))} />
                {(props.yLabel ?? '').trim() ? (
                  <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      );
    },
  }),
  /**
   * 누적 세로 막대 — 하나의 분류를 두 번째 축으로 쪼개어 쌓는다.
   *
   * 왜 차트 컴포넌트에 종류 하나를 더 넣지 않고 따로 두는가: 여기는 축이 둘인 결과
   * (`{ label, series, value }`)를 받는다. 막대/선 차트는 축 하나짜리라 같은 속성 상자를
   * 공유하면 "쌓을 기준"이 늘 비어 있는 채로 붙어 다닌다. 읽는 데이터가 다르면 컴포넌트도 다르다.
   */
  defineComponent({
    key: 'chart-stacked',
    label: '누적 세로 막대',
    group: '데이터 표시',
    icon: 'chart-column-stacked',
    description: '분류별 막대를 두 번째 축으로 쌓아 구성비까지 함께 본다',
    isContainer: false,
    surface: 'quiet',
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      unit: z.string().default(''),
      yLabel: z.string().default(''),
      /** 층을 몇 개까지 색으로 구분할지 — 넘치면 '기타'로 합친다. */
      maxSeries: z.number().int().min(2).max(8).default(6),
      showLegend: z.boolean().default(true),
    }),
    defaultProps: { title: '', subtitle: '', unit: '', yLabel: '', maxSeries: 6, showLegend: true },
    defaultGrid: { span: 6, rowSpan: 22 },
    render: ({ props, data }) => {
      const matrix = toMatrixSeries(data === undefined ? SAMPLE_STACKED : data, props.maxSeries);
      const rows = toStackedRows(matrix);
      const config: ChartConfig = Object.fromEntries(
        matrix.seriesKeys.map((key, i) => [key, { label: key, color: seriesColor(i) }])
      );

      return (
        <div className="flex h-full min-h-[140px] flex-col gap-1">
          {props.title ? <h3 className="chart-title">{props.title}</h3> : null}
          {props.subtitle ? <p className="text-xs text-muted-foreground">{props.subtitle}</p> : null}
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 데이터가 없습니다
            </div>
          ) : (
            <>
              {props.showLegend ? (
                <div className="chart-ink flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
                  {matrix.seriesKeys.map((key, i) => (
                    <span key={key} className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: seriesColor(i) }}
                      />
                      {key}
                    </span>
                  ))}
                </div>
              ) : null}
              <ChartContainer config={config} className="aspect-auto h-full min-h-0 w-full flex-1">
                <BarChart data={rows}>
                  <CartesianGrid vertical={false} />
                  {/* 이 차트는 y축을 늘 그리고 범례도 한 줄 차지한다 — 그림에 남는 가로 폭이
                      기본 추정치(520)보다 좁다. 그대로 두면 긴 이름이 겹쳐 찍힌다. */}
                  <XAxis dataKey="label" {...categoricalXAxisProps(matrix.labels, { plotWidth: 450 })} />
                  {(props.yLabel ?? '').trim() ? (
                    <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : (
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={34} />
                  )}
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {matrix.seriesKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={seriesColor(i)}
                      /*
                       * 맨 위 층에만, 그것도 얕게. 중간 층까지 둥글면 층 사이가 벌어져 보이고,
                       * 맨 위가 너무 둥글면 막대가 봉긋해져 값을 실제보다 크게 읽게 된다
                       * (사용자 지적으로 4 → 2로 낮췄다). 값이 작은 층이 맨 위에 올 때 특히 그랬다.
                       */
                      radius={i === matrix.seriesKeys.length - 1 ? [2, 2, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            </>
          )}
        </div>
      );
    },
  }),
  /**
   * 교차 집계 표 — 같은 (분류 × 계열) 결과를 색이 아니라 **숫자로** 읽는 자리.
   *
   * 히트맵은 어디에 몰렸는지를 보고, 이 표는 몇 건인지를 센다. 세로 합계와 맨 아래 누적 줄이
   * 함께 나오므로 표를 눈으로 더할 필요가 없다.
   */
  defineComponent({
    key: 'crosstab-table',
    label: '교차 집계 표',
    group: '데이터 표시',
    icon: 'table-2',
    description: '세로 분류 × 가로 분류의 건수를 표로 — 줄 합계와 맨 아래 누적까지',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      description: z.string().default(''),
      /** 왼쪽 위 모서리에 적을 세로축 이름 — 무엇으로 나눈 줄인지 밝힌다. */
      rowLabel: z.string().default('구분'),
      /** 가로로 늘어놓을 계열 수 상한 — 넘치면 '기타'로 합친다. */
      maxColumns: z.number().int().min(2).max(8).default(8),
    }),
    defaultProps: { title: '', description: '', rowLabel: '구분', maxColumns: 8 },
    defaultGrid: { span: 12, rowSpan: 20 },
    render: ({ props, data }) =>
      data === undefined ? (
        <CrosstabTablePreview title={props.title} />
      ) : (
        <CrosstabTable
          title={props.title}
          description={props.description}
          rowLabel={props.rowLabel}
          data={data}
          maxColumns={props.maxColumns}
        />
      ),
  }),

  defineComponent({
    key: 'carousel',
    label: '캐러셀',
    group: '데이터 표시',
    icon: 'gallery-horizontal-end',
    description: '좌우로 넘기는 콘텐츠 슬라이더',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({ slideCount: z.number().min(1).max(10).default(3) }),
    defaultProps: { slideCount: 3 },
    defaultGrid: { span: 8, rowSpan: 20 },
    render: ({ props }) => (
      <Carousel className="w-full">
        <CarouselContent>
          {Array.from({ length: props.slideCount }).map((_, i) => (
            <CarouselItem key={i} className="flex h-32 items-center justify-center rounded-md border text-sm text-muted-foreground">
              슬라이드 {i + 1}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    ),
  }),
  defineComponent({
    key: 'pagination',
    label: '페이지네이션',
    group: '데이터 표시',
    icon: 'chevrons-right',
    description: '페이지 이동 컨트롤',
    isContainer: false,
    bindingModes: [],
    events: [{ name: 'onPageChange', label: '페이지 변경 시', payload: 'page' }],
    propsSchema: z.object({ pageCount: z.number().min(1).default(5) }),
    defaultProps: { pageCount: 5 },
    defaultGrid: { span: 6, rowSpan: 6 },
    render: ({ props }) => (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          {Array.from({ length: Math.min(props.pageCount, 5) }).map((_, i) => (
            <PaginationItem key={i}>
              <PaginationLink href="#" isActive={i === 0}>
                {i + 1}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  }),
  defineComponent({
    key: 'badge',
    label: '뱃지',
    group: '데이터 표시',
    icon: 'badge',
    description: '작은 상태/라벨 표시',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({
      text: z.string().default('상태'),
      variant: z.enum(['default', 'secondary', 'destructive', 'outline']).default('default'),
    }),
    defaultProps: { text: '상태', variant: 'default' },
    defaultGrid: { span: 2, rowSpan: 4 },
    render: ({ props }) => <Badge variant={props.variant}>{props.text}</Badge>,
  }),
  defineComponent({
    key: 'avatar',
    label: '아바타',
    group: '데이터 표시',
    icon: 'circle-user',
    description: '사용자 프로필 이미지/이니셜',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({ initials: z.string().default('U') }),
    defaultProps: { initials: 'U' },
    defaultGrid: { span: 1, rowSpan: 4 },
    render: ({ props }) => (
      <Avatar>
        <AvatarFallback>{props.initials}</AvatarFallback>
      </Avatar>
    ),
  }),
  defineComponent({
    key: 'progress',
    label: '진행률',
    group: '데이터 표시',
    icon: 'loader',
    description: '진행 상태 바',
    isContainer: false,
    bindingModes: ['field', 'aggregate'],
    events: [],
    propsSchema: z.object({ value: z.number().min(0).max(100).default(50) }),
    defaultProps: { value: 50 },
    defaultGrid: { span: 4, rowSpan: 4 },
    render: ({ props }) => <Progress value={props.value} />,
  }),
  defineComponent({
    key: 'typography',
    label: '타이포그래피',
    group: '데이터 표시',
    icon: 'type',
    description: '제목/본문 등 텍스트 스타일',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({
      variant: z.enum(['h1', 'h2', 'h3', 'p', 'lead', 'muted']).default('p'),
      text: z.string().default('텍스트'),
    }),
    defaultProps: { variant: 'p', text: '텍스트' },
    defaultGrid: { span: 6, rowSpan: 6 },
    render: ({ props }) => {
      switch (props.variant) {
        case 'h1':
          return <TypographyH1>{props.text}</TypographyH1>;
        case 'h2':
          return <TypographyH2>{props.text}</TypographyH2>;
        case 'h3':
          return <TypographyH3>{props.text}</TypographyH3>;
        case 'lead':
          return <TypographyLead>{props.text}</TypographyLead>;
        case 'muted':
          return <TypographyMuted>{props.text}</TypographyMuted>;
        default:
          return <TypographyP>{props.text}</TypographyP>;
      }
    },
  }),
  defineComponent({
    key: 'empty',
    label: '빈 상태',
    group: '데이터 표시',
    icon: 'inbox',
    description: '데이터 없음 안내',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('데이터가 없습니다'),
      description: z.string().default(''),
    }),
    defaultProps: { title: '데이터가 없습니다', description: '' },
    defaultGrid: { span: 6, rowSpan: 15 },
    render: ({ props }) => (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>{props.title}</EmptyTitle>
          {props.description && <EmptyDescription>{props.description}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    ),
  }),
  defineComponent({
    key: 'skeleton',
    label: '스켈레톤',
    group: '데이터 표시',
    icon: 'rectangle-ellipsis',
    description: '로딩 중 자리표시자',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ height: z.number().default(20) }),
    defaultProps: { height: 20 },
    defaultGrid: { span: 4, rowSpan: 4 },
    render: ({ props }) => <Skeleton style={{ height: props.height }} className="w-full" />,
  }),
  defineComponent({
    key: 'gantt-chart',
    label: '간트 차트',
    group: '데이터 표시',
    icon: 'chart-gantt',
    description: '일정 막대 차트 — 항목명 + 시작/종료 날짜 컬럼을 순서대로 사용',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({ title: z.string().default('일정(간트)'), showToday: z.boolean().default(true) }),
    defaultProps: { title: '일정(간트)', showToday: true },
    defaultGrid: { span: 12, rowSpan: 26 },
    render: ({ props, data }) => {
      const bars = data === undefined ? SAMPLE_GANTT : toGanttBars(data);
      if (bars.length === 0) {
        return (
          <div className="flex h-full min-h-[140px] flex-col gap-2">
            {props.title && <h3 className="chart-title">{props.title}</h3>}
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 일정이 없습니다 (항목명과 날짜 컬럼을 함께 선택하세요)
            </div>
          </div>
        );
      }
      const min = Math.min(...bars.map((b) => b.start.getTime()));
      const max = Math.max(...bars.map((b) => b.end.getTime()));
      const span = Math.max(1, max - min);
      const pct = (t: number) => ((t - min) / span) * 100;
      const today = Date.now();
      const showToday = props.showToday && today >= min && today <= max;

      return (
        <div className="flex h-full min-h-[140px] flex-col gap-2">
          {props.title && <h3 className="chart-title">{props.title}</h3>}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {bars.map((b, i) => (
              <div key={`${b.label}-${i}`} className="flex items-center gap-2 text-xs">
                {/* 폭이 좁으면 항목명을 줄이고 오른쪽 날짜 칸은 접는다 — 셋을 다 펼치면 최소 304px가
                    필요해 320px 창에서 막대가 카드 밖으로 밀려났다. 전체 구간은 아래 눈금이 보여준다. */}
                <span className="w-20 shrink-0 truncate text-muted-foreground sm:w-32" title={b.label}>
                  {b.label}
                </span>
                <span className="relative h-4 min-w-0 flex-1 rounded bg-muted">
                  <span
                    className="absolute top-0 h-4 rounded bg-primary"
                    style={{
                      left: `${pct(b.start.getTime())}%`,
                      width: `${Math.max(1.5, pct(b.end.getTime()) - pct(b.start.getTime()))}%`,
                    }}
                    title={`${fmtDate(b.start)} ~ ${fmtDate(b.end)}`}
                  />
                  {showToday && (
                    <span className="absolute top-0 h-4 w-px bg-destructive" style={{ left: `${pct(today)}%` }} />
                  )}
                </span>
                <span className="hidden w-40 shrink-0 tabular-nums text-muted-foreground sm:block">
                  {fmtDate(b.start)} ~ {fmtDate(b.end)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 justify-between border-t pt-1 text-[11px] tabular-nums text-muted-foreground">
            <span>{fmtDate(new Date(min))}</span>
            <span>{fmtDate(new Date((min + max) / 2))}</span>
            <span>{fmtDate(new Date(max))}</span>
          </div>
        </div>
      );
    },
  }),
  defineComponent({
    key: 'kanban-board',
    label: '칸반 보드',
    group: '데이터 표시',
    icon: 'columns-3',
    description: '상태별 카드 보드 — 첫 ENUM 컬럼으로 열을 나누고 텍스트 컬럼을 카드 제목으로 사용',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default('진행 보드(칸반)'),
      maxPerColumn: z.number().min(1).max(50).default(8),
    }),
    defaultProps: { title: '진행 보드(칸반)', maxPerColumn: 8 },
    defaultGrid: { span: 12, rowSpan: 26 },
    render: ({ props, data }) => {
      const board = data === undefined ? SAMPLE_KANBAN : toKanbanBoard(data);
      if (board.length === 0) {
        return (
          <div className="flex h-full min-h-[140px] flex-col gap-2">
            {props.title && <h3 className="chart-title">{props.title}</h3>}
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 카드가 없습니다 (상태 컬럼과 제목 컬럼을 함께 선택하세요)
            </div>
          </div>
        );
      }
      return (
        <div className="flex h-full min-h-[140px] flex-col gap-2">
          {props.title && <h3 className="chart-title">{props.title}</h3>}
          <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
            {board.map((col) => (
              <div key={col.column} className="flex min-w-40 flex-1 flex-col gap-1.5 rounded-md bg-muted/50 p-2">
                <div className="flex shrink-0 items-center justify-between text-xs font-medium">
                  <span className="truncate">{col.column}</span>
                  <Badge variant="secondary">{col.cards.length}</Badge>
                </div>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {col.cards.slice(0, props.maxPerColumn).map((card, i) => (
                    <div key={`${card.title}-${i}`} className="rounded-md border bg-background p-2 text-xs shadow-sm">
                      <p className="truncate font-medium" title={card.title}>
                        {card.title}
                      </p>
                      {card.meta.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{card.meta.join(' · ')}</p>
                      )}
                    </div>
                  ))}
                  {col.cards.length > props.maxPerColumn && (
                    <p className="px-1 text-[11px] text-muted-foreground">+{col.cards.length - props.maxPerColumn}건 더</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    },
  }),
] satisfies ComponentDef[];
