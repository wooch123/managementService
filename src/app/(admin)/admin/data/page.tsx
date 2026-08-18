import { AdminHeader } from '@/components/shell/AdminHeader';
import { DataShell } from '@/components/data/DataShell';
import { getEntityList } from '@/lib/db/entities';

export default async function DataDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const [{ entityId }, entities] = await Promise.all([searchParams, getEntityList()]);

  return (
    <>
      <AdminHeader pageLabel="DB 설계" />
      <DataShell initialEntities={entities} initialSelectedId={entityId ?? null} />
    </>
  );
}
