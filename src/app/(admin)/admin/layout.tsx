import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { getAppSettings } from '@/lib/db/app-settings';
import { getPageTree } from '@/lib/db/page-tree';

/** 탭 제목을 사이드바 헤더와 같은 이름으로 — "사이트 이름 - 지금 보는 화면"((public)/layout.tsx 참고). */
export async function generateMetadata(): Promise<Metadata> {
  const { siteTitle } = await getAppSettings();
  return { title: { template: `${siteTitle} - %s`, default: `${siteTitle} - 관리자` } };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 누구로 로그인했는지는 헤더(AdminHeader)가 직접 읽는다 — 사용자 메뉴가 그쪽으로 옮겨 갔다.
  const [cookieStore, pages, settings] = await Promise.all([cookies(), getPageTree(), getAppSettings()]);
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar
        pages={pages}
        mode="admin"
        siteTitle={settings.siteTitle}
        siteSubtitle={settings.siteSubtitle}
      />
      {/* min-w-0: 안쪽 내용이 넓어도 본문이 사이드바를 밀어내며 창 밖으로 나가지 않게 한다
          (flex 자식의 기본 min-width는 auto라 최소 내용 폭만큼 벌어진다). */}
      <SidebarInset className="min-h-0 min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
