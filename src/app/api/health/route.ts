import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/** 모듈이 처음 평가되는 시점(사실상 서버 프로세스 시작 직후) — pm2로 상시 실행되는 프로덕션에서는
 * 이 값이 실제 프로세스 업타임과 사실상 일치한다. §13.3 GET /api/health → {ok, revisionNo, uptime}. */
const startedAt = Date.now();

export async function GET() {
  const deployment = await prisma.deployment.findUnique({ where: { id: 'singleton' } });
  let revisionNo: number | null = null;
  if (deployment?.activeRevisionId) {
    const revision = await prisma.revision.findUnique({ where: { id: deployment.activeRevisionId }, select: { revisionNo: true } });
    revisionNo = revision?.revisionNo ?? null;
  }
  return NextResponse.json({ ok: true, revisionNo, uptime: Math.floor((Date.now() - startedAt) / 1000) });
}
