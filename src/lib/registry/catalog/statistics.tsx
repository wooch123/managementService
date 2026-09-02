import { Fragment } from 'react';
import { seriesColor } from '@/lib/theme/series-color';
import { z } from 'zod';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { categoricalXAxisProps, yAxisLabelProps } from '@/lib/chart-axis';
import {
  asSeriesResult,
  isNumericColumn,
  selectedColumns,
  toLabelValueSeries,
  toMatrixSeries,
  type SeriesResult,
} from '@/lib/chart-series';
import { defineComponent } from '@/lib/registry/types';
import {
  boxStats,
  capability,
  controlLimits,
  format,
  histogramBins,
  linearRegression,
  mean,
  movingAverage,
  movingRanges,
  normalQuantile,
  paretoSeries,
  quantile,
  waterfallSeries,
} from '@/lib/stats';

/**
 * §8.3 '통계 차트' 그룹 — 품질/공정 데이터 분석에 쓰는 20종.
 *
 * 데이터 계약은 기존 '차트' 컴포넌트와 같다: list 바인딩 결과 `{ rows, columns }`에서
 * **첫 번째 비숫자 컬럼 = 라벨(범주/시점)**, **숫자 컬럼 = 값**으로 해석한다. 두 개 이상의
 * 숫자 컬럼이 필요한 차트(산점도·회귀·버블)는 select 순서대로 x, y, (크기)를 가져간다.
 * 통계량(사분위·관리한계·회귀계수 등)은 서버가 아니라 이 렌더 단계에서 lib/stats.ts로 계산한다.
 *
 * 색은 전부 테마 토큰(--chart-1..5)만 쓰고, 컨테이너/제목/빈 상태 처리도 '차트'와 동일한
 * 모양을 공유해 UI 일관성을 유지한다.
 */

const chartConfig = {
  value: { label: '값', color: 'var(--chart-1)' },
  secondary: { label: '보조', color: 'var(--chart-3)' },
  limit: { label: '한계선', color: 'var(--chart-5)' },
} satisfies ChartConfig;

type ListResult = SeriesResult;

const asList = asSeriesResult;
const labelColumn = (r: ListResult) => selectedColumns(r.columns).find((c) => !isNumericColumn(c));
const numericColumns = (r: ListResult) => selectedColumns(r.columns).filter(isNumericColumn);

/** 첫 번째 숫자 컬럼의 값들 */
function numbers(data: unknown): number[] {
  const r = asList(data);
  if (!r) return [];
  const col = numericColumns(r)[0];
  if (!col) return [];
  return r.rows.map((row) => Number(row[col.columnName])).filter((v) => Number.isFinite(v));
}

/** 라벨 + 첫 숫자 컬럼. 규칙은 lib/chart-series.ts에 한 벌만 둔다. */
const series = toLabelValueSeries;

/** 숫자 컬럼 2~3개 → 산점/버블용 좌표 */
function points(data: unknown): { x: number; y: number; z: number; label: string }[] {
  const r = asList(data);
  if (!r) return [];
  const nums = numericColumns(r);
  if (nums.length < 2) return [];
  const label = labelColumn(r);
  return r.rows
    .map((row) => ({
      x: Number(row[nums[0].columnName]),
      y: Number(row[nums[1].columnName]),
      z: nums[2] ? Number(row[nums[2].columnName]) : 1,
      label: label ? String(row[label.columnName] ?? '') : '',
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** 라벨별로 값들을 묶는다(박스플롯·그룹 비교용) */
function groups(data: unknown): { label: string; values: number[] }[] {
  const r = asList(data);
  if (!r) return [];
  const label = labelColumn(r);
  const num = numericColumns(r)[0];
  if (!label || !num) return [];
  const map = new Map<string, number[]>();
  for (const row of r.rows) {
    const key = String(row[label.columnName] ?? '-');
    const v = Number(row[num.columnName]);
    if (!Number.isFinite(v)) continue;
    map.set(key, [...(map.get(key) ?? []), v]);
  }
  return [...map].map(([l, values]) => ({ label: l, values }));
}

// ── 빌더 캔버스용 표본 데이터(결정적) ─────────────────────────────────────────
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const SAMPLE_VALUES = Array.from({ length: 40 }, () => Number((45 + (rnd() + rnd() + rnd() - 1.5) * 3).toFixed(2)));
const SAMPLE_SERIES = ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ label, value: 40 - i * 6 + Math.round(rnd() * 4) }));
const SAMPLE_POINTS = Array.from({ length: 30 }, (_, i) => ({ x: i + 1, y: Number((i * 0.8 + rnd() * 6).toFixed(2)), z: 1 + Math.round(rnd() * 5), label: `p${i + 1}` }));

/** 제목 + 컨테이너 + 빈 상태를 한 곳에서 처리해 20종의 모양을 통일한다. */
function StatShell({
  title,
  note,
  isEmpty,
  config,
  children,
}: {
  title?: string;
  note?: string;
  isEmpty: boolean;
  /** 범례·툴팁의 이름표는 이 표에서 온다(dataKey → 이름). 계열 이름이 차트마다 다른 경우에만 넘긴다. */
  config?: ChartConfig;
  children: React.ReactElement;
}) {
  return (
    <div className="flex h-full min-h-[140px] flex-col gap-1.5">
      {title ? <h3 className="chart-title">{title}</h3> : null}
      {note ? <p className="text-xs text-muted-foreground tabular-nums">{note}</p> : null}
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          표시할 데이터가 없습니다
        </div>
      ) : (
        <ChartContainer config={config ?? chartConfig} className="aspect-auto h-full min-h-0 w-full flex-1">
          {children}
        </ChartContainer>
      )}
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: false, tickMargin: 6, fontSize: 11 } as const;

