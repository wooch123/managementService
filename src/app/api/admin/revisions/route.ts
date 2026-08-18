import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const [revisions, deployment] = await Promise.all([
    prisma.revision.findMany({
      orderBy: { revisionNo: 'desc' },
      select: { id: true, revisionNo: true, note: true, publishedAt: true, publishedBy: true, specJson: true },
    }),
    prisma.deployment.findUnique({ where: { id: 'singleton' } }),
  ]);

  const data = revisions.map((r) => ({ ...r, isActive: r.id === deployment?.activeRevisionId }));
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
