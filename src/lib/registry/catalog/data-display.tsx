import { z } from 'zod';
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
import { Inbox } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { categoricalXAxisProps, yAxisLabelProps } from '@/lib/chart-axis';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

const chartConfig = { value: { label: '값', color: 'var(--primary)' } } satisfies ChartConfig;
const sampleChartData = [
  { label: '1월', value: 12 },
  { label: '2월', value: 19 },
  { label: '3월', value: 8 },
];

const NUMERIC_DATA_TYPES = new Set(['INTEGER', 'REAL']);

function formatChartNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);
}

/**
 * list 바인딩 결과(runListQuery의 { rows, columns })를 recharts가 먹는 { label, value } 배열로
 * 바꾼다. 숫자 컬럼이 있으면 그 값을, 없으면 카테고리별 건수를 쓴다. 바인딩이 없거나(null)
 * 모양이 다르면 빈 배열을 돌려주고, 호출부가 "데이터 없음"으로 렌더한다.
 */
function toChartSeries(data: unknown): { label: string; value: number }[] {
  if (!data || typeof data !== 'object') return [];
  const { rows, columns } = data as {
    rows?: Record<string, unknown>[];
    columns?: { columnName: string; fieldId: string | null; dataType: string }[];
  };
  if (!Array.isArray(rows) || !Array.isArray(columns)) return [];

  const selected = columns.filter((c) => c.fieldId !== null);
  const labelCol = selected.find((c) => !NUMERIC_DATA_TYPES.has(c.dataType));
  const valueCol = selected.find((c) => NUMERIC_DATA_TYPES.has(c.dataType));
  if (!labelCol) return [];

  if (!valueCol) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = String(row[labelCol.columnName] ?? '-');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, value]) => ({ label, value }));
  }

  return rows.map((row) => ({
    label: String(row[labelCol.columnName] ?? '-'),
    value: Number(row[valueCol.columnName] ?? 0),
  }));
}

type ResultColumn = { columnName: string; fieldId: string | null; dataType: string };

/** list 바인딩 결과를 안전하게 꺼낸다(바인딩이 없거나 모양이 다르면 null). */
function asListResult(data: unknown): { rows: Record<string, unknown>[]; columns: ResultColumn[] } | null {
  if (!data || typeof data !== 'object') return null;
  const { rows, columns } = data as { rows?: Record<string, unknown>[]; columns?: ResultColumn[] };
  if (!Array.isArray(rows) || !Array.isArray(columns)) return null;
  return { rows, columns };
}

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
  const selected = r.columns.filter((c) => c.fieldId !== null);
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
  const selected = r.columns.filter((c) => c.fieldId !== null);
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
      showExport: z.boolean().default(false),
      selectable: z.boolean().default(false),
      density: z.enum(['compact', 'default', 'comfortable']).default('default'),
      emptyText: z.string().default('데이터가 없습니다'),
    }),
    defaultProps: { title: '', columns: [], showSearch: true, showExport: false, selectable: false, density: 'default', emptyText: '데이터가 없습니다' },
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
          ? props.columns.map((c) => ({ accessorKey: columnNameByFieldId.get(c.fieldId) ?? c.fieldId, header: c.header }))
          : sampleColumns as unknown as ColumnDef<Record<string, unknown>>[];
      const rows =
        data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
          ? ((data as { rows: Record<string, unknown>[] }).rows)
          : [];
      return (
        <div className="flex flex-col gap-2">
          {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
          <DataTableUi columns={columns} data={rows} emptyText={props.emptyText} showSearch={props.showSearch} />
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
    bindingModes: ['list', 'aggregate'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      chartType: z.enum(['bar', 'line']).default('bar'),
      unit: z.string().default(''),
      /** 비워 두면 y축을 그리지 않는다(지금까지의 모양). 값을 넣으면 축과 함께 세로 이름이 붙는다. */
      yLabel: z.string().default(''),
    }),
    defaultProps: { title: '', chartType: 'bar', unit: '', yLabel: '' },
    defaultGrid: { span: 6, rowSpan: 25 },
    render: ({ props, data }) => {
      const heading = props.title ? <h3 className="text-sm font-medium">{props.title}</h3> : null;

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
                {props.yLabel.trim() ? (
                  <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            </ChartContainer>
          </div>
        );
      }

      // aggregate 바인딩 → runAggregateQuery가 숫자 하나를 돌려준다(§6.4). KPI 타일로 렌더한다.
      if (typeof data === 'number') {
        return (
          <div className="flex h-full flex-col justify-center gap-1">
            {props.title && <span className="text-xs text-muted-foreground">{props.title}</span>}
            <span className="text-3xl font-semibold tabular-nums">
              {formatChartNumber(data)}
              {props.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{props.unit}</span>}
            </span>
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
          <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-0 w-full flex-1">
            {props.chartType === 'line' ? (
              <LineChart data={series}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...categoricalXAxisProps(series.map((s) => s.label))} />
                {props.yLabel.trim() ? (
                  <YAxis tickLine={false} axisLine={false} fontSize={11} {...yAxisLabelProps(props.yLabel)} />
                  ) : null}
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={series}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...categoricalXAxisProps(series.map((s) => s.label))} />
                {props.yLabel.trim() ? (
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
            {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
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
          {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {bars.map((b, i) => (
              <div key={`${b.label}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-muted-foreground" title={b.label}>
                  {b.label}
                </span>
                <span className="relative h-4 flex-1 rounded bg-muted">
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
                <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
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
            {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 카드가 없습니다 (상태 컬럼과 제목 컬럼을 함께 선택하세요)
            </div>
          </div>
        );
      }
      return (
        <div className="flex h-full min-h-[140px] flex-col gap-2">
          {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
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