/** 카테고리 축 — 레이블이 빽빽하면 기울여서 하나도 빠짐없이 보이게 한다(src/lib/chart-axis.ts). */
function catAxis<T, K extends keyof T>(rows: readonly T[], key: K) {
  return categoricalXAxisProps(rows.map((r) => String(r[key] ?? '')));
}

// ── 1. 히스토그램 ────────────────────────────────────────────────────────────
const histogram = defineComponent({
  key: 'stat-histogram',
  label: '히스토그램',
  group: '통계 차트',
  icon: 'chart-column-big',
  description: '값의 도수분포 — 구간별 빈도',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('히스토그램'), binCount: z.number().min(2).max(30).default(8), yLabel: z.string().default('') }),
  defaultProps: { title: '히스토그램', binCount: 8, yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const values = data === undefined ? SAMPLE_VALUES : numbers(data);
    const bins = histogramBins(values, props.binCount);
    return (
      <StatShell title={props.title} isEmpty={bins.length === 0} note={values.length > 0 ? `n=${values.length} · 평균 ${format(mean(values))}` : undefined}>
        <ComposedChart data={bins}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(bins, 'label')} />
          <YAxis {...axisProps} allowDecimals={false} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" name="빈도" fill="var(--chart-1)" radius={2} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 2. 박스플롯 ──────────────────────────────────────────────────────────────
const boxplot = defineComponent({
  key: 'stat-boxplot',
  label: '박스플롯',
  group: '통계 차트',
  icon: 'box',
  description: '그룹별 사분위 분포와 이상치',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('박스플롯'), yLabel: z.string().default('') }),
  defaultProps: { title: '박스플롯', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const raw = data === undefined ? [{ label: '표본', values: SAMPLE_VALUES }] : groups(data);
    const rows = raw.map((g) => {
      const s = boxStats(g.values);
      return {
        label: g.label,
        q1: s.q1,
        box: s.q3 - s.q1,
        median: s.median,
        whisker: [s.q1 - s.min, s.max - s.q3] as [number, number],
        min: s.min,
        max: s.max,
      };
    });
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {/* 아래쪽 q1까지는 투명 막대로 띄우고, 그 위에 IQR 상자를 그린다 */}
          <Bar dataKey="q1" stackId="box" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="box" stackId="box" name="IQR" fill="var(--chart-1)" radius={2}>
            <ErrorBar dataKey="whisker" width={6} strokeWidth={1.5} stroke="var(--chart-5)" direction="y" />
          </Bar>
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 3. 산점도 ────────────────────────────────────────────────────────────────
const scatterPlot = defineComponent({
  key: 'stat-scatter',
  label: '산점도',
  group: '통계 차트',
  icon: 'scatter-chart',
  description: '두 변수의 관계 — 숫자 컬럼 2개',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('산점도'), yLabel: z.string().default('') }),
  defaultProps: { title: '산점도', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const pts = data === undefined ? SAMPLE_POINTS : points(data);
    return (
      <StatShell title={props.title} isEmpty={pts.length === 0}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name="x" domain={['auto', 'auto']} {...axisProps} />
          <YAxis type="number" dataKey="y" name="y" {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Scatter data={pts} fill="var(--chart-1)" />
        </ScatterChart>
      </StatShell>
    );
  },
});

// ── 4. 회귀 산점도 ───────────────────────────────────────────────────────────
const regressionScatter = defineComponent({
  key: 'stat-regression',
  label: '회귀 산점도',
  group: '통계 차트',
  icon: 'trending-up',
  description: '산점도 + 최소제곱 추세선(R²)',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('회귀 분석'), yLabel: z.string().default('') }),
  defaultProps: { title: '회귀 분석', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const pts = data === undefined ? SAMPLE_POINTS : points(data);
    const { a, b, r2 } = linearRegression(pts);
    const xs = pts.map((p) => p.x);
    const fit = pts.length > 0 ? [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: a + b * x })) : [];
    return (
      <StatShell
        title={props.title}
        isEmpty={pts.length === 0}
        note={pts.length > 1 ? `y = ${format(a)} + ${format(b)}·x · R² ${r2.toFixed(3)}` : undefined}
      >
        <ComposedChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={['auto', 'auto']} {...axisProps} />
          <YAxis type="number" dataKey="y" domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Scatter data={pts} fill="var(--chart-1)" />
          <Line data={fit} dataKey="y" stroke="var(--chart-5)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 5. 버블 차트 ─────────────────────────────────────────────────────────────
const bubbleChart = defineComponent({
  key: 'stat-bubble',
  label: '버블 차트',
  group: '통계 차트',
  icon: 'circle-dot',
  description: '세 번째 숫자 컬럼을 크기로 쓰는 산점도',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('버블 차트'), yLabel: z.string().default('') }),
  defaultProps: { title: '버블 차트', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const pts = data === undefined ? SAMPLE_POINTS : points(data);
    return (
      <StatShell title={props.title} isEmpty={pts.length === 0}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={['auto', 'auto']} {...axisProps} />
          <YAxis type="number" dataKey="y" domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ZAxis type="number" dataKey="z" range={[40, 400]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Scatter data={pts} fill="var(--chart-2)" fillOpacity={0.7} />
        </ScatterChart>
      </StatShell>
    );
  },
});

