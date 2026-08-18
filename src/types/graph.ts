import { z } from 'zod';
import { actionConfigSchema, actionKindSchema, ACTION_KINDS } from '@/lib/actions/schema';

export { actionKindSchema, ACTION_KINDS };

export const refTypeSchema = z.enum(['PAGE', 'COMPONENT', 'ENTITY', 'ACTION']);
export type RefType = z.infer<typeof refTypeSchema>;

export const relationKindSchema = z.enum(['CONTAINS', 'READS', 'WRITES', 'TRIGGERS', 'NAVIGATES', 'REFERENCES']);
export type RelationKind = z.infer<typeof relationKindSchema>;

/** 관계도에서 직접 편집 가능한 4종. CONTAINS/REFERENCES는 파생 엣지라 사용자가 만들 수 없다. */
export const editableRelationKindSchema = z.enum(['READS', 'WRITES', 'TRIGGERS', 'NAVIGATES']);

export const graphNodePositionSchema = z.object({
  refType: refTypeSchema,
  refId: z.string(),
  x: z.number(),
  y: z.number(),
});

export const graphNodesSaveSchema = z.object({
  items: z.array(graphNodePositionSchema).min(1),
  /** 페이지별 보기에서 저장할 때만 그 페이지 id를 넣는다(없으면 전체 구조 보기 좌표를 갱신). */
  viewKey: z.string().optional(),
});
export type GraphNodesSaveInput = z.infer<typeof graphNodesSaveSchema>;

export const relationCreateSchema = z
  .object({
    fromType: refTypeSchema,
    fromId: z.string(),
    toType: refTypeSchema,
    toId: z.string(),
    kind: editableRelationKindSchema,
    cardinality: z.enum(['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY']).nullable().optional(),
    labelText: z.string().nullable().optional(),
    /** kind === 'TRIGGERS'일 때만 사용 — 컴포넌트의 어느 이벤트에 연결할지 (§8.4.3 양방향 동기화) */
    eventName: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'TRIGGERS' && !val.eventName) {
      ctx.addIssue({ code: 'custom', path: ['eventName'], message: 'TRIGGERS 연결은 이벤트를 지정해야 합니다' });
    }
  });
export type RelationCreateInput = z.infer<typeof relationCreateSchema>;

export const relationUpdateSchema = z.object({
  cardinality: z.enum(['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY']).nullable().optional(),
  labelText: z.string().nullable().optional(),
});
export type RelationUpdateInput = z.infer<typeof relationUpdateSchema>;

export const actionCreateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  kind: actionKindSchema,
  description: z.string().nullable().optional(),
  config: actionConfigSchema.optional(),
});
export type ActionCreateInput = z.infer<typeof actionCreateSchema>;

export const actionUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  kind: actionKindSchema.optional(),
  description: z.string().nullable().optional(),
  config: actionConfigSchema.optional(),
});
export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

/** §8.4.3 허용 조합 표 — kind별로 (fromType, toType) 조합만 허용한다. */
export const RELATION_ALLOWED: Record<z.infer<typeof editableRelationKindSchema>, [RefType, RefType][]> = {
  READS: [['COMPONENT', 'ENTITY']],
  WRITES: [['ACTION', 'ENTITY']],
  TRIGGERS: [['COMPONENT', 'ACTION']],
  NAVIGATES: [
    ['ACTION', 'PAGE'],
    ['COMPONENT', 'PAGE'],
  ],
};

export function isRelationAllowed(kind: z.infer<typeof editableRelationKindSchema>, fromType: RefType, toType: RefType): boolean {
  return RELATION_ALLOWED[kind].some(([f, t]) => f === fromType && t === toType);
}

/** (fromType, toType) 조합에 대해 유일하게 허용되는 kind를 찾는다 — 표 안에 겹치는 조합이
 * 없어 항상 0개 또는 1개만 매치한다(§8.4.3의 "둘 이상 가능하면 kind 선택 popover" 케이스는
 * 이 표 구조상 발생하지 않는다). */
export function findAllowedKind(fromType: RefType, toType: RefType): z.infer<typeof editableRelationKindSchema> | null {
  const kinds = Object.keys(RELATION_ALLOWED) as z.infer<typeof editableRelationKindSchema>[];
  return kinds.find((k) => isRelationAllowed(k, fromType, toType)) ?? null;
}
