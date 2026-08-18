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
]);
export type BindingSpec = z.infer<typeof bindingSpecSchema>;