// ── 6. 파레토 차트 ───────────────────────────────────────────────────────────
const paretoChart = defineComponent({
  key: 'stat-pareto',
  label: '파레토 차트',
  group: '통계 차트',
  icon: 'chart-no-axes-combined',
  description: '내림차순 막대 + 누적 비율(80% 기준선)',
  isContainer: false,
  // 집계(group)도 받는다 — 원시 행을 pageSize만큼만 받아 화면에서 세면 표본만 반영돼 수치가 틀린다.
  bindingModes: ['list', 'group'],
  events: [],
  propsSchema: z.object({
    title: z.string().default('파레토 분석'),
    subtitle: z.string().default(''),
    yLabel: z.string().default(''),
  }),
  defaultProps: { title: '파레토 분석', subtitle: '', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const rows = paretoSeries(data === undefined ? SAMPLE_SERIES : series(data));
    return (
      <StatShell title={props.title} note={props.subtitle || undefined} isEmpty={rows.length === 0}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis yAxisId="left" {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" {...axisProps} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar yAxisId="left" dataKey="value" name="건수" fill="var(--chart-1)" radius={2} />
          <Line yAxisId="right" dataKey="cumulative" name="누적%" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 2 }} />
          <ReferenceLine yAxisId="right" y={80} stroke="var(--chart-3)" strokeDasharray="4 4" />
        </ComposedChart>
      </StatShell>
    );
  },
});

/** 관리도 3종(X̄·개별값·p)이 공유하는 렌더 — 중심선과 ±kσ 한계선을 함께 그린다. */
function ControlChart({ title, values, k, unit }: { title?: string; values: number[]; k: number; unit?: string }) {
  const { center, ucl, lcl } = controlLimits(values, k);
  const rows = values.map((v, i) => ({ label: String(i + 1), value: v, out: v > ucl || v < lcl }));
  return (
    <StatShell
      title={title}
      isEmpty={rows.length === 0}
      note={rows.length > 0 ? `CL ${format(center)}${unit ?? ''} · UCL ${format(ucl)} · LCL ${format(lcl)} · 이탈 ${rows.filter((r) => r.out).length}건` : undefined}
    >
      <ComposedChart data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
        <YAxis domain={['auto', 'auto']} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ReferenceLine y={ucl} stroke="var(--chart-5)" strokeDasharray="4 4" />
        <ReferenceLine y={center} stroke="var(--chart-3)" />
        <ReferenceLine y={lcl} stroke="var(--chart-5)" strokeDasharray="4 4" />
        <Line dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
      </ComposedChart>
    </StatShell>
  );
}

// ── 7~10. 관리도 4종 ─────────────────────────────────────────────────────────
const controlXbar = defineComponent({
  key: 'stat-control-xbar',
  label: 'X̄ 관리도',
  group: '통계 차트',
  icon: 'activity',
  description: '평균 관리도 — 중심선과 ±3σ 관리한계',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('X̄ 관리도'), sigma: z.number().min(1).max(4).default(3) }),
  defaultProps: { title: 'X̄ 관리도', sigma: 3 },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => <ControlChart title={props.title} values={data === undefined ? SAMPLE_VALUES : numbers(data)} k={props.sigma} />,
});

