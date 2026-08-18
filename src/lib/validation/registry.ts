import { structureRules } from '@/lib/validation/rules/structure';
import { dataRules } from '@/lib/validation/rules/data';
import { actionRules } from '@/lib/validation/rules/action';
import { relationRules } from '@/lib/validation/rules/relation';
import { deployRules } from '@/lib/validation/rules/deploy';
import type { DraftSpec, ValidationCtx, ValidationIssue, ValidationRule } from '@/lib/validation/types';

/** §11.6 "규칙 레지스트리가 전체를 순회하고 결과를 합친다." §11의 51개 규칙 전부. */
export const allRules: ValidationRule[] = [...structureRules, ...dataRules, ...actionRules, ...relationRules, ...deployRules];

export function runValidation(spec: DraftSpec, ctx: ValidationCtx): ValidationIssue[] {
  return allRules.flatMap((rule) => rule.run(spec, ctx));
}
