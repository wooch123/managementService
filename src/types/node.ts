import { z } from 'zod';

/** 컴포넌트가 놓이는 화면 영역 — 본문 그리드와 우측 플로팅 패널은 같은 12칼럼 규칙을 공유한다. */
export const REGIONS = ['main', 'aside'] as const;
export const regionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof regionSchema>;

export const gridSchema = z.object({
  col: z.number().int().min(1).max(12),
  span: z.number().int().min(1).max(12),
  row: z.number().int().min(1),
  rowSpan: z.number().int().min(1),
});
export type GridSpec = z.infer<typeof gridSchema>;

export const nodeCreateSchema = z.object({
  pageId: z.string(),
  type: z.string(),
  parentNodeId: z.string().nullable().optional(),
  grid: gridSchema.partial().optional(),
  region: regionSchema.optional(),
});
export type NodeCreateInput = z.infer<typeof nodeCreateSchema>;

export const nodeUpdateSchema = z.object({
  parentNodeId: z.string().nullable().optional(),
  region: regionSchema.optional(),
  grid: gridSchema.partial().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  bindingJson: z.string().nullable().optional(),
  events: z.record(z.string(), z.string()).optional(),
  label: z.string().nullable().optional(),
});
export type NodeUpdateInput = z.infer<typeof nodeUpdateSchema>;

export const nodeReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        parentNodeId: z.string().nullable(),
        order: z.number().int(),
      })
    )
    .min(1),
});
export type NodeReorderInput = z.infer<typeof nodeReorderSchema>;
