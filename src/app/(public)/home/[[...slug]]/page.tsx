import Link from 'next/link';
import { LayoutDashboard, FileQuestion } from 'lucide-react';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { buildPublishedPageTree } from '@/lib/runtime/published-page-tree';
import { buildBreadcrumb } from '@/lib/runtime/breadcrumb';
import { resolveBindingData } from '@/lib/runtime/binding-query';
import { AppHeader } from '@/components/shell/AppHeader';
import { RuntimeRenderer } from '@/components/runtime/RuntimeRenderer';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

function NoticeScreen({ icon, title, description, actionHref, actionLabel }: { icon: React.ReactNode; title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <>
      <AppHeader breadcrumbItems={[]} />
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{icon}</EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  // §12.1 "활성 스펙 로드는 unstable_cache + revalidateTag" — 드래프트가 아니라 배포된
  // 리비전만 읽는다. 관리자가 편집 중인 미배포 변경은 여기 절대 보이면 안 된다.
  const spec = await getActiveSpec();

  if (!spec) {
    return (
      <NoticeScreen
        icon={<LayoutDashboard />}
        title="아직 배포된 구성이 없습니다"
        description="관리자 모드에서 페이지를 구성하고 배포하세요."
        actionHref="/admin"
        actionLabel="관리자 모드로 이동"
      />
    );
  }

  // slug 없음 → isHome. 매칭 실패 → 404. isVisible=false인 페이지도 직접 URL 접근은 허용한다
  // (메뉴에서만 숨기는 일반적인 CMS 관례 — §12.1은 매칭 자체를 isVisible로 제한하지 않는다).
  const activePage = slug?.length ? spec.pages.find((p) => p.slug === slug[slug.length - 1]) : spec.pages.find((p) => p.isHome);

  if (!activePage) {
    return (
      <NoticeScreen
        icon={<FileQuestion />}
        title="페이지를 찾을 수 없습니다"
        description="주소를 다시 확인하거나 홈으로 돌아가세요."
        actionHref="/home"
        actionLabel="홈으로"
      />
    );
  }

  const tree = buildPublishedPageTree(spec);
  const breadcrumbItems = buildBreadcrumb(tree, activePage.id);

  // §12.2 "바인딩 데이터는 서버에서 미리 조회해 초기 렌더에 포함" — 노드별로 병렬 조회한다.
  const bindingEntries = await Promise.all(
    activePage.nodes.map(async (n) => [n.id, await resolveBindingData(spec, n.binding, 1)] as const)
  );
  const bindingData = Object.fromEntries(bindingEntries);

  return (
    <>
      <AppHeader breadcrumbItems={breadcrumbItems} />
      <div className="flex-1 overflow-y-auto p-6">
        <RuntimeRenderer
          nodes={activePage.nodes}
          bindingData={bindingData}
          asideVisible={activePage.asideVisible}
          cols={activePage.layout.cols}
          rowHeight={activePage.layout.rowHeight}
          gap={activePage.layout.gap}
        />
      </div>
    </>
  );
}
