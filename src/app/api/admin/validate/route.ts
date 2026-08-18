import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { buildValidationCtx } from '@/lib/validation/context';
import { runValidation } from '@/lib/validation/registry';
import { computeSpecHash } from '@/lib/validation/spec-hash';
import { countSpecItems } from '@/lib/validation/helpers';
import type { ApiResult } from '@/types/auth';

export async function POST() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const startedAt = new Date();
  const spec = await loadDraftSpec();
  const ctx = buildValidationCtx();
  const issues = runValidation(spec, ctx);
  const specHash = computeSpecHash(spec);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;

  const run = await prisma.validationRun.create({
    data: {
      startedAt,
      finishedAt: new Date(),
      errorCount,
      warnCount,
      resultJson: JSON.stringify(issues),
      specHash,
    },
  });

  const checkedCount = countSpecItems(spec);

  return NextResponse.json<ApiResult<{ run: typeof run; issues: typeof issues; checkedCount: number }>>({
    ok: true,
    data: { run, issues, checkedCount },
  });
}

/** 스텝퍼 ③ 배지/④ 배포 버튼 활성화 조건에 쓰는 최신 검증 결과. 드래프트가 마지막 검증 이후
 * 바뀌었으면(specHash 불일치) "재검증 필요" 상태를 함께 알린다. */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const spec = await loadDraftSpec();
  const checkedCount = countSpecItems(spec);

  const latest = await prisma.validationRun.findFirst({ orderBy: { startedAt: 'desc' } });
  if (!latest) {
    return NextResponse.json<ApiResult<{ run: null; stale: boolean; checkedCount: number }>>({
      ok: true,
      data: { run: null, stale: true, checkedCount },
    });
  }

  const currentHash = computeSpecHash(spec);

  return NextResponse.json<ApiResult<{ run: typeof latest; stale: boolean; checkedCount: number }>>({
    ok: true,
    data: { run: latest, stale: currentHash !== latest.specHash, checkedCount },
  });
}
