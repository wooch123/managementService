import { z } from 'zod';

export const filterOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'isNull', 'isNotNull']);
export type FilterOp = z.infer<typeof filterOpSchema>;

export const filterSchema = z.object({
  fieldId: z.string(),
  /**
   * 같은 값을 **여러 컬럼 중 하나라도** 만족하면 되는 조건(OR). 통합 검색이 이것 없이는 성립하지
   * 않는다 — 청사진의 검색칸은 "FAR No, 고객사, 모델"을 한 번에 찾는데, 조건을 컬럼마다 따로 걸면
   * AND로 묶여 아무것도 안 나온다. 비어 있으면 `fieldId` 하나만 본다(지금까지의 동작).
   *
   * 컬럼 이름은 여기 적힌 fieldId를 설계에서 찾아서만 나온다 — 주소로 들어온 값이 컬럼을 고르지 못한다.
   */
  fieldIds: z.array(z.string()).optional(),
  op: filterOpSchema,
  source: z.enum(['fixed', 'query', 'component']),
  value: z.unknown().optional(),
  ref: z.string().optional(),
  /**
   * 주소에 값이 없을 때 어떻게 할지.
   *
   * - `ignore`(기본) — 조건을 빼고 전부 보여준다. 기간·상태 필터처럼 "고르지 않았으면 제한 없음"이
   *   맞는 경우다.
   * - `empty` — 아무것도 보여주지 않는다. **선택 상세**가 이쪽이다: 아직 아무 행도 고르지 않았는데
   *   조건을 빼면 표의 첫 행이 나와, 고르지도 않은 항목이 선택된 것처럼 보인다.
   */
  whenMissing: z.enum(['ignore', 'empty']).optional(),
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
    /**
     * 켜면 **직전 같은 길이의 기간**과 함께 조회해 증감을 함께 돌려준다(최근 3개월이면 그 앞 3개월).
     *
     * WHY: 숫자 하나만 크게 띄우면 "419건"이 많은 건지 적은 건지 알 수 없다 — 상태나 추세가 없어
     * 단순 집계값으로만 읽힌다(디자인 리뷰 ③). 기간 필터가 준 `from`/`to`를 앞으로 민 값으로
     * 한 번 더 세어 비교한다. 기간 한쪽이 열려 있으면 견줄 대상이 없어 비교하지 않는다.
     */
    compare: z.boolean().default(false),
    /**
     * 같은 표를 **다른 조건으로 한 번 더** 세어 보조 수치로 함께 돌려준다.
     *
     * 청사진의 지표 타일은 큰 숫자 하나 밑에 늘 한 줄이 더 있다 — "216건 / 지연 위험 38건",
     * "1,329건 / 반입 지연 41건". 그 한 줄이 "지금 무엇을 봐야 하는가"를 말한다. 노드 하나에
     * 바인딩은 하나뿐이라, 두 번째 수치는 이렇게 같은 바인딩 안에서 조건만 달리해 얻는다.
     */
    secondaryFilters: z.array(filterSchema).optional(),
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
    /**
     * 분류 축이 날짜/일시 필드일 때 묶는 단위. 'none'이면 값을 그대로 분류로 쓴다(기존 동작).
     *
     * WHY: 추이 차트를 "미리 월/주별로 집계해 둔 표"에 물려 두면 그 표가 담고 있는 구간(예: 최근
     * 12개월)만 볼 수 있어 조회 기간을 바꿔도 따라오지 못한다. 원본 테이블의 날짜 컬럼을 여기서
     * 묶으면 어떤 기간을 골라도 그 기간의 추이가 그대로 나온다.
     */
    groupTransform: z.enum(['none', 'month', 'week', 'year']).default('none'),
    /**
     * 두 번째 분류 축 — 누적 막대의 층, 교차 히트맵의 열이 된다.
     *
     * WHY: "고객사별 접수"까지는 축이 하나로 되지만 "고객사별 접수를 불량 대분류로 쌓아 보기",
     * "불량 대분류 × NAND"는 축이 둘이다. 이걸 화면에서 원시 행을 받아 세는 방식으로 만들면
     * pageSize만큼의 표본만 반영돼 수치가 틀린다(위 group 모드를 만든 것과 같은 이유).
     * 비워 두면 지금까지처럼 축 하나짜리 결과가 나온다.
     */
    seriesFieldId: z.string().optional(),
    fn: z.enum(['count', 'sum', 'avg']).default('count'),
    /** sum/avg 대상 숫자 필드 (count면 필요 없음) */
    valueFieldId: z.string().optional(),
    filters: z.array(filterSchema).default([]),
    /** 값 큰 순서 또는 분류 이름 순서 */
    orderBy: z.enum(['value', 'label']).default('value'),
    /** 그릴 항목 수 상한(막대가 무한정 늘어나지 않게). 날짜 버킷 시계열은 구간이 길어질 수 있어 상한을 넉넉히 둔다. */
    limit: z.number().int().min(1).max(200).default(20),
  }),
]);
export type BindingSpec = z.infer<typeof bindingSpecSchema>;
