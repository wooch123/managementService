import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { getAppSettings } from '@/lib/db/app-settings';
import { getPageTree } from '@/lib/db/page-tree';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, pages, session, settings] = await Promise.all([
    cookies(),
    getPageTree(),
    getSession(),
    getAppSettings(),
  ]);
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar
        pages={pages}
        mode="admin"
        username={session.username}
        siteTitle={settings.siteTitle}
        siteSubtitle={settings.siteSubtitle}
      />
      {/* min-w-0: 안쪽 내용이 넓어도 본문이 사이드바를 밀어내며 창 밖으로 나가지 않게 한다
          (flex 자식의 기본 min-width는 auto라 최소 내용 폭만큼 벌어진다). */}
      <SidebarInset className="min-h-0 min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
