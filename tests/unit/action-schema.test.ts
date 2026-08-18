import { describe, it, expect } from 'vitest';
import { actionConfigSchema, defaultConfigFor, ACTION_KINDS } from '@/lib/actions/schema';

describe('actionConfigSchema — §9.1 10종 kind', () => {
  it('defaultConfigFor는 10종 전부에 대해 스키마를 통과하는 기본값을 만든다', () => {
    for (const kind of ACTION_KINDS) {
      const config = defaultConfigFor(kind);
      expect(actionConfigSchema.safeParse(config).success).toBe(true);
    }
  });

  it('COMPOSITE 3스텝 구성이 유효하다', () => {
    const config = { kind: 'COMPOSITE', steps: ['a1', 'a2', 'a3'], stopOnError: true };
    const parsed = actionConfigSchema.safeParse(config);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === 'COMPOSITE') {
      expect(parsed.data.steps).toEqual(['a1', 'a2', 'a3']);
    }
  });

  it('알 수 없는 kind는 거부된다', () => {
    expect(actionConfigSchema.safeParse({ kind: 'HACK', foo: 'bar' }).success).toBe(false);
  });

  it('CREATE는 fieldMap의 ValueSource도 함께 검증한다', () => {
    const valid = actionConfigSchema.safeParse({
      kind: 'CREATE',
      entityId: 'e1',
      fieldMap: { f1: { from: 'literal', value: 1 }, f2: { from: 'component', nodeId: 'n1' } },
    });
    expect(valid.success).toBe(true);

    const invalid = actionConfigSchema.safeParse({
      kind: 'CREATE',
      entityId: 'e1',
      fieldMap: { f1: { from: 'component' } }, // nodeId 누락
    });
    expect(invalid.success).toBe(false);
  });
});
