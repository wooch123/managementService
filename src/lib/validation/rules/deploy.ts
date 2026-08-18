import { issue } from '@/lib/validation/helpers';
import { actionConfigSchema } from '@/lib/actions/schema';
import { DATA_TYPES } from '@/types/entity';
import type { ValidationRule } from '@/lib/validation/types';

const RELATION_KINDS = new Set(['CONTAINS', 'READS', 'WRITES', 'TRIGGERS', 'NAVIGATES', 'REFERENCES']);

export const depDestructiveUnconfirmed: ValidationRule = {
  code: 'E-DEP-001',
  run: (_spec, ctx) =>
    ctx.deploy.pendingDestructiveChanges
      .filter((c) => !ctx.deploy.acceptedDestructiveIds.has(c.id))
      .map((c) => issue('E-DEP-001', 'error', 'deploy', `파괴적 변경이 확인되지 않았습니다: ${c.description}`, { type: 'GLOBAL', id: 'global' }, false)),
};

export const depMigrationDryRunFailed: ValidationRule = {
  code: 'E-DEP-002',
  run: (_spec, ctx) =>
    ctx.deploy.migrationDryRunError
      ? [issue('E-DEP-002', 'error', 'deploy', `마이그레이션 드라이런 실패: ${ctx.deploy.migrationDryRunError}`, { type: 'GLOBAL', id: 'global' }, false)]
      : [],
};

/** 카탈로그(zod propsSchema)까지는 검사할 수 없다(Route Handler에서 catalog.ts를 import할 수
 * 없는 구조적 제약, P3 기록 참고) — dataType/액션 config/관계 kind 등 순수 서버 컨텍스트에서
 * 재검증 가능한 부분만 zod로 다시 파싱해 "드래프트 스펙이 파싱 실패"를 판단한다. */
export const depSpecParseFailed: ValidationRule = {
  code: 'E-DEP-003',
  run: (spec) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (!DATA_TYPES.includes(f.dataType as (typeof DATA_TYPES)[number])) {
          issues.push(issue('E-DEP-003', 'error', 'deploy', `알 수 없는 dataType입니다: ${f.dataType}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    for (const a of spec.actions) {
      if (!actionConfigSchema.safeParse(a.config).success) {
        issues.push(issue('E-DEP-003', 'error', 'deploy', `액션 설정이 스키마에 맞지 않습니다: ${a.name}`, { type: 'ACTION', id: a.id }, false));
      }
    }
    for (const r of spec.relations) {
      if (!RELATION_KINDS.has(r.kind)) {
        issues.push(issue('E-DEP-003', 'error', 'deploy', `알 수 없는 연결 종류입니다: ${r.kind}`, { type: 'RELATION', id: r.id }, false));
      }
    }
    return issues;
  },
};

export const depDeletedPagesSincePublish: ValidationRule = {
  code: 'W-DEP-004',
  run: (spec, ctx) => {
    if (!ctx.deploy.previousRevisionPageSlugs) return [];
    const currentSlugs = new Set(spec.pages.map((p) => p.slug));
    return ctx.deploy.previousRevisionPageSlugs
      .filter((slug) => !currentSlugs.has(slug))
      .map((slug) => issue('W-DEP-004', 'warning', 'deploy', `이전 리비전에 있던 페이지가 삭제됩니다: ${slug}`, { type: 'GLOBAL', id: 'global' }, false));
  },
};

export const depNoChanges: ValidationRule = {
  code: 'I-DEP-005',
  run: (_spec, ctx) =>
    ctx.deploy.hasChangesSincePublish ? [] : [issue('I-DEP-005', 'info', 'deploy', '변경 사항이 없습니다.', { type: 'GLOBAL', id: 'global' }, false)],
};

export const deployRules: ValidationRule[] = [
  depDestructiveUnconfirmed,
  depMigrationDryRunFailed,
  depSpecParseFailed,
  depDeletedPagesSincePublish,
  depNoChanges,
];
