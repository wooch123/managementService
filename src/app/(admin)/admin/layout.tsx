import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { getPageTree } from '@/lib/db/page-tree';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, pages, session] = await Promise.all([
    cookies(),
    getPageTree(),
    getSession(),
  ]);
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar pages={pages} mode="admin" username={session.username} />
      <SidebarInset className="min-h-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
