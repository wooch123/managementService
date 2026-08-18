import { z } from 'zod';
import { filterSchema } from '@/types/binding';

export const valueSourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('literal'), value: z.unknown() }),
  z.object({ from: z.literal('component'), nodeId: z.string() }),
  z.object({ from: z.literal('selection'), nodeId: z.string(), field: z.string() }),
  z.object({ from: z.literal('route'), param: z.string() }),
  z.object({ from: z.literal('now') }),
  z.object({ from: z.literal('user') }),
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
    fieldMap: fieldMapSchema,
    onSuccess: z.string().nullable().optional(),
    onError: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('DELETE'),
    entityId: z.string(),
    keySource: valueSourceSchema,
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
