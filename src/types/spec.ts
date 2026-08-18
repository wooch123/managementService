import { z } from 'zod';
import { bindingSpecSchema } from '@/types/binding';
import { regionSchema } from '@/types/node';
import { dataTypeSchema } from '@/types/entity';
import { refTypeSchema, relationKindSchema } from '@/types/graph';
import { actionConfigSchema } from '@/lib/actions/schema';

/**
 * §2.4 리비전 스냅샷 형태 — 배포 시점의 설계 전체를 직렬화한 불변 JSON이며, 운영 모드(`/home`)가
 * 읽는 유일한 소스다. zod 스키마가 단일 진실 공급원이고(CLAUDE.md §4.1), `Revision.specJson`은
 * 이 스키마로 파싱된 결과만 저장한다 — §2.3 배포 트랜잭션 1단계("zod 파싱, 구조 무효 시 즉시
 * 중단")가 바로 이 스키마를 기준으로 한다.
 */

export const gridSpecSchema = z.object({
  col: z.number().int(),
  span: z.number().int(),
  row: z.number().int(),
  rowSpan: z.number().int(),
});
export type GridSpec = z.infer<typeof gridSpecSchema>;

export const componentNodeSpecSchema = z.object({
  id: z.string(),
  type: z.string(),
  parentNodeId: z.string().nullable(),
  order: z.number().int(),
  // region은 우측 패널 기능(P9)에서 추가됐다 — 그 이전 리비전의 specJson에는 이 키가 없으므로
  // 기본값을 둬야 과거 리비전으로 롤백할 때 파싱이 깨지지 않는다.
  region: regionSchema.default('main'),
  grid: gridSpecSchema,
  props: z.record(z.string(), z.unknown()),
  binding: bindingSpecSchema.nullable(),
  events: z.record(z.string(), z.string()),
  label: z.string().nullable(),
});
export type ComponentNodeSpec = z.infer<typeof componentNodeSpecSchema>;

export const pageSpecSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  parentId: z.string().nullable(),
  order: z.number().int(),
  isVisible: z.boolean(),
  isHome: z.boolean(),
  // 이 필드가 없는 과거 리비전도 그대로 파싱되도록 기본값을 둔다(= 패널 표시).
  asideVisible: z.boolean().default(true),
  layout: z.object({ cols: z.literal(12), rowHeight: z.number().int(), gap: z.number().int() }),
  nodes: z.array(componentNodeSpecSchema),
});
export type PageSpec = z.infer<typeof pageSpecSchema>;

export const fieldSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  columnName: z.string(),
  dataType: dataTypeSchema,
  isRequired: z.boolean(),
  isUnique: z.boolean(),
  isPrimary: z.boolean(),
  defaultVal: z.string().nullable(),
  enumValues: z.array(z.string()).nullable(),
  refEntityId: z.string().nullable(),
  order: z.number().int(),
});
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

export const entitySpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  tableName: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  fields: z.array(fieldSpecSchema),
});
export type EntitySpec = z.infer<typeof entitySpecSchema>;

export const actionSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: actionConfigSchema,
  description: z.string().nullable(),
});
export type ActionSpec = z.infer<typeof actionSpecSchema>;

export const relationSpecSchema = z.object({
  id: z.string(),
  fromType: refTypeSchema,
  fromId: z.string(),
  toType: refTypeSchema,
  toId: z.string(),
  kind: relationKindSchema,
  cardinality: z.string().nullable(),
  labelText: z.string().nullable(),
});
export type RelationSpec = z.infer<typeof relationSpecSchema>;

export const publishedSpecSchema = z.object({
  specVersion: z.literal(1),
  revisionNo: z.number().int(),
  publishedAt: z.string(),
  pages: z.array(pageSpecSchema),
  entities: z.array(entitySpecSchema),
  actions: z.array(actionSpecSchema),
  relations: z.array(relationSpecSchema),
  theme: z.object({ radius: z.number(), baseColor: z.string() }),
});
export type PublishedSpec = z.infer<typeof publishedSpecSchema>;
