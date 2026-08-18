import type { ValidationIssue, ValidationSeverity, ValidationCategory, ValidationTargetType, DraftSpec } from '@/lib/validation/types';

export function issue(
  code: string,
  severity: ValidationSeverity,
  category: ValidationCategory,
  message: string,
  target: { type: ValidationTargetType; id: string },
  fixable: boolean
): ValidationIssue {
  return { code, severity, category, message, target, fixable };
}

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]*$/;
export function isValidSlug(slug: string): boolean {
  return SLUG_FORMAT.test(slug);
}

/** §8.5 "검사한 항목 수" 통계 카드 — 이번 검증이 훑은 드래프트 스펙 항목(페이지/컴포넌트/
 * 엔티티/필드/액션/관계) 총 개수. 규칙 개수(51개)나 이슈 개수와는 다른, 검사 대상의 규모다. */
export function countSpecItems(spec: DraftSpec): number {
  return (
    spec.pages.length +
    spec.nodes.length +
    spec.entities.length +
    spec.entities.reduce((sum, e) => sum + e.fields.length, 0) +
    spec.actions.length +
    spec.relations.length
  );
}
