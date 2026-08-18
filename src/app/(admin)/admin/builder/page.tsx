import { AdminHeader } from '@/components/shell/AdminHeader';
import { BuilderShell } from '@/components/builder/BuilderShell';
import { getPageTree } from '@/lib/db/page-tree';

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string; nodeId?: string }>;
}) {
  const [{ pageId, nodeId }, tree] = await Promise.all([searchParams, getPageTree()]);

  return (
    <>
      <AdminHeader pageLabel="layout 구성" />
      <BuilderShell initialTree={tree} initialSelectedId={pageId ?? null} initialSelectedNodeId={nodeId ?? null} />
    </>
  );
}
