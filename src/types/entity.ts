import { z } from 'zod';
import { isValidIdentifierFormat, isReservedIdentifier } from '@/lib/data-engine/identifiers';

export const DATA_TYPES = [
  'TEXT',
  'INTEGER',
  'REAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'JSON',
  'ENUM',
  'REF',
] as const;
export type DataType = (typeof DATA_TYPES)[number];
export const dataTypeSchema = z.enum(DATA_TYPES);

const identifierField = z
  .string()
  .refine(isValidIdentifierFormat, '소문자로 시작하는 영문/숫자/밑줄만 사용할 수 있습니다')
  .refine((v) => !isReservedIdentifier(v), '예약어는 사용할 수 없습니다');

export const entityCreateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  tableName: identifierField.optional(),
  description: z.string().nullable().optional(),
});
export type EntityCreateInput = z.infer<typeof entityCreateSchema>;

export const entityUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  tableName: identifierField.optional(),
  description: z.string().nullable().optional(),
  order: z.number().int().optional(),
});
export type EntityUpdateInput = z.infer<typeof entityUpdateSchema>;

const fieldBaseSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  columnName: identifierField.optional(),
  dataType: dataTypeSchema,
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
  defaultVal: z.string().nullable().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
  refEntityId: z.string().nullable().optional(),
});

export const fieldCreateSchema = fieldBaseSchema.superRefine((val, ctx) => {
  if (val.dataType === 'ENUM' && (!val.enumValues || val.enumValues.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'ENUM 타입은 값 목록이 최소 1개 필요합니다' });
  }
  if (val.dataType === 'REF' && !val.refEntityId) {
    ctx.addIssue({ code: 'custom', path: ['refEntityId'], message: 'REF 타입은 대상 엔티티가 필요합니다' });
  }
});
export type FieldCreateInput = z.infer<typeof fieldBaseSchema>;

export const fieldUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  columnName: identifierField.optional(),
  dataType: dataTypeSchema.optional(),
  isRequired: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  defaultVal: z.string().nullable().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
  refEntityId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  /** 파괴적 변경(타입 변경/삭제)에는 명시적 확인이 필요하다 — §6.5 */
  confirmDestructive: z.boolean().optional(),
});
export type FieldUpdateInput = z.infer<typeof fieldUpdateSchema>;
