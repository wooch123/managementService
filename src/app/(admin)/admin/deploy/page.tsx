import { AdminHeader } from '@/components/shell/AdminHeader';
import { DeployShell } from '@/components/deploy/DeployShell';
import { prisma } from '@/lib/db/prisma';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { computeSpecHash } from '@/lib/validation/spec-hash';
import { computeDeploySchemaDiff, toDestructiveDescriptor } from '@/lib/deploy/migrate';
import { computeDeployPreview } from '@/lib/deploy/preview-diff';
import type { PublishedSpec } from '@/types/spec';

export default async function DeployPage() {
  const [latestRun, draft, revisions, deployment] = await Promise.all([
    prisma.validationRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    loadDraftSpec(),
    prisma.revision.findMany({
      orderBy: { revisionNo: 'desc' },
      select: { id: true, revisionNo: true, note: true, publishedAt: true, publishedBy: true, specJson: true },
    }),
    prisma.deployment.findUnique({ where: { id: 'singleton' } }),
  ]);

  // AdminHeader의 스텝퍼 ④ 활성화 조건(§8.0)과 동일한 기준 — 검증이 최신 상태로 통과했고
  // 드래프트에 내용이 있어야 배포 화면 자체를 정상적으로 쓸 수 있다.
  const currentHash = computeSpecHash(draft);
  const stale = !latestRun || latestRun.specHash !== currentHash;
  const hasDraftContent = draft.pages.length > 0;
  const canDeploy = !stale && !!latestRun && latestRun.errorCount === 0 && hasDraftContent;
  const blockReason = !hasDraftContent
    ? '아직 만들어진 페이지가 없습니다.'
    : stale || !latestRun
      ? '③ 구성 검증을 먼저 실행하세요.'
      : latestRun.errorCount > 0
        ? `검증 오류 ${latestRun.errorCount}건을 먼저 해결하세요.`
        : null;

  const lastRevision = revisions[0] ?? null;
  const lastSpec = lastRevision ? (JSON.parse(lastRevision.specJson) as PublishedSpec) : null;
  const schemaChanges = computeDeploySchemaDiff(draft.entities);
  const preview = computeDeployPreview(draft, schemaChanges, lastSpec);
  const destructiveDescriptors = schemaChanges.filter((c) => c.risk === 'destructive').map(toDestructiveDescriptor);

  const revisionList = revisions.map((r) => ({
    id: r.id,
    revisionNo: r.revisionNo,
    note: r.note,
    publishedAt: r.publishedAt.toISOString(),
    publishedBy: r.publishedBy,
    specJson: r.specJson,
    isActive: r.id === deployment?.activeRevisionId,
  }));

  return (
    <>
      <AdminHeader pageLabel="수정본 배포" />
      <DeployShell
        canDeploy={canDeploy}
        blockReason={blockReason}
        preview={{ ...preview, destructiveDescriptors }}
        initialRevisions={revisionList}
      />
    </>
  );
}
