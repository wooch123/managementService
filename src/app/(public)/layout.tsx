import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { getAppSettings } from '@/lib/db/app-settings';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { buildPublishedPageTree } from '@/lib/runtime/published-page-tree';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, spec, settings] = await Promise.all([cookies(), getActiveSpec(), getAppSettings()]);
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  // §12.2 "사이드바 메뉴 생성(isVisible 페이지 트리)" — 드래프트가 아니라 배포된 스펙만 쓴다.
  // 아직 아무 것도 배포되지 않았으면(spec === null) 빈 메뉴로 렌더한다 — page.tsx가 그 상태를
  // 별도의 "배포된 구성이 없습니다" 안내로 처리한다.
  const pages = spec ? buildPublishedPageTree(spec, { visibleOnly: true }) : [];

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar pages={pages} mode="public" siteTitle={settings.siteTitle} siteSubtitle={settings.siteSubtitle} />
      {/* min-w-0: 안쪽 내용이 넓어도 본문이 사이드바를 밀어내며 창 밖으로 나가지 않게 한다
          (flex 자식의 기본 min-width는 auto라 최소 내용 폭만큼 벌어진다). */}
      <SidebarInset className="min-h-0 min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
