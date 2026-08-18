import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { buildValidationCtx } from '@/lib/validation/context';
import { runValidation } from '@/lib/validation/registry';
import { computeSpecHash } from '@/lib/validation/spec-hash';
import { applyFix, FIXABLE_CODES } from '@/lib/validation/apply-fix';
import type { ApiResult } from '@/types/auth';

const fixRequestSchema = z.object({ issueCodes: z.array(z.string()).min(1) });

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = fixRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const requestedCodes = new Set(parsed.data.issueCodes);
  const spec = await loadDraftSpec();
  const ctx = buildValidationCtx();
  const issues = runValidation(spec, ctx);

  const toFix = issues.filter((i) => i.fixable && requestedCodes.has(i.code) && FIXABLE_CODES.has(i.code));
  let fixedCount = 0;
  for (const issue of toFix) {
    await applyFix(issue);
    fixedCount++;
  }

  // 수정 반영 후 재검증해서 최신 상태를 함께 돌려준다
  const nextSpec = await loadDraftSpec();
  const nextIssues = runValidation(nextSpec, buildValidationCtx());
  const run = await prisma.validationRun.create({
    data: {
      startedAt: new Date(),
      finishedAt: new Date(),
      errorCount: nextIssues.filter((i) => i.severity === 'error').length,
      warnCount: nextIssues.filter((i) => i.severity === 'warning').length,
      resultJson: JSON.stringify(nextIssues),
      specHash: computeSpecHash(nextSpec),
    },
  });

  return NextResponse.json<ApiResult<{ fixedCount: number; run: typeof run; issues: typeof nextIssues }>>({
    ok: true,
    data: { fixedCount, run, issues: nextIssues },
  });
}
