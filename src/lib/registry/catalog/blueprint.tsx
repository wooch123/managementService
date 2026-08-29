import { z } from 'zod';
import Link from 'next/link';
import { ArrowRight, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusBadgeClass } from '@/lib/status-tone';
import { toLabelValueSeries } from '@/lib/chart-series';
import { toRecordRows } from '@/lib/record-view';
import { SearchFilter, SearchFilterPreview, SelectFilter, SelectFilterPreview } from '@/components/runtime/QueryFilters';
import { SelectLink } from '@/components/runtime/SelectLink';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 청사진(estorage-desktop-blueprints)이 화면마다 쓰는데 카탈로그에는 없던 것들.
 *
 * 있는 컴포넌트로 비슷하게 흉내 내는 대신 각각을 제 모양으로 만든다 — 지표 타일의 보조 한 줄,
 * 단계별 작업량 막대, 입력을 한 덩어리로 묶는 폼 카드, 주소에 남는 검색·선택 필터,
 * 제목 옆 액션. 흉내 낸 것과 만든 것의 차이는 "정보가 하나 더 들어가느냐"에서 갈린다.
 */

// ── 지표 타일 ───────────────────────────────────────────────────────────────

type Kpi = { value: number; previous: number | null; secondary: number | null };

function toKpi(data: unknown): Kpi | null {
  if (typeof data === 'number') return { value: data, previous: null, secondary: null };
  if (data && typeof data === 'object' && typeof (data as { value?: unknown }).value === 'number') {
    const d = data as { value: number; previous?: number | null; secondary?: number | null };
    return { value: d.value, previous: d.previous ?? null, secondary: d.secondary ?? null };
  }
  return null;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

// ── 폼 카드 ─────────────────────────────────────────────────────────────────

/** 폼 카드가 자식으로 받는 것들 — 입력과 그 옆에 붙는 버튼. */
const FORM_CHILDREN = [
  'input',
  'textarea',
  'option-select',
  'select',
  'native-select',
  'date-picker',
  'checkbox',
  'switch',
  'radio-group',
  'button',
  'typography',
  'alert',
];

export const blueprintComponents = [
  defineComponent({
    key: 'stat-tile',
    label: '지표 타일',
    group: '데이터 표시',
    icon: 'gauge',
    description: '큰 숫자 하나 + 증감 + 보조 한 줄 — 목표 대비·위험 건수를 함께 보여준다',
    isContainer: false,
    // 숫자가 먼저 읽혀야 하는 카드다(차트처럼 물러나지 않는다).
    surface: 'strong',
    bindingModes: ['aggregate'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      unit: z.string().default('건'),
      /** 보조 수치 앞에 붙일 말 — 예: '지연 위험' → "지연 위험 38건" */
      secondaryLabel: z.string().default(''),
      /** 보조 수치가 큰 것이 좋은 일인지. 지연·위험은 false(많을수록 나쁨). */
      secondaryHigherIsBetter: z.boolean().default(false),
      /**
       * 큰 숫자를 **보조 수치에 대한 비율(%)** 로 보여 준다 — 'TAT 준수율'처럼 두 건수의 비가
       * 곧 지표인 경우. 집계는 개수 하나만 돌려주므로 분자를 기본 조건으로, 분모를 보조 조건으로
       * 세어 여기서 나눈다. 보조 줄에는 그 두 건수를 적어 근거를 남긴다.
       *
       * 'complement'는 100%에서 뺀 값이다. 조건이 AND로만 이어지는 탓에 **재고 싶은 쪽을 직접
       * 셀 수 없고 그 반대쪽만 셀 수 있는** 경우가 있다 — 예: '기한 내 처리'는 (마감 전 OR
       * 분석 완료)라 한 번에 못 세지만, 그 반대인 '마감을 넘겼는데 아직 분석값이 없는 건'은
       * AND 하나로 정확히 세어진다. 그것을 세고 100에서 뺀다.
       */
      percentMode: z.enum(['off', 'share', 'complement']).default('off'),
      /** 목표값(비우면 표시하지 않는다) — 예: 평균 TAT 목표 18일 */
      target: z.number().nullable().default(null),
      targetLabel: z.string().default('목표'),
      /** 목표를 밑도는 것이 좋은 지표인지(TAT·불량률은 true) */
      lowerIsBetter: z.boolean().default(false),
      /**
       * 누르면 그 조건으로 좁힌 목록으로 간다(청사진 ① "KPI를 필터 결과와 직접 연결").
       * 숫자만 보여 주면 "그래서 그 216건이 무엇인가"를 다시 찾아야 한다.
       */
      linkSlug: z.string().default(''),
      linkParam: z.string().default(''),
      linkValue: z.string().default(''),
    }),
    defaultProps: {
      title: '',
      unit: '건',
      secondaryLabel: '',
      secondaryHigherIsBetter: false,
      percentMode: 'off',
      target: null,
      targetLabel: '목표',
      lowerIsBetter: false,
      linkSlug: '',
      linkParam: '',
      linkValue: '',
    },
    defaultGrid: { span: 3, rowSpan: 7 },
    render: ({ props, data }) => {
      const kpi = data === undefined ? { value: 419, previous: 386, secondary: 38 } : toKpi(data);
      if (!kpi) {
        return (
          <div className="flex h-full flex-col justify-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{props.title}</span>
            <span className="text-3xl font-semibold text-muted-foreground">—</span>
          </div>
        );
      }
      const delta = kpi.previous !== null && kpi.previous !== 0 ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) : null;
      // 목표 대비는 "얼마나 벗어났는가"를 부호 그대로 보여준다 — 좋고 나쁨은 색이 말한다.
      const gap = props.target !== null ? kpi.value - props.target : null;
      const gapIsGood = gap === null ? null : props.lowerIsBetter ? gap <= 0 : gap >= 0;
      const secondaryIsGood = kpi.secondary === null ? null : props.secondaryHigherIsBetter ? kpi.secondary > 0 : kpi.secondary === 0;
      /**
       * 비율 지표 — 큰 숫자를 "기본 조건 ÷ 보조 조건"의 백분율로 바꾼다.
       * 이때 증감 배지는 띄우지 않는다: 비교값은 분자만의 지난 건수라 비율의 증감이 아니다.
       */
      const share =
        props.percentMode !== 'off' && kpi.secondary !== null && kpi.secondary !== 0
          ? (kpi.value / kpi.secondary) * 100
          : null;
      const ratio = share === null ? null : props.percentMode === 'complement' ? 100 - share : share;
      /** 보조 줄에 적을 건수 — complement면 '나머지'가 곧 우리가 말하는 그 수다. */
      const ratioCount = ratio === null ? 0 : props.percentMode === 'complement' ? (kpi.secondary ?? 0) - kpi.value : kpi.value;

      const body = (
        <div className="flex h-full flex-col justify-center gap-1.5">
          {props.title && (
            <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              {props.title}
              {props.linkParam && <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
            </span>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold text-foreground tabular-nums">
              {ratio !== null ? ratio.toFixed(1) : formatNumber(kpi.value)}
              {ratio !== null ? (
                <span className="ml-1 text-base font-normal text-muted-foreground">%</span>
              ) : (
                props.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{props.unit}</span>
              )}
            </span>
            {ratio === null && delta !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
                  delta > 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : delta < 0 ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'
                )}
                title={`직전 동일 기간 ${formatNumber(kpi.previous ?? 0)}${props.unit}`}
              >
                {delta > 0 ? <ArrowUpRight className="size-3" /> : delta < 0 ? <ArrowDownRight className="size-3" /> : null}
                {delta > 0 ? '+' : ''}
                {(delta * 100).toFixed(delta !== 0 && Math.abs(delta) < 0.1 ? 1 : 0)}%
              </span>
            )}
          </div>
          {/* 보조 한 줄 — 청사진의 kpi-note. 여기가 "지금 무엇을 봐야 하는가"를 말한다. */}
          {(kpi.secondary !== null || gap !== null) && (
            <p className="text-xs">
              {kpi.secondary !== null && (
                ratio !== null ? (
                  // 비율의 근거 — 무엇을 무엇으로 나눴는지 숫자로 남긴다.
                  <span className="text-muted-foreground tabular-nums">
                    {props.secondaryLabel} {formatNumber(ratioCount)} / {formatNumber(kpi.secondary)}
                    {props.unit}
                  </span>
                ) : (
                  <span className={secondaryIsGood ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'}>
                    {props.secondaryLabel} {formatNumber(kpi.secondary)}
                    {props.unit}
                  </span>
                )
              )}
              {kpi.secondary !== null && gap !== null && <span className="text-muted-foreground"> · </span>}
              {gap !== null && (
                <span className={gapIsGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {props.targetLabel} {formatNumber(props.target ?? 0)}
                  {props.unit} 대비 {gap > 0 ? '+' : ''}
                  {formatNumber(gap)}
                  {props.unit}
                </span>
              )}
            </p>
          )}
        </div>
      );

      // 누를 수 있는 지표는 "그 숫자가 무엇인지"로 데려간다. 링크 설정이 없으면 지금까지처럼 정적이다.
      return props.linkParam ? (
        <SelectLink
          slug={props.linkSlug || undefined}
          param={props.linkParam}
          value={props.linkValue}
          className="group h-full rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {body}
        </SelectLink>
      ) : (
        body
      );
    },
  }),

  defineComponent({
    key: 'stage-bars',
    label: '단계별 작업량',
    group: '데이터 표시',
    icon: 'bar-chart-horizontal-big',
    description: '단계 이름 · 진행 막대 · 건수 — 어디에 일이 몰려 있는지 한 줄로 본다',
    isContainer: false,
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      /**
       * 단계 순서(쉼표로 구분). 흐름이 있는 값은 **큰 순서가 아니라 진행 순서**로 놓아야 병목이
       * 보인다 — 의뢰 → 반출 → 작업중 → 반입 → 완료. 비우면 값이 큰 순서로 둔다.
       */
      order: z.string().default(''),
      color: z.enum(['primary', 'positive', 'accent', 'warning', 'neutral']).default('primary'),
      unit: z.string().default('건'),
    }),
    defaultProps: { title: '', subtitle: '', order: '', color: 'primary', unit: '건' },
    defaultGrid: { span: 4, rowSpan: 14 },
    render: ({ props, data }) => {
      const series =
        data === undefined
          ? [
              { label: '의뢰', value: 423 },
              { label: '반출', value: 351 },
              { label: '작업중', value: 312 },
              { label: '반입', value: 243 },
              { label: '완료', value: 164 },
            ]
          : toLabelValueSeries(data);

      const order = props.order
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const sorted =
        order.length > 0
          ? [...series].sort((a, b) => {
              const ai = order.indexOf(a.label);
              const bi = order.indexOf(b.label);
              // 순서에 없는 값은 뒤로 — 설계에 없던 상태가 흐름 한가운데 끼어들지 않게.
              return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
            })
          : series;
      const max = Math.max(1, ...sorted.map((s) => s.value));
      const fill = `var(--chart-${{ primary: 1, positive: 2, accent: 3, warning: 4, neutral: 5 }[props.color]})`;

      return (
        <div className="flex h-full flex-col gap-2">
          {(props.title || props.subtitle) && (
            <div className="shrink-0">
              {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
              {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
            </div>
          )}
          {sorted.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              표시할 단계가 없습니다
            </div>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 overflow-y-auto">
              {sorted.map((stage) => (
                <li key={stage.label} className="grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-xs text-muted-foreground" title={stage.label}>
                    {stage.label}
                  </span>
                  <span className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(2, (stage.value / max) * 100)}%`, background: fill }}
                    />
                  </span>
                  <span className="text-xs font-medium tabular-nums">
                    {stage.value.toLocaleString('ko-KR')}
                    {props.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    },
  }),

  defineComponent({
    key: 'form-card',
    label: '입력 폼 카드',
    group: '레이아웃',
    icon: 'clipboard-pen',
    description: '입력들을 한 덩어리로 묶는 폼 — 칸마다 카드가 생기지 않게 한다',
    isContainer: true,
    allowedChildren: FORM_CHILDREN,
    // 안에 든 입력 수만큼 자란다(칸 높이에 맞춰 줄면 아래쪽 입력이 잘린다).
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      description: z.string().default(''),
      columns: z.number().int().min(1).max(4).default(2),
      /** 폼 아래에 한 줄 안내(예: "번호는 저장할 때 자동으로 만들어집니다") */
      footnote: z.string().default(''),
    }),
    defaultProps: { title: '', description: '', columns: 2, footnote: '' },
    defaultGrid: { span: 12, rowSpan: 20 },
    render: ({ props, children }) => (
      <div className="flex h-full flex-col gap-3">
        {(props.title || props.description) && (
          <div className="shrink-0">
            {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
            {props.description && <p className="text-xs text-muted-foreground">{props.description}</p>}
          </div>
        )}
        {/* 자식은 좌표를 갖지 않는다 — 폼 격자가 순서대로 채운다. 좁아지면 한 줄에 하나씩. */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / props.columns)}%), 1fr))` }}
        >
          {children}
        </div>
        {props.footnote && <p className="mt-auto text-xs text-muted-foreground">{props.footnote}</p>}
      </div>
    ),
  }),

  defineComponent({
    key: 'page-header',
    label: '페이지 머리',
    group: '레이아웃',
    icon: 'heading-1',
    description: '페이지 제목·설명과 오른쪽 주요 행동을 한 줄에',
    isContainer: true,
    allowedChildren: ['button', 'button-group', 'badge'],
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('페이지 제목'),
      description: z.string().default(''),
    }),
    defaultProps: { title: '페이지 제목', description: '' },
    defaultGrid: { span: 12, rowSpan: 3 },
    render: ({ props, children }) => (
      // 좁아지면 행동이 제목 아래로 내려온다(제목이 먼저 줄고 버튼은 줄지 않는다는 셸 규칙과 같다).
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
          {props.description && <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      </div>
    ),
  }),

  defineComponent({
    key: 'search-filter',
    label: '통합 검색',
    group: '유틸리티',
    icon: 'search',
    description: '입력한 말로 페이지의 목록을 좁힌다 — 여러 컬럼을 한 번에 찾는다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      label: z.string().default('통합 검색'),
      placeholder: z.string().default('검색어를 입력하세요'),
      /** 주소 파라미터 이름 — 바인딩 필터에서 `주소 쿼리`로 이 이름을 지목한다. */
      param: z.string().default('q'),
    }),
    defaultProps: { label: '통합 검색', placeholder: '검색어를 입력하세요', param: 'q' },
    defaultGrid: { span: 4, rowSpan: 3 },
    render: ({ props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <SearchFilter label={props.label} placeholder={props.placeholder} param={props.param} />
      ) : (
        <SearchFilterPreview label={props.label} placeholder={props.placeholder} />
      ),
  }),

  defineComponent({
    key: 'select-filter',
    label: '선택 필터',
    group: '유틸리티',
    icon: 'filter',
    description: '값이 많은 조건(담당자·고객사)을 드롭다운으로 — 목록은 실제 데이터에서 모은다',
    isContainer: false,
    growsWithContent: true,
    // group 바인딩을 물리면 실제로 존재하는 값만 옵션으로 나온다(설계에 손으로 적지 않는다).
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      label: z.string().default('필터'),
      param: z.string().default('filter'),
      allLabel: z.string().default('전체'),
      /** 바인딩이 없을 때 쓸 고정 옵션(쉼표로 구분) */
      options: z.string().default(''),
    }),
    defaultProps: { label: '필터', param: 'filter', allLabel: '전체', options: '' },
    defaultGrid: { span: 3, rowSpan: 3 },
    render: ({ props, data, onValueChange }) => {
      const fromBinding = data === undefined ? [] : toLabelValueSeries(data).map((s) => s.label);
      const fromProps = props.options
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const options = (fromBinding.length > 0 ? fromBinding : fromProps).filter((o) => o !== '');
      return typeof onValueChange === 'function' ? (
        <SelectFilter label={props.label} param={props.param} allLabel={props.allLabel} options={options} />
      ) : (
        <SelectFilterPreview label={props.label} allLabel={props.allLabel} options={options} />
      );
    },
  }),

  defineComponent({
    key: 'metric-cards',
    label: '지표 바로가기 카드',
    group: '내비게이션',
    icon: 'layout-grid',
    description: '유형별 진입 카드에 실제 건수를 붙인다 — 카드 제목과 같은 분류의 집계를 찾아 쓴다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      columns: z.number().int().min(1).max(5).default(3),
      unit: z.string().default('건'),
      items: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().default(''),
            slug: z.string().default(''),
            /** 집계에서 찾을 분류 값(비우면 카드 제목으로 찾는다) */
            match: z.string().default(''),
          })
        )
        .default([]),
    }),
    defaultProps: { title: '', subtitle: '', columns: 3, unit: '건', items: [] },
    defaultGrid: { span: 12, rowSpan: 15 },
    render: ({ props, data }) => {
      const counts = new Map(
        (data === undefined ? [{ label: '표본', value: 128 }] : toLabelValueSeries(data)).map((s) => [s.label, s.value])
      );
      const items = props.items.length > 0 ? props.items : [{ title: '카드 제목', description: '설명', slug: '', match: '' }];
      return (
        <div className="flex h-full flex-col gap-2">
          {(props.title || props.subtitle) && (
            <div className="shrink-0">
              {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
              {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
            </div>
          )}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / props.columns)}%), 1fr))` }}
          >
            {items.map((item, index) => {
              const count = counts.get(item.match || item.title);
              const body = (
                <>
                  <span className="text-sm font-semibold break-words">{item.title}</span>
                  {item.description && <span className="text-xs break-words text-muted-foreground">{item.description}</span>}
                  <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-base font-semibold tabular-nums">
                      {count === undefined ? '—' : count.toLocaleString('ko-KR')}
                      {count !== undefined && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{props.unit}</span>}
                    </span>
                    {item.slug && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />}
                  </span>
                </>
              );
              const className =
                'flex h-full min-h-[96px] flex-col gap-1 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/50';
              return item.slug ? (
                <Link key={`${item.title}-${index}`} href={`/home/${item.slug}`} className={className}>
                  {body}
                </Link>
              ) : (
                <div key={`${item.title}-${index}`} className={className}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      );
    },
  }),

  defineComponent({
    key: 'callout',
    label: '강조 안내',
    group: '피드백/오버레이',
    icon: 'info',
    description: '지금 화면에서 꼭 알아야 할 한 줄 — 왼쪽 강조선이 붙은 안내',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      text: z.string().default('안내 문구'),
      tone: z.enum(['info', 'warn', 'bad', 'good']).default('info'),
    }),
    defaultProps: { text: '안내 문구', tone: 'info' },
    defaultGrid: { span: 12, rowSpan: 4 },
    render: ({ props }) => (
      <p
        className={cn(
          'rounded-r-md border-l-[3px] px-3 py-2 text-sm',
          props.tone === 'bad' ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          : props.tone === 'warn' ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : props.tone === 'good' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-primary bg-primary/10 text-foreground'
        )}
      >
        {props.text}
      </p>
    ),
  }),

  defineComponent({
    key: 'issue-list',
    label: '이슈 목록',
    group: '데이터 표시',
    icon: 'list-todo',
    description: '제목·부가정보·상태·수치를 한 줄로 — 표보다 읽기 쉬운 처리 대상 목록',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      emptyText: z.string().default('표시할 항목이 없습니다'),
      maxItems: z.number().int().min(1).max(50).default(10),
      /** 목록 옆 '전체 보기'가 이동할 페이지 slug(비우면 표시하지 않는다) */
      moreSlug: z.string().default(''),
      moreLabel: z.string().default('전체 보기'),
      /** 한 줄을 누르면 그 항목을 고른다 */
      linkSlug: z.string().default(''),
      linkParam: z.string().default('sel'),
      clickable: z.boolean().default(false),
    }),
    defaultProps: {
      title: '',
      subtitle: '',
      emptyText: '표시할 항목이 없습니다',
      maxItems: 10,
      moreSlug: '',
      moreLabel: '전체 보기',
      linkSlug: '',
      linkParam: 'sel',
      clickable: false,
    },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props, data }) => {
      // 규약은 다른 레코드 컴포넌트와 같다 — select 순서: 제목 · (부가정보…) · 상태 · 수치
      const rows: IssueRow[] =
        data === undefined
          ? [
              { id: 's1', title: '조회기간 필터가 1024px에서 두 줄로 분리', meta: '#UI · 피드백의요정', status: '검토중', metric: '댓글 5' },
              { id: 's2', title: '페이지 제목 계층을 H1으로 통일', meta: '#접근성 · 비둘기', status: '열림', metric: '댓글 2' },
            ]
          : toIssueRows(data, props.maxItems);
      return (
        <div className="flex h-full flex-col gap-2">
          {(props.title || props.subtitle || props.moreSlug) && (
            <div className="flex shrink-0 items-start justify-between gap-2">
              <div className="min-w-0">
                {props.title && <h3 className="text-sm font-medium">{props.title}</h3>}
                {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
              </div>
              {props.moreSlug && (
                <Link href={`/home/${props.moreSlug}`} className="shrink-0 text-xs text-primary hover:underline">
                  {props.moreLabel}
                </Link>
              )}
            </div>
          )}
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              {props.emptyText}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {rows.map((row) => {
                const body = (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" title={row.title}>
                        {row.title}
                      </span>
                      {row.meta && (
                        <span className="block truncate text-xs text-muted-foreground" title={row.meta}>
                          {row.meta}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {row.status && <span className={statusBadgeClass(row.status)}>{row.status}</span>}
                      {row.metric && <span className="text-xs font-medium tabular-nums text-muted-foreground">{row.metric}</span>}
                    </span>
                  </span>
                );
                return (
                  <li key={row.id} className="py-2.5">
                    {props.clickable && row.title !== '—' ? (
                      <SelectLink
                        slug={props.linkSlug || undefined}
                        param={props.linkParam}
                        value={row.title}
                        className="rounded-sm hover:bg-muted/60"
                        activeClassName="bg-primary/10"
                      >
                        {body}
                      </SelectLink>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
    },
  }),
] satisfies ComponentDef[];

type IssueRow = { id: string; title: string; meta: string; status: string; metric: string };

/** issue-list가 쓰는 변환 — 제목/보조/상태(ENUM)/수치(숫자)를 골라낸다. */
function toIssueRows(data: unknown, limit: number): IssueRow[] {
  const rows = toRecordRows(data, limit);
  return rows.map((row) => {
    const [head, ...rest] = row.fields;
    const status = rest.find((f) => f.isEnum && !f.isEmpty);
    const metricField = rest.find((f) => f.isNumeric && !f.isEmpty);
    const meta = rest.filter((f) => f !== status && f !== metricField && !f.isEmpty);
    return {
      id: row.id,
      title: head?.text ?? '—',
      meta: meta.map((f) => f.text).join(' · '),
      status: status?.text ?? '',
      metric: metricField?.text ?? '',
    };
  });
}
