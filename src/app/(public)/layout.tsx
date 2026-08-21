import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { getAppSettings } from '@/lib/db/app-settings';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { buildPublishedPageTree } from '@/lib/runtime/published-page-tree';

/**
 * 브라우저 탭 제목을 **사이드바 헤더와 같은 이름**으로 맞춘다 — "사이트 이름 - 지금 보는 화면".
 *
 * 이름을 코드에 박지 않고 앱 설정(사이드바 헤더가 읽는 그 값)에서 가져온다. 그래야 관리자가
 * 사이드바에서 이름을 바꾸면 탭 제목도 함께 바뀐다 — 두 곳에 따로 적으면 반드시 어긋난다.
 * 화면 이름은 각 페이지의 `generateMetadata`가 채우고, 여기 템플릿이 앞부분을 붙인다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { siteTitle } = await getAppSettings();
  return {
    title: {
      template: `${siteTitle} - %s`,
      // 화면 이름을 주지 않는 경로(예: 404)에서는 사이트 이름만 남는다.
      default: siteTitle,
    },
  };
}

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