const controlR = defineComponent({
  key: 'stat-control-r',
  label: 'R 관리도',
  group: '통계 차트',
  icon: 'chart-spline',
  description: '이동범위(MR) 관리도 — 산포의 안정성',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('R 관리도'), sigma: z.number().min(1).max(4).default(3) }),
  defaultProps: { title: 'R 관리도', sigma: 3 },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => <ControlChart title={props.title} values={movingRanges(data === undefined ? SAMPLE_VALUES : numbers(data))} k={props.sigma} />,
});

const controlImr = defineComponent({
  key: 'stat-control-imr',
  label: 'I-MR 관리도',
  group: '통계 차트',
  icon: 'chart-line',
  description: '개별값과 이동범위를 함께 보는 관리도',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('I-MR 관리도'), sigma: z.number().min(1).max(4).default(3), yLabel: z.string().default('') }),
  defaultProps: { title: 'I-MR 관리도', sigma: 3, yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 26 },
  render: ({ props, data }) => {
    const values = data === undefined ? SAMPLE_VALUES : numbers(data);
    const mr = movingRanges(values);
    const limits = controlLimits(values, props.sigma);
    const rows = values.map((v, i) => ({ label: String(i + 1), value: v, mr: i === 0 ? null : mr[i - 1] }));
    return (
      <StatShell
        title={props.title}
        isEmpty={rows.length === 0}
        note={rows.length > 0 ? `개별값 CL ${format(limits.center)} · MR 평균 ${format(mean(mr))}` : undefined}
      >
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={limits.ucl} stroke="var(--chart-5)" strokeDasharray="4 4" />
          <ReferenceLine y={limits.center} stroke="var(--chart-3)" />
          <ReferenceLine y={limits.lcl} stroke="var(--chart-5)" strokeDasharray="4 4" />
          <Bar dataKey="mr" name="이동범위" fill="var(--chart-2)" fillOpacity={0.45} radius={2} />
          <Line dataKey="value" name="개별값" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </StatShell>
    );
  },
});

const controlP = defineComponent({
  key: 'stat-control-p',
  label: 'p 관리도',
  group: '통계 차트',
  icon: 'percent',
  description: '불량률(비율) 관리도',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('p 관리도(불량률)'), sigma: z.number().min(1).max(4).default(3) }),
  defaultProps: { title: 'p 관리도(불량률)', sigma: 3 },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => <ControlChart title={props.title} values={data === undefined ? SAMPLE_VALUES.map((v) => Number((v / 100).toFixed(3))) : numbers(data)} k={props.sigma} unit="" />,
});

