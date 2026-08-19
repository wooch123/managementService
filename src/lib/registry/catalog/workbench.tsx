import { z } from 'zod';
import Link from 'next/link';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusBadgeClass } from '@/lib/status-tone';
import { toRecordRow, toRecordRows, type RecordField, type RecordRow } from '@/lib/record-view';
import { toLabelValueSeries } from '@/lib/chart-series';
import { StatusFilter, StatusFilterPreview } from '@/components/runtime/StatusFilter';
import { SelectLink } from '@/components/runtime/SelectLink';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 운영 화면(워크벤치)용 컴포넌트 — "목록에서 고르면 그 항목의 상세·이력·다음 행동이 따라온다"는
 * 청사진의 뼈대를 이루는 것들이다(estorage-desktop-blueprints/REVIEW.md).
 *
 * 공통 규약: **바인딩의 `select` 순서가 곧 화면 순서**다(칸반·간트와 같은 규칙). 별도의 fieldId
 * 속성을 만들지 않는 이유는 그 정보가 이미 바인딩에 있기 때문이다 — 같은 것을 두 곳에 적으면
 * 반드시 어긋난다. 라벨은 조회 결과의 컬럼 메타(`label`)에서 온다(data-engine/query.ts).
 */

/** 빌더 캔버스에서 보여 줄 표본 — 운영 렌더러는 항상 실제 값(또는 null)을 넘긴다. */
const SAMPLE_RECORD: RecordRow = {
  id: 'sample',
  fields: [
    { label: 'FAR No', text: 'FAR-26-4514', raw: '', dataType: 'TEXT', isEnum: false, isNumeric: false, isDate: false, isEmpty: false },
    { label: '고객사', text: 'A社(Mobile)', raw: '', dataType: 'TEXT', isEnum: false, isNumeric: false, isDate: false, isEmpty: false },
    { label: '진행상태', text: '분석중', raw: '', dataType: 'ENUM', isEnum: true, isNumeric: false, isDate: false, isEmpty: false },
    { label: '담당자', text: '윤태호', raw: '', dataType: 'TEXT', isEnum: false, isNumeric: false, isDate: false, isEmpty: false },
    { label: 'TAT(일)', text: '17', raw: '', dataType: 'INTEGER', isEnum: false, isNumeric: true, isDate: false, isEmpty: false },
  ],
};
const SAMPLE_ROWS: RecordRow[] = [SAMPLE_RECORD, { ...SAMPLE_RECORD, id: 'sample-2' }, { ...SAMPLE_RECORD, id: 'sample-3' }];

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="shrink-0">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** 아직 아무것도 고르지 않았을 때 — 빈 카드가 아니라 "무엇을 해야 하는지"를 적는다. */
function NothingSelected({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-4 text-center">
      <MousePointerClick className="size-4 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

/** 값 하나를 화면에 — ENUM은 상태 배지로, 숫자는 자릿수 정렬로. */
function FieldValue({ field }: { field: RecordField }) {
  if (field.isEnum && !field.isEmpty) return <span className={statusBadgeClass(field.text)}>{field.text}</span>;
  return <span className={cn('text-sm', field.isNumeric && 'tabular-nums', field.isEmpty && 'text-muted-foreground')}>{field.text}</span>;
}

export const workbenchComponents = [
  defineComponent({
    key: 'option-select',
    label: '선택 입력(값 목록)',
    group: '입력',
    icon: 'list-filter',
    description: '정해진 값 중에서 고르는 입력 — 설계의 ENUM 값을 그대로 쓴다',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('라벨'),
      placeholder: z.string().default('선택하세요'),
      options: z.array(z.string()).default([]),
    }),
    defaultProps: { label: '라벨', placeholder: '선택하세요', options: [] },
    defaultGrid: { span: 3, rowSpan: 8 },
    render: ({ node, props, value, onValueChange }) => (
      // 기존 '선택 상자'들은 옵션이 고정된 장식이라 폼에 쓸 수 없었다(값이 액션으로 가지 않는다).
      // 상태·우선순위처럼 값 집합이 설계에 이미 있는 칸은 글자로 받으면 오타가 그대로 저장된다.
      <div className="flex flex-col gap-1.5">
        <label htmlFor={node.id} className="text-sm font-medium">
          {props.label}
        </label>
        <select
          id={node.id}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          {...(onValueChange
            ? { value: (value as string) ?? '', onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value) }
            : { defaultValue: '' })}
        >
          <option value="">{props.placeholder}</option>
          {props.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    ),
  }),

  defineComponent({
    key: 'record-detail',
    label: '선택 상세',
    group: '데이터 표시',
    icon: 'panel-right',
    description: '목록에서 고른 항목 하나의 상세 — 첫 필드가 제목, ENUM은 상태 배지',
    isContainer: false,
    // 필드 수만큼 세로로 자란다(칸 높이에 맞춰 줄어들면 아래쪽 필드가 잘린다).
    growsWithContent: true,
    surface: 'strong',
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      /** 아무것도 선택되지 않았을 때의 안내 */
      emptyText: z.string().default('목록에서 항목을 선택하세요'),
      /** 제목 옆에 붙일 보조 정보 개수(제목 다음 필드부터) */
      subtitleCount: z.number().int().min(0).max(4).default(2),
    }),
    defaultProps: { title: '', emptyText: '목록에서 항목을 선택하세요', subtitleCount: 2 },
    defaultGrid: { span: 4, rowSpan: 20 },
    render: ({ props, data }) => {
      const record = data === undefined ? SAMPLE_RECORD : toRecordRow(data);
      if (!record) {
        return (
          <div className="flex h-full flex-col gap-2">
            <Heading title={props.title} />
            <NothingSelected text={props.emptyText} />
          </div>
        );
      }
      const [head, ...rest] = record.fields;
      const subtitles = rest.slice(0, props.subtitleCount);
      const details = rest.slice(props.subtitleCount);
      return (
        <div className="flex h-full flex-col gap-3">
          <Heading title={props.title} />
          <div className="shrink-0 border-b pb-2">
            <p className="text-base font-semibold break-words">{head?.text ?? '—'}</p>
            {subtitles.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {subtitles.map((field) =>
                  field.isEnum && !field.isEmpty ? (
                    <span key={field.label} className={statusBadgeClass(field.text)}>
                      {field.text}
                    </span>
                  ) : (
                    <span key={field.label} className="text-xs text-muted-foreground">
                      {field.text}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
          <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-2">
            {details.map((field) => (
              <div key={field.label} className="contents">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="min-w-0 break-words">
                  <FieldValue field={field} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
    },
  }),

  defineComponent({
    key: 'record-timeline',
    label: '이력 타임라인',
    group: '데이터 표시',
    icon: 'git-commit-horizontal',
    description: '선택 항목의 이력을 시간 순으로 — 첫 필드가 제목, 날짜/ENUM은 자동 인식',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      emptyText: z.string().default('표시할 이력이 없습니다'),
      maxItems: z.number().int().min(1).max(50).default(8),
    }),
    defaultProps: { title: '', emptyText: '표시할 이력이 없습니다', maxItems: 8 },
    defaultGrid: { span: 4, rowSpan: 18 },
    render: ({ props, data }) => {
      const rows = data === undefined ? SAMPLE_ROWS : toRecordRows(data, props.maxItems);
      return (
        <div className="flex h-full flex-col gap-2">
          <Heading title={props.title} />
          {rows.length === 0 ? (
            <NothingSelected text={props.emptyText} />
          ) : (
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {rows.map((row) => {
                const [head, ...rest] = row.fields;
                const when = rest.find((f) => f.isDate);
                const status = rest.find((f) => f.isEnum);
                const notes = rest.filter((f) => f !== when && f !== status && !f.isEmpty);
                return (
                  <li key={row.id} className="relative pl-4">
                    {/* 세로선 + 점: 항목 사이의 시간 흐름을 눈으로 잇는다. */}
                    <span className="absolute top-1.5 left-0 size-2 rounded-full bg-primary" aria-hidden />
                    <span className="absolute top-4 bottom-[-0.75rem] left-[3px] w-px bg-border last:hidden" aria-hidden />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium break-words">{head?.text ?? '—'}</span>
                      {status && !status.isEmpty && <span className={statusBadgeClass(status.text)}>{status.text}</span>}
                      {when && !when.isEmpty && <span className="text-xs text-muted-foreground tabular-nums">{when.text}</span>}
                    </div>
                    {notes.length > 0 && (
                      <p className="mt-0.5 text-xs break-words text-muted-foreground">
                        {notes.map((f) => `${f.label} ${f.text}`).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      );
    },
  }),

  defineComponent({
    key: 'list-panel',
    label: '요약 목록',
    group: '데이터 표시',
    icon: 'list',
    description: '표보다 가벼운 목록 — 첫 필드가 제목, 마지막 ENUM/숫자가 오른쪽 배지',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      emptyText: z.string().default('표시할 항목이 없습니다'),
      maxItems: z.number().int().min(1).max(50).default(8),
      /** 오른쪽 배지 뒤에 붙일 단위(예: '일') */
      badgeSuffix: z.string().default(''),
      /**
       * 한 줄을 누르면 어디로 갈지. 목록은 읽을거리가 아니라 조치의 입구다 —
       * 비우면 지금 화면에서 그 항목을 고르고, 슬러그를 주면 그 화면으로 데려간다.
       */
      linkSlug: z.string().default(''),
      linkParam: z.string().default('sel'),
      /** 누를 수 있게 할지(첫 필드 값이 파라미터로 나간다) */
      clickable: z.boolean().default(false),
    }),
    defaultProps: {
      title: '',
      subtitle: '',
      emptyText: '표시할 항목이 없습니다',
      maxItems: 8,
      badgeSuffix: '',
      linkSlug: '',
      linkParam: 'sel',
      clickable: false,
    },
    defaultGrid: { span: 4, rowSpan: 20 },
    render: ({ props, data }) => {
      const rows = data === undefined ? SAMPLE_ROWS : toRecordRows(data, props.maxItems);
      return (
        <div className="flex h-full flex-col gap-2">
          <Heading title={props.title} subtitle={props.subtitle} />
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              {props.emptyText}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {rows.map((row) => {
                const [head, ...rest] = row.fields;
                // 오른쪽 배지는 "마지막에 고른 필드"다 — 관리자가 select 맨 뒤에 상태/수치를 두면 된다.
                const badge = rest.length > 0 ? rest[rest.length - 1] : null;
                const meta = rest.slice(0, Math.max(0, rest.length - 1)).filter((f) => !f.isEmpty);
                const body = (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" title={head?.text}>
                        {head?.text ?? '—'}
                      </span>
                      {meta.length > 0 && (
                        <span className="block truncate text-xs text-muted-foreground" title={meta.map((f) => f.text).join(' · ')}>
                          {meta.map((f) => f.text).join(' · ')}
                        </span>
                      )}
                    </span>
                    {badge && !badge.isEmpty && (
                      <span className={statusBadgeClass(badge.isNumeric ? '' : badge.text)}>
                        {badge.text}
                        {props.badgeSuffix}
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={row.id} className="py-2">
                    {props.clickable && head && !head.isEmpty ? (
                      <SelectLink
                        slug={props.linkSlug || undefined}
                        param={props.linkParam}
                        value={head.text}
                        className="rounded-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
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

  defineComponent({
    key: 'article-cards',
    label: '문서 카드',
    group: '데이터 표시',
    icon: 'library-big',
    description: '게시글·문서를 카드 격자로 — 분류 배지·제목·요약·지표',
    isContainer: false,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      emptyText: z.string().default('표시할 문서가 없습니다'),
      columns: z.number().int().min(1).max(4).default(3),
      maxItems: z.number().int().min(1).max(24).default(6),
      /** 카드를 누르면 그 문서를 고른다(비우면 지금 화면에서 선택) */
      linkSlug: z.string().default(''),
      linkParam: z.string().default('sel'),
      clickable: z.boolean().default(false),
    }),
    defaultProps: {
      title: '',
      subtitle: '',
      emptyText: '표시할 문서가 없습니다',
      columns: 3,
      maxItems: 6,
      linkSlug: '',
      linkParam: 'sel',
      clickable: false,
    },
    defaultGrid: { span: 12, rowSpan: 22 },
    render: ({ props, data }) => {
      const rows = data === undefined ? SAMPLE_ROWS : toRecordRows(data, props.maxItems);
      return (
        <div className="flex h-full flex-col gap-2">
          <Heading title={props.title} subtitle={props.subtitle} />
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              {props.emptyText}
            </div>
          ) : (
            <div
              className="grid min-h-0 flex-1 gap-2 overflow-y-auto"
              // 카드가 좁은 폭에서 한 줄에 하나로 접히도록 최소 폭을 함께 준다.
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / props.columns)}%), 1fr))` }}
            >
              {rows.map((row) => {
                const [head, ...rest] = row.fields;
                const category = rest.find((f) => f.isEnum);
                const body = rest.find((f) => !f.isEnum && !f.isDate && !f.isNumeric && !f.isEmpty);
                const metas = rest.filter((f) => f !== category && f !== body && !f.isEmpty);
                const card = (
                  <span className="flex h-full flex-col gap-1.5 rounded-lg border p-3 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      {category && !category.isEmpty && <span className={statusBadgeClass(category.text)}>{category.text}</span>}
                    </span>
                    <span className="block text-sm font-semibold break-words">{head?.text ?? '—'}</span>
                    {body && <span className="line-clamp-3 block text-xs break-words text-muted-foreground">{body.text}</span>}
                    {metas.length > 0 && (
                      <span className="mt-auto block text-[11px] text-muted-foreground">
                        {metas.map((f) => `${f.label} ${f.text}`).join(' · ')}
                      </span>
                    )}
                  </span>
                );
                return (
                  <article key={row.id} className="h-full">
                    {props.clickable && head && !head.isEmpty ? (
                      <SelectLink
                        slug={props.linkSlug || undefined}
                        param={props.linkParam}
                        value={head.text}
                        className="h-full transition-colors hover:bg-muted/50"
                        activeClassName="ring-2 ring-primary/40"
                      >
                        {card}
                      </SelectLink>
                    ) : (
                      card
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      );
    },
  }),

  defineComponent({
    key: 'checklist',
    label: '점검 목록',
    group: '데이터 표시',
    icon: 'list-checks',
    description: '작성·제출 전 확인할 항목과 각 항목의 상태',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      items: z
        .array(z.object({ label: z.string(), description: z.string().default(''), status: z.string().default('') }))
        .default([]),
    }),
    defaultProps: { title: '', subtitle: '', items: [] },
    defaultGrid: { span: 4, rowSpan: 18 },
    render: ({ props }) => {
      const items =
        props.items.length > 0
          ? props.items
          : [
              { label: '항목 1', description: '설명', status: '완료' },
              { label: '항목 2', description: '설명', status: '작성 필요' },
            ];
      return (
        <div className="flex h-full flex-col gap-2">
          <Heading title={props.title} subtitle={props.subtitle} />
          <ul className="divide-y">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{item.label}</p>
                  {item.description && <p className="text-xs break-words text-muted-foreground">{item.description}</p>}
                </div>
                {item.status && <span className={statusBadgeClass(item.status)}>{item.status}</span>}
              </li>
            ))}
          </ul>
        </div>
      );
    },
  }),

  defineComponent({
    key: 'stepper',
    label: '단계 표시',
    group: '레이아웃',
    icon: 'footprints',
    description: '여러 단계로 나뉜 작업에서 지금 어디인지 보여준다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      steps: z.array(z.string()).default([]),
      /** 지금 단계(1부터). 그 앞 단계는 완료로 그린다. */
      current: z.number().int().min(1).default(1),
    }),
    defaultProps: { steps: [], current: 1 },
    defaultGrid: { span: 12, rowSpan: 4 },
    render: ({ props }) => {
      const steps = props.steps.length > 0 ? props.steps : ['1단계', '2단계', '3단계'];
      return (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {steps.map((step, index) => {
            const position = index + 1;
            const done = position < props.current;
            const active = position === props.current;
            return (
              <li key={`${step}-${index}`} className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                    active ? 'bg-primary text-primary-foreground'
                    : done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                  )}
                >
                  <span className="tabular-nums">{position}</span>
                  {step}
                </span>
                {position < steps.length && <ArrowRight className="size-3 text-muted-foreground" aria-hidden />}
              </li>
            );
          })}
        </ol>
      );
    },
  }),

  defineComponent({
    key: 'nav-cards',
    label: '바로가기 카드',
    group: '내비게이션',
    icon: 'layout-grid',
    description: '유형·구역별 진입 카드 — 누르면 해당 페이지로 이동',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      columns: z.number().int().min(1).max(5).default(3),
      items: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().default(''),
            /** 이동할 페이지 slug(운영 주소는 /home/{slug}) */
            slug: z.string().default(''),
            /** 카드 아래에 덧붙일 짧은 수치·상태 문구 */
            meta: z.string().default(''),
          })
        )
        .default([]),
    }),
    defaultProps: { title: '', subtitle: '', columns: 3, items: [] },
    defaultGrid: { span: 12, rowSpan: 14 },
    render: ({ props }) => {
      const items =
        props.items.length > 0 ? props.items : [{ title: '카드 제목', description: '설명', slug: '', meta: '' }];
      return (
        <div className="flex h-full flex-col gap-2">
          <Heading title={props.title} subtitle={props.subtitle} />
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / props.columns)}%), 1fr))` }}
          >
            {items.map((item, index) => {
              const content = (
                <>
                  <span className="text-sm font-semibold break-words">{item.title}</span>
                  {item.description && <span className="text-xs break-words text-muted-foreground">{item.description}</span>}
                  {item.meta && <span className="mt-auto text-xs font-medium tabular-nums text-foreground/80">{item.meta}</span>}
                </>
              );
              const className =
                'flex h-full min-h-[84px] flex-col gap-1 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/50';
              return item.slug ? (
                <Link key={`${item.title}-${index}`} href={`/home/${item.slug}`} className={className}>
                  {content}
                </Link>
              ) : (
                <div key={`${item.title}-${index}`} className={className}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      );
    },
  }),

  defineComponent({
    key: 'status-filter',
    label: '상태 필터',
    group: '유틸리티',
    icon: 'filter',
    description: '고른 값을 주소에 적어 페이지의 모든 바인딩을 그 조건으로 좁힌다',
    isContainer: false,
    // 좁은 폭에서 세그먼트가 두세 줄로 접힌다 — 접힌 만큼 칸이 늘어나야 한다(기간 필터와 같음).
    growsWithContent: true,
    /**
     * 항목별 집계를 물리면 각 세그먼트에 **건수가 붙는다**("미배정 805"). 청사진의 세그먼트는
     * 필터이자 지표다 — 건수가 없으면 어느 상태에 일이 몰렸는지 눌러 보기 전에는 알 수 없다.
     */
    bindingModes: ['group'],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      /** 주소 파라미터 이름 — 바인딩 필터에서 `주소 쿼리` 소스로 이 이름을 지목한다. */
      param: z.string().default('status'),
      options: z.array(z.object({ label: z.string(), value: z.string().default('') })).default([]),
      /** 집계를 물렸을 때 세그먼트에 건수를 함께 보여줄지 */
      showCounts: z.boolean().default(true),
    }),
    defaultProps: { title: '', param: 'status', options: [], showCounts: true },
    defaultGrid: { span: 12, rowSpan: 3 },
    render: ({ props, data, onValueChange }) => {
      const base = props.options.length > 0 ? props.options : [{ label: '전체', value: '' }];
      const counts =
        props.showCounts && data !== undefined ? new Map(toLabelValueSeries(data).map((s) => [s.label, s.value])) : null;
      const total = counts ? [...counts.values()].reduce((sum, n) => sum + n, 0) : null;
      const options = base.map((option) => {
        if (!counts) return option;
        // 빈 값('전체')에는 총합을, 나머지에는 그 값의 건수를 붙인다. 집계에 없는 값은 0으로 —
        // 라벨이 사라지면 "그 상태가 없다"가 아니라 "필터가 없다"로 읽힌다.
        const count = option.value === '' ? total : (counts.get(option.value) ?? 0);
        return { ...option, label: count === null ? option.label : `${option.label} ${count.toLocaleString('ko-KR')}` };
      });
      // onValueChange가 있으면 운영/미리보기 런타임이다(주소를 바꿀 수 있다).
      return typeof onValueChange === 'function' ? (
        <StatusFilter title={props.title} param={props.param} options={options} />
      ) : (
        <StatusFilterPreview title={props.title} options={options} />
      );
    },
  }),
] satisfies ComponentDef[];
