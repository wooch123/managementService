import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { computeDeploySchemaDiff, toDestructiveDescriptor } from '@/lib/deploy/migrate';
import { computeDeployPreview } from '@/lib/deploy/preview-diff';
import type { PublishedSpec } from '@/types/spec';
import type { ApiResult } from '@/types/auth';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const [draft, lastRevision] = await Promise.all([
    loadDraftSpec(),
    prisma.revision.findFirst({ orderBy: { revisionNo: 'desc' } }),
  ]);
  const lastSpec = lastRevision ? (JSON.parse(lastRevision.specJson) as PublishedSpec) : null;
  const schemaChanges = computeDeploySchemaDiff(draft.entities);
  const preview = computeDeployPreview(draft, schemaChanges, lastSpec);
  const destructiveDescriptors = schemaChanges.filter((c) => c.risk === 'destructive').map(toDestructiveDescriptor);

  return NextResponse.json<ApiResult<typeof preview & { destructiveDescriptors: typeof destructiveDescriptors }>>({
    ok: true,
    data: { ...preview, destructiveDescriptors },
  });
}
