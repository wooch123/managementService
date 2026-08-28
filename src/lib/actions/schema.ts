import { z } from 'zod';
import { filterSchema } from '@/types/binding';

export const valueSourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('literal'), value: z.unknown() }),
  z.object({
    from: z.literal('component'),
    nodeId: z.string(),
    /**
     * 그 컴포넌트의 값이 **객체**일 때 꺼낼 키. 비우면 값 전체를 쓴다(지금까지의 동작).
     *
     * 입력 하나는 값 하나를 갖는다는 것이 기본이지만, 여러 칸이 함께 정해지는 값이 있다 —
     * Reball 의뢰서의 시료당 가격이 그렇다(작업 항목 · 볼 수 · 긴급 · 개수가 모두 걸린다).
     * 그런 자리는 한 컴포넌트가 관련된 칸을 함께 들고 객체 하나를 값으로 내놓고, 액션은
     * 여기서 키를 하나씩 집어 각 컬럼에 넣는다. 중첩은 지원하지 않는다(한 단계 키만).
     */
    path: z.string().optional(),
  }),
  z.object({ from: z.literal('selection'), nodeId: z.string(), field: z.string() }),
  z.object({ from: z.literal('route'), param: z.string() }),
  z.object({ from: z.literal('now') }),
  z.object({ from: z.literal('user') }),
  /**
   * 업무 번호를 서버가 만들어 준다(예: `ASG-` + 6자리).
   *
   * 청사진이 화면마다 반복해서 지적한 것이 "식별번호 수기 입력"이다 — 배정번호·리포트번호·
   * 의뢰번호를 사람이 적으면 중복과 오타가 나고, 그 번호를 만들려고 기존 목록을 먼저 뒤져야 한다
   * (REVIEW.md FA Assign·Tech Report·Reball 의뢰서·의뢰 상세). 값을 만드는 주체를 화면에서
   * 서버로 옮긴다. 같은 접두사를 쓰는 기존 값 중 가장 큰 번호 다음을 쓴다.
   */
  z.object({
    from: z.literal('sequence'),
    prefix: z.string().default(''),
    digits: z.number().int().min(3).max(10).default(6),
  }),
]);
export type ValueSource = z.infer<typeof valueSourceSchema>;

const fieldMapSchema = z.record(z.string(), valueSourceSchema);

export const ACTION_KINDS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'QUERY',
  'NAVIGATE',
  'OPEN_MODAL',
  'CLOSE_MODAL',
  'TOAST',
  'EXPORT_CSV',
  'COMPOSITE',
] as const;
export const actionKindSchema = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const actionConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('CREATE'),
    entityId: z.string(),
    sourceNodeId: z.string().optional(),
    fieldMap: fieldMapSchema,
    onSuccess: z.string().nullable().optional(),
    onError: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('UPDATE'),
    entityId: z.string(),
    keySource: valueSourceSchema,
    /**
     * 대상 행을 찾을 컬럼. 비우면 지금까지처럼 내부 id로 찾는다.
     *
     * 화면이 다루는 키는 내부 id가 아니라 업무 키(FAR No·의뢰번호)다 — 목록에서 고른 값이
     * 주소에 남고(`?sel=FAR-26-4514`), 그 값으로 바로 상태를 바꿀 수 있어야 "선택 → 다음 행동"이
     * 한 화면에서 이어진다. id를 요구하면 화면이 내부 식별자를 들고 다녀야 한다.
     */
    keyFieldId: z.string().optional(),
    fieldMap: fieldMapSchema,
    onSuccess: z.string().nullable().optional(),
    onError: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('DELETE'),
    entityId: z.string(),
    keySource: valueSourceSchema,
    /** UPDATE와 같은 뜻 — 비우면 내부 id로 찾는다. */
    keyFieldId: z.string().optional(),
    confirmText: z.string().nullable().optional(),
    onSuccess: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('QUERY'),
    entityId: z.string(),
    filters: z.array(filterSchema).default([]),
    targetNodeId: z.string(),
  }),
  z.object({
    kind: z.literal('NAVIGATE'),
    pageId: z.string(),
    params: z.record(z.string(), valueSourceSchema).optional(),
  }),
  z.object({ kind: z.literal('OPEN_MODAL'), targetNodeId: z.string() }),
  z.object({ kind: z.literal('CLOSE_MODAL'), targetNodeId: z.string() }),
  z.object({
    kind: z.literal('TOAST'),
    variant: z.enum(['default', 'success', 'destructive']),
    message: z.string(),
  }),
  z.object({
    kind: z.literal('EXPORT_CSV'),
    entityId: z.string(),
    filters: z.array(filterSchema).default([]),
    filename: z.string(),
  }),
  z.object({
    kind: z.literal('COMPOSITE'),
    steps: z.array(z.string()).default([]),
    stopOnError: z.boolean().default(true),
  }),
]);
export type ActionConfig = z.infer<typeof actionConfigSchema>;

export const runtimeActionRequestSchema = z.object({
  actionId: z.string(),
  context: z
    .object({
      componentValues: z.record(z.string(), z.unknown()).optional(),
      selectionValues: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      routeParams: z.record(z.string(), z.string()).optional(),
    })
    .default({}),
});

/** kind 변경 시 다른 kind의 config 잔재가 남지 않도록 각 kind의 빈 기본값을 제공한다. */
export function defaultConfigFor(kind: ActionKind): ActionConfig {
  switch (kind) {
    case 'CREATE':
      return { kind, entityId: '', fieldMap: {} };
    case 'UPDATE':
      return { kind, entityId: '', keySource: { from: 'literal', value: '' }, fieldMap: {} };
    case 'DELETE':
      return { kind, entityId: '', keySource: { from: 'literal', value: '' } };
    case 'QUERY':
      return { kind, entityId: '', filters: [], targetNodeId: '' };
    case 'NAVIGATE':
      return { kind, pageId: '' };
    case 'OPEN_MODAL':
      return { kind, targetNodeId: '' };
    case 'CLOSE_MODAL':
      return { kind, targetNodeId: '' };
    case 'TOAST':
      return { kind, variant: 'default', message: '' };
    case 'EXPORT_CSV':
      return { kind, entityId: '', filters: [], filename: 'export.csv' };
    case 'COMPOSITE':
      return { kind, steps: [], stopOnError: true };
  }
}