// ── 11. 공정능력 분석 ────────────────────────────────────────────────────────
const capabilityChart = defineComponent({
  key: 'stat-capability',
  label: '공정능력 분석',
  group: '통계 차트',
  icon: 'gauge',
  description: '도수분포 + 규격선(LSL/USL) + Cp·Cpk',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({
    title: z.string().default('공정능력 분석'),
    lsl: z.number().optional(),
    usl: z.number().optional(),
    binCount: z.number().min(2).max(30).default(10),
    yLabel: z.string().default(''),
  }),
  defaultProps: { title: '공정능력 분석', binCount: 10, yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 24 },
  render: ({ props, data }) => {
    const values = data === undefined ? SAMPLE_VALUES : numbers(data);
    const bins = histogramBins(values, props.binCount);
    const cap = capability(values, props.lsl, props.usl);
    const note =
      values.length > 0
        ? `평균 ${format(cap.mean)} · σ ${format(cap.sigma)}${cap.cp != null ? ` · Cp ${cap.cp.toFixed(2)}` : ''}${cap.cpk != null ? ` · Cpk ${cap.cpk.toFixed(2)}` : ''}`
        : undefined;
    return (
      <StatShell title={props.title} isEmpty={bins.length === 0} note={note}>
        <ComposedChart data={bins}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="center" {...axisProps} {...catAxis(bins.map((b) => ({ center: format(b.center) })), 'center')} tickFormatter={(v: number) => format(v)} />
          <YAxis {...axisProps} allowDecimals={false} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {props.lsl != null && <ReferenceLine x={props.lsl} stroke="var(--chart-5)" strokeDasharray="4 4" />}
          {props.usl != null && <ReferenceLine x={props.usl} stroke="var(--chart-5)" strokeDasharray="4 4" />}
          <Bar dataKey="count" name="빈도" fill="var(--chart-1)" radius={2} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 12. 런 차트 ──────────────────────────────────────────────────────────────
const runChart = defineComponent({
  key: 'stat-run',
  label: '런 차트',
  group: '통계 차트',
  icon: 'chart-line',
  description: '시계열 값 + 중앙선(런 판정용)',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('런 차트'), yLabel: z.string().default('') }),
  defaultProps: { title: '런 차트', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 20 },
  render: ({ props, data }) => {
    const rows = data === undefined ? SAMPLE_VALUES.map((v, i) => ({ label: String(i + 1), value: v })) : series(data);
    const median = quantile(rows.map((r) => r.value), 0.5);
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0} note={rows.length > 0 ? `중앙값 ${format(median)}` : undefined}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={median} stroke="var(--chart-3)" strokeDasharray="4 4" />
          <Line dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 13. 이동평균 추이 ────────────────────────────────────────────────────────
const movingAverageChart = defineComponent({
  key: 'stat-moving-average',
  label: '이동평균 추이',
  group: '통계 차트',
  icon: 'chart-spline',
  description: '원본 시계열 + n점 이동평균',
  isContainer: false,
  // group 모드도 받는다 — 시점별 집계를 DB가 직접 계산해 주면(원시 행 표본이 아니라) 값이 정확하고,
  // 날짜 버킷(월/주)을 쓰면 조회 기간을 바꿀 때 시계열도 함께 따라온다.
  bindingModes: ['list', 'group'],
  events: [],
  propsSchema: z.object({
    title: z.string().default('이동평균 추이'),
    window: z.number().min(2).max(30).default(5),
    yLabel: z.string().default(''),
    /**
     * 실측값을 무엇으로 그릴지. 선 둘을 겹치면 어느 쪽이 실측이고 어느 쪽이 평균인지
     * 색으로만 구별해야 한다 — 실측을 막대로 두면 "이번 달 얼마"와 "흐름"이 한눈에 갈린다.
     * 기본은 지금까지의 모양(선)이다.
     */
    baseAs: z.enum(['line', 'bar']).default('line'),
    /** 실측 이름 — 범례와 툴팁에 그대로 쓴다(예: '월간 접수'). */
    baseLabel: z.string().default('실측'),
  }),
  defaultProps: { title: '이동평균 추이', window: 5, yLabel: '', baseAs: 'line', baseLabel: '실측' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const base = data === undefined ? SAMPLE_VALUES.map((v, i) => ({ label: String(i + 1), value: v })) : series(data);
    const ma = movingAverage(base.map((b) => b.value), props.window);
    const rows = base.map((b, i) => ({ ...b, ma: ma[i] }));
    const maName = `${props.window}개월 이동평균`;
    const baseColor = props.baseAs === 'bar' ? 'var(--chart-1)' : 'var(--chart-2)';
    const maColor = props.baseAs === 'bar' ? 'var(--chart-2)' : 'var(--chart-1)';
    return (
      <StatShell
        title={props.title}
        isEmpty={rows.length === 0}
        config={{ value: { label: props.baseLabel, color: baseColor }, ma: { label: maName, color: maColor } }}
      >
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {/* 막대와 선을 함께 그리면 이름표가 있어야 읽힌다 — 색만으로는 어느 쪽인지 알 수 없다. */}
          <ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
          {props.baseAs === 'bar' ? (
            <Bar dataKey="value" name={props.baseLabel} fill={baseColor} radius={[3, 3, 0, 0]} />
          ) : (
            <Line dataKey="value" name={props.baseLabel} stroke={baseColor} strokeWidth={1.5} dot={false} />
          )}
          <Line
            dataKey="ma"
            name={maName}
            // 막대 위에 겹치는 선이라 막대와 다른 색으로 두고 조금 더 굵게 그린다.
            stroke={maColor}
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 14. 누적분포(오자이브) ───────────────────────────────────────────────────
const cdfChart = defineComponent({
  key: 'stat-cdf',
  label: '누적분포 곡선',
  group: '통계 차트',
  icon: 'chart-area',
  description: '정렬된 값의 누적 비율(%) — 백분위 확인',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('누적분포(오자이브)'), yLabel: z.string().default('') }),
  defaultProps: { title: '누적분포(오자이브)', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 20 },
  render: ({ props, data }) => {
    const values = [...(data === undefined ? SAMPLE_VALUES : numbers(data))].sort((a, b) => a - b);
    const rows = values.map((v, i) => ({ label: format(v), value: v, cum: Number((((i + 1) / values.length) * 100).toFixed(1)) }));
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0} note={rows.length > 0 ? `중앙값 ${format(quantile(values, 0.5))} · P90 ${format(quantile(values, 0.9))}` : undefined}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="value" {...axisProps} {...catAxis(rows, 'value')} tickFormatter={(v: number) => format(v)} />
          <YAxis domain={[0, 100]} unit="%" {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="cum" name="누적%" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 15. 정규확률도(Q-Q) ──────────────────────────────────────────────────────
const qqPlot = defineComponent({
  key: 'stat-qq',
  label: '정규확률도(Q-Q)',
  group: '통계 차트',
  icon: 'diff',
  description: '정규분포 적합도 — 직선에 가까울수록 정규',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('정규확률도(Q-Q)'), yLabel: z.string().default('') }),
  defaultProps: { title: '정규확률도(Q-Q)', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const values = [...(data === undefined ? SAMPLE_VALUES : numbers(data))].sort((a, b) => a - b);
    const pts = values.map((v, i) => ({ x: normalQuantile((i + 0.5) / values.length), y: v }));
    const { a, b } = linearRegression(pts);
    const xs = pts.map((p) => p.x);
    const fit = pts.length > 1 ? [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: a + b * x })) : [];
    return (
      <StatShell title={props.title} isEmpty={pts.length === 0}>
        <ComposedChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name="이론 분위수" tickFormatter={(v: number) => format(v)} {...axisProps} />
          <YAxis type="number" dataKey="y" name="관측값" domain={['auto', 'auto']} tickFormatter={(v: number) => format(v)} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Scatter data={pts} fill="var(--chart-1)" />
          <Line data={fit} dataKey="y" stroke="var(--chart-5)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 16. 잔차 도표 ────────────────────────────────────────────────────────────
const residualPlot = defineComponent({
  key: 'stat-residual',
  label: '잔차 도표',
  group: '통계 차트',
  icon: 'chart-scatter',
  description: '회귀 잔차의 분포 — 패턴이 없어야 적합',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('잔차 도표'), yLabel: z.string().default('') }),
  defaultProps: { title: '잔차 도표', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 20 },
  render: ({ props, data }) => {
    const pts = data === undefined ? SAMPLE_POINTS : points(data);
    const { a, b } = linearRegression(pts);
    const residuals = pts.map((p) => ({ x: p.x, y: Number((p.y - (a + b * p.x)).toFixed(4)) }));
    return (
      <StatShell title={props.title} isEmpty={residuals.length === 0} note={residuals.length > 0 ? `잔차 평균 ${format(mean(residuals.map((r) => r.y)))}` : undefined}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={['auto', 'auto']} {...axisProps} />
          <YAxis type="number" dataKey="y" domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={0} stroke="var(--chart-5)" />
          <Scatter data={residuals} fill="var(--chart-2)" />
        </ScatterChart>
      </StatShell>
    );
  },
});

// ── 17. 히트맵 ───────────────────────────────────────────────────────────────
/**
 * 히트맵 칸의 색 — 카드 바탕에 강조색을 **섞는다**(투명도를 주지 않는다).
 *
 * 투명도로 농도를 만들면 그 투명도가 글자에도 걸린다. 옅은 칸일수록 숫자까지 함께 흐려져,
 * 정작 값이 작은 칸은 읽히지 않았다(실제로 그렇게 만들었다가 화면에서 확인했다).
 * 배경색만 섞으면 글자는 언제나 제 색으로 남는다.
 *
 * 섞는 비율의 위 끝을 70%로 둔 이유: 그 위로 가면 밝은 테마에서는 바탕이 너무 짙어 글자가
 * 묻히고, 어두운 테마에서는 반대로 바탕이 너무 밝아진다. 두 테마 모두에서 본문색이 4.5:1을
 * 넘기는 한계가 여기다.
 */
const TINT_MIN = 8;
const TINT_MAX = 70;
const cellTint = (percent: number) => `color-mix(in oklab, var(--chart-1) ${percent.toFixed(1)}%, var(--card))`;

/** 교차 히트맵의 팔레트 미리보기 — 축이 둘인 결과와 같은 봉투. */
const SAMPLE_MATRIX = {
  columns: [
    { columnName: 'label', fieldId: null, dataType: 'TEXT' },
    { columnName: 'series', fieldId: null, dataType: 'TEXT' },
    { columnName: 'value', fieldId: null, dataType: 'REAL' },
  ],
  rows: ['A', 'B', 'C'].flatMap((label, i) =>
    ['X', 'Y', 'Z'].map((series, j) => ({ label, series, value: (i + 1) * (j + 2) * 3 }))
  ),
};

const heatmapMatrix = defineComponent({
  key: 'stat-heatmap',
  label: '히트맵',
  group: '통계 차트',
  icon: 'grid-3x3',
  description: '범주별 값의 농도 표시 — 밀집도·집중 구간 파악',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('히트맵'), columns: z.number().min(2).max(12).default(6) }),
  defaultProps: { title: '히트맵', columns: 6 },
  defaultGrid: { span: 6, rowSpan: 20 },
  render: ({ props, data }) => {
    const rows = data === undefined ? SAMPLE_SERIES : series(data);
    const max = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.value))) : 0;
    // recharts에 히트맵 프리미티브가 없어 CSS 그리드로 그린다 — 색은 차트 토큰의 투명도만 바꾼다.
    return (
      <div className="flex h-full min-h-[140px] flex-col gap-1.5">
        {props.title ? <h3 className="chart-title">{props.title}</h3> : null}
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            표시할 데이터가 없습니다
          </div>
        ) : (
          <div className="grid flex-1 auto-rows-fr gap-1" style={{ gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` }}>
            {rows.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className="flex min-h-8 flex-col items-center justify-center rounded-sm p-1 text-[10px] leading-tight"
                style={{ backgroundColor: 'var(--chart-1)', opacity: max === 0 ? 0.15 : 0.15 + (Math.abs(r.value) / max) * 0.85 }}
                title={`${r.label}: ${format(r.value)}`}
              >
                <span className="truncate font-medium text-background mix-blend-luminosity">{r.label}</span>
                <span className="tabular-nums text-background mix-blend-luminosity">{format(r.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
});

/**
 * 교차 히트맵 — 두 분류를 가로·세로로 놓고 칸마다 건수를 색 농도로 보여 준다.
 *
 * 위의 히트맵(`stat-heatmap`)은 항목을 한 줄로 늘어놓고 접었을 뿐이라 축이 하나다.
 * "불량 대분류 × NAND"처럼 **어느 조합에 몰려 있는가**를 보려면 축이 둘이어야 한다.
 * 값은 DB가 GROUP BY 두 축으로 세어 준 것을 그대로 그린다(화면에서 세지 않는다).
 */
const crosstabHeatmap = defineComponent({
  key: 'stat-crosstab',
  label: '교차 히트맵',
  group: '통계 차트',
  icon: 'grid-2x2',
  description: '두 분류의 교차표 — 어느 조합에 몰려 있는지 한눈에',
  isContainer: false,
  bindingModes: ['group'],
  events: [],
  propsSchema: z.object({
    title: z.string().default('교차 히트맵'),
    subtitle: z.string().default(''),
    /** 가로로 늘어놓을 계열 수 상한 — 넘치면 '기타'로 합친다. */
    maxColumns: z.number().int().min(2).max(8).default(8),
    showLegend: z.boolean().default(true),
  }),
  defaultProps: { title: '교차 히트맵', subtitle: '', maxColumns: 8, showLegend: true },
  defaultGrid: { span: 6, rowSpan: 20 },
  render: ({ props, data }) => {
    const matrix = toMatrixSeries(data === undefined ? SAMPLE_MATRIX : data, props.maxColumns);
    const empty = matrix.labels.length === 0 || matrix.seriesKeys.length === 0;
    /**
     * 칸의 진하기 — **가장 작은 칸을 옅은 끝, 가장 큰 칸을 짙은 끝**으로 펼친다.
     *
     * 0을 기준으로 잡으면 값이 서로 비슷할 때 색이 거의 같아진다: 27~42짜리 표에서
     * 0~max 기준이면 농도가 0.64~1.0에만 몰려 전부 한 색으로 보였다.
     */
    const span = matrix.max - matrix.min;
    const tintPercent = (v: number) => TINT_MIN + (span === 0 ? 1 : (v - matrix.min) / span) * (TINT_MAX - TINT_MIN);

    return (
      <div className="flex h-full min-h-[140px] flex-col gap-1">
        {props.title ? <h3 className="chart-title">{props.title}</h3> : null}
        {props.subtitle ? <p className="text-xs text-muted-foreground">{props.subtitle}</p> : null}
        {empty ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            표시할 데이터가 없습니다
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 pt-1">
            {/* 가로 스크롤은 이 안에서만 — 계열이 많아도 화면 전체가 밀리지 않는다. */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div
                className="grid h-full min-w-fit gap-1"
                style={{ gridTemplateColumns: `minmax(72px, max-content) repeat(${matrix.seriesKeys.length}, minmax(44px, 1fr))` }}
              >
                <div />
                {matrix.seriesKeys.map((key) => (
                  <div key={key} className="chart-ink truncate px-1 pb-0.5 text-center text-[10px] font-medium" title={key}>
                    {key}
                  </div>
                ))}
                {matrix.labels.map((label) => (
                  <Fragment key={label}>
                    <div className="chart-ink flex items-center truncate pr-1 text-[11px]" title={label}>
                      {label}
                    </div>
                    {matrix.seriesKeys.map((key) => {
                      const v = matrix.values.get(label)?.get(key) ?? 0;
                      return (
                        <div
                          key={key}
                          data-slot="crosstab-cell"
                          className="flex min-h-7 items-center justify-center rounded-sm text-[11px] tabular-nums"
                          style={{ backgroundColor: v === 0 ? 'var(--muted)' : cellTint(tintPercent(v)) }}
                          title={`${label} · ${key}: ${format(v)}`}
                        >
                          <span className={v === 0 ? 'text-muted-foreground' : 'font-semibold text-foreground'}>
                            {v === 0 ? '·' : format(v)}
                          </span>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
            {props.showLegend ? (
              // 눈금에 실제 값을 적는다 — 농도가 무엇의 농도인지 알려면 양 끝 숫자가 있어야 한다.
              <div className="chart-ink flex items-center justify-end gap-1.5 text-[10px] tabular-nums">
                <span>{format(matrix.min)}</span>
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <span key={t} className="size-3 rounded-[2px]" style={{ backgroundColor: cellTint(TINT_MIN + t * (TINT_MAX - TINT_MIN)) }} />
                ))}
                <span>{format(matrix.max)}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  },
});

// ── 18. 레이더 차트 ──────────────────────────────────────────────────────────
const radarChart = defineComponent({
  key: 'stat-radar',
  label: '레이더 차트',
  group: '통계 차트',
  icon: 'radar',
  description: '다변량 지표 비교 — 항목별 균형 확인',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('레이더 차트') }),
  defaultProps: { title: '레이더 차트' },
  defaultGrid: { span: 6, rowSpan: 24 },
  render: ({ props, data }) => {
    const rows = data === undefined ? SAMPLE_SERIES : series(data);
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0}>
        <RadarChart data={rows}>
          <PolarGrid />
          <PolarAngleAxis dataKey="label" fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Radar dataKey="value" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.35} />
        </RadarChart>
      </StatShell>
    );
  },
});

// ── 19. 워터폴 차트 ──────────────────────────────────────────────────────────
const waterfallChart = defineComponent({
  key: 'stat-waterfall',
  label: '워터폴 차트',
  group: '통계 차트',
  icon: 'chart-column-stacked',
  description: '증감 기여도 분해 — 누적 변화 추적',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('워터폴 차트'), yLabel: z.string().default('') }),
  defaultProps: { title: '워터폴 차트', yLabel: '' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const input = data === undefined ? SAMPLE_SERIES.map((s, i) => ({ ...s, value: i % 2 === 0 ? s.value : -s.value / 2 })) : series(data);
    const rows = waterfallSeries(input);
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0} note={rows.length > 0 ? `최종 누계 ${format(rows[rows.length - 1].total)}` : undefined}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} {...catAxis(rows, 'label')} />
          <YAxis domain={['auto', 'auto']} {...axisProps} {...yAxisLabelProps(props.yLabel)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" name="변화량" radius={2}>
            {rows.map((r, i) => (
              <Cell key={i} fill={input[i]?.value >= 0 ? 'var(--chart-1)' : 'var(--chart-4)'} />
            ))}
          </Bar>
        </ComposedChart>
      </StatShell>
    );
  },
});

// ── 20. 퍼널 차트 ────────────────────────────────────────────────────────────
const funnelChart = defineComponent({
  key: 'stat-funnel',
  label: '퍼널 차트',
  group: '통계 차트',
  icon: 'filter',
  description: '단계별 통과/잔존 비율 — 공정 흐름 손실 분석',
  isContainer: false,
  bindingModes: ['list'],
  events: [],
  propsSchema: z.object({ title: z.string().default('퍼널 차트') }),
  defaultProps: { title: '퍼널 차트' },
  defaultGrid: { span: 6, rowSpan: 22 },
  render: ({ props, data }) => {
    const rows = [...(data === undefined ? SAMPLE_SERIES : series(data))].sort((a, b) => b.value - a.value);
    const first = rows[0]?.value ?? 0;
    return (
      <StatShell title={props.title} isEmpty={rows.length === 0} note={rows.length > 1 && first > 0 ? `최종 통과율 ${((rows[rows.length - 1].value / first) * 100).toFixed(1)}%` : undefined}>
        <FunnelChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Funnel dataKey="value" data={rows} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={r.label} fill={seriesColor(i)} />
            ))}
            <LabelList dataKey="label" position="right" fontSize={11} fill="var(--foreground)" />
          </Funnel>
        </FunnelChart>
      </StatShell>
    );
  },
});

export const statisticsComponents = [
  histogram,
  boxplot,
  scatterPlot,
  regressionScatter,
  bubbleChart,
  paretoChart,
  controlXbar,
  controlR,
  controlImr,
  controlP,
  capabilityChart,
  runChart,
  movingAverageChart,
  cdfChart,
  qqPlot,
  residualPlot,
  heatmapMatrix,
  crosstabHeatmap,
  radarChart,
  waterfallChart,
  funnelChart,
];
