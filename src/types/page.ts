import { z } from 'zod';
import { isValidSlugFormat } from '@/lib/slugify';

const slugField = z
  .string()
  .refine(isValidSlugFormat, 'slug은 소문자/숫자/하이픈만 사용할 수 있습니다 (첫 글자는 소문자/숫자)');

export const pageCreateSchema = z.object({
  title: z.string().min(1, '제목을 입력하세요'),
  slug: slugField.optional(),
  icon: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});
export type PageCreateInput = z.infer<typeof pageCreateSchema>;

export const pageUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  slug: slugField.optional(),
  icon: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  isVisible: z.boolean().optional(),
  isHome: z.boolean().optional(),
  rowHeight: z.number().int().min(1).max(64).optional(),
  gap: z.number().int().min(0).max(64).optional(),
});
export type PageUpdateInput = z.infer<typeof pageUpdateSchema>;

export const pageReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        order: z.number().int(),
      })
    )
    .min(1),
});
export type PageReorderInput = z.infer<typeof pageReorderSchema>;

export const deleteChildStrategySchema = z.enum(['cascade', 'promote']);
export type DeleteChildStrategy = z.infer<typeof deleteChildStrategySchema>;
