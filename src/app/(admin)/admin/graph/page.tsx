import { AdminHeader } from '@/components/shell/AdminHeader';
import { GraphShell } from '@/components/graph/GraphShell';
import { getGraphData } from '@/lib/db/graph';

export const metadata = { title: '관계도' };

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ nodeId?: string; edgeId?: string }>;
}) {
  const [{ nodeId, edgeId }, data] = await Promise.all([searchParams, getGraphData()]);

  return (
    <>
      <AdminHeader pageLabel="관계도" />
      <GraphShell initialData={data} initialSelectedNodeId={nodeId ?? null} initialSelectedEdgeId={edgeId ?? null} />
    </>
  );
}
