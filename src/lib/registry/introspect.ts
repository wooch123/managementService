import { z } from 'zod';

export type FieldDescriptor =
  | { kind: 'string'; special: 'icon' | 'color' | null }
  | { kind: 'enum'; options: string[] }
  | { kind: 'number'; min: number | null; max: number | null }
  | { kind: 'boolean' }
  | { kind: 'string[]' }
  | { kind: 'object[]'; itemShape: Record<string, FieldDescriptor> }
  | { kind: 'unknown' };

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodDefault) return unwrap(schema.removeDefault() as z.ZodTypeAny);
  if (schema instanceof z.ZodOptional) return unwrap(schema.unwrap() as z.ZodTypeAny);
  if (schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as z.ZodTypeAny);
  return schema;
}

function isColorField(name: string): boolean {
  return /color$/i.test(name);
}

export function describeField(name: string, schema: z.ZodTypeAny): FieldDescriptor {
  const inner = unwrap(schema);

  if (inner instanceof z.ZodEnum) {
    return { kind: 'enum', options: inner.options.map(String) };
  }
  if (inner instanceof z.ZodString) {
    if (name === 'icon') return { kind: 'string', special: 'icon' };
    if (isColorField(name)) return { kind: 'string', special: 'color' };
    return { kind: 'string', special: null };
  }
  if (inner instanceof z.ZodNumber) {
    return { kind: 'number', min: inner.minValue, max: inner.maxValue };
  }
  if (inner instanceof z.ZodBoolean) {
    return { kind: 'boolean' };
  }
  if (inner instanceof z.ZodArray) {
    const element = unwrap(inner.element as z.ZodTypeAny);
    if (element instanceof z.ZodString) {
      return { kind: 'string[]' };
    }
    if (element instanceof z.ZodObject) {
      const itemShape: Record<string, FieldDescriptor> = {};
      for (const [key, fieldSchema] of Object.entries(element.shape)) {
        itemShape[key] = describeField(key, fieldSchema as z.ZodTypeAny);
      }
      return { kind: 'object[]', itemShape };
    }
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

export function describeSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, FieldDescriptor> {
  const out: Record<string, FieldDescriptor> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    out[key] = describeField(key, fieldSchema as z.ZodTypeAny);
  }
  return out;
}
