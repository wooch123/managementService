import { z } from 'zod';

export const filterOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'isNull']);
export type FilterOp = z.infer<typeof filterOpSchema>;

export const filterSchema = z.object({
  fieldId: z.string(),
  op: filterOpSchema,
  source: z.enum(['fixed', 'query', 'component']),
  value: z.unknown().optional(),
  ref: z.string().optional(),
});
export type Filter = z.infer<typeof filterSchema>;

export const sortSchema = z.object({
  fieldId: z.string(),
  dir: z.enum(['asc', 'desc']),
});
export type Sort = z.infer<typeof sortSchema>;

export const bindingSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('static') }),
  z.object({
    mode: z.literal('list'),
    entityId: z.string(),
    select: z.array(z.string()),
    filters: z.array(filterSchema).default([]),
    sort: z.array(sortSchema).default([]),
    pageSize: z.number().int().min(1).max(200).default(10),
  }),
  z.object({
    mode: z.literal('single'),
    entityId: z.string(),
    select: z.array(z.string()),
    keySource: z.enum(['route', 'selection', 'fixed']),
    keyValue: z.string().optional(),
  }),
  z.object({
    mode: z.literal('field'),
    entityId: z.string(),
    fieldId: z.string(),
  }),
  z.object({
    mode: z.literal('aggregate'),
    entityId: z.string(),
    fn: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    fieldId: z.string().optional(),
    filters: z.array(filterSchema).default([]),
  }),
  /**
   * 항목별 집계 — 차트처럼 "분류별 합계"를 그리는 컴포넌트를 위한 모드.
   *
   * WHY: 예전에는 차트도 list 바인딩으로 원시 행을 pageSize만큼(최대 200) 가져와 화면에서 세었다.
   * 데이터가 쌓이면 그 표본만 반영돼 수치가 틀린다 — 실제로 claims 5,000건에서 제품군별 1,255건이
   * 58건으로 그려졌다(2026-08-19 실측). 이 모드는 GROUP BY로 DB가 전부 집계해 결과만 가져온다.
   */
  z.object({
    mode: z.literal('group'),
    entityId: z.string(),
    /** 가로축(분류)으로 쓸 필드 */
    groupFieldId: z.string(),
    fn: z.enum(['count', 'sum', 'avg']).default('count'),
    /** sum/avg 대상 숫자 필드 (count면 필요 없음) */
    valueFieldId: z.string().optional(),
    filters: z.array(filterSchema).default([]),
    /** 값 큰 순서 또는 분류 이름 순서 */
    orderBy: z.enum(['value', 'label']).default('value'),
    /** 그릴 항목 수 상한(막대가 무한정 늘어나지 않게) */
    limit: z.number().int().min(1).max(100).default(20),
  }),
]);
export type BindingSpec = z.infer<typeof bindingSpecSchema>;
