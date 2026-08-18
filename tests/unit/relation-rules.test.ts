import { describe, it, expect } from 'vitest';
import { isRelationAllowed, findAllowedKind } from '@/types/graph';

describe('§8.4.3 엣지 허용 조합', () => {
  it('READS는 Component→Entity만 허용', () => {
    expect(isRelationAllowed('READS', 'COMPONENT', 'ENTITY')).toBe(true);
    expect(isRelationAllowed('READS', 'ENTITY', 'COMPONENT')).toBe(false);
    expect(isRelationAllowed('READS', 'COMPONENT', 'COMPONENT')).toBe(false);
  });

  it('WRITES는 Action→Entity만 허용', () => {
    expect(isRelationAllowed('WRITES', 'ACTION', 'ENTITY')).toBe(true);
    expect(isRelationAllowed('WRITES', 'COMPONENT', 'COMPONENT')).toBe(false);
    expect(isRelationAllowed('WRITES', 'COMPONENT', 'ENTITY')).toBe(false);
  });

  it('TRIGGERS는 Component→Action만 허용', () => {
    expect(isRelationAllowed('TRIGGERS', 'COMPONENT', 'ACTION')).toBe(true);
    expect(isRelationAllowed('TRIGGERS', 'ACTION', 'COMPONENT')).toBe(false);
  });

  it('NAVIGATES는 Action→Page, Component→Page 허용', () => {
    expect(isRelationAllowed('NAVIGATES', 'ACTION', 'PAGE')).toBe(true);
    expect(isRelationAllowed('NAVIGATES', 'COMPONENT', 'PAGE')).toBe(true);
    expect(isRelationAllowed('NAVIGATES', 'ENTITY', 'PAGE')).toBe(false);
  });

  it('findAllowedKind는 겹치는 조합이 없어 항상 0개 또는 1개만 찾는다', () => {
    expect(findAllowedKind('COMPONENT', 'ENTITY')).toBe('READS');
    expect(findAllowedKind('ACTION', 'ENTITY')).toBe('WRITES');
    expect(findAllowedKind('COMPONENT', 'ACTION')).toBe('TRIGGERS');
    expect(findAllowedKind('COMPONENT', 'PAGE')).toBe('NAVIGATES');
    expect(findAllowedKind('COMPONENT', 'COMPONENT')).toBeNull();
    expect(findAllowedKind('ENTITY', 'ENTITY')).toBeNull();
  });
});
