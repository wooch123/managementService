import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getPageNodes } from '@/lib/db/nodes';
import { PreviewRuntime } from '@/components/runtime/PreviewRuntime';

export const metadata = { title: '미리보기' };

export const dynamic = 'force-dynamic';

export default async function AdminPagePreview({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) notFound();

  const nodes = await getPageNodes(pageId);

  return (
    <div className="min-h-svh bg-background p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-4 flex items-center gap-2 border-b pb-2">
          <span className="text-lg font-medium">{page.title}</span>
          <span className="text-xs text-muted-foreground">미리보기 — 편집 UI 없이 렌더링됩니다</span>
        </div>
        <PreviewRuntime pageId={pageId} initialNodes={nodes} rowHeight={page.rowHeight} gap={page.gap} asideVisible={page.asideVisible} />
      </div>
    </div>
  );
}
