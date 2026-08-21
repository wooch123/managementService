import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/shell/LoginForm';
import { getAppSettings } from '@/lib/db/app-settings';

/** 로그인 화면에는 사이드바가 없지만 탭 제목은 같은 이름을 쓴다 — 로그인 전후로 이름이 달라
 * 보이면 다른 사이트에 온 것처럼 읽힌다. */
export async function generateMetadata(): Promise<Metadata> {
  const { siteTitle } = await getAppSettings();
  // absolute: 루트 레이아웃의 템플릿("WebApp_V1 - %s")을 건너뛴다 — 그대로 두면 이름이
  // 두 번 붙어 "WebApp_V1 - eStorage Task - 로그인"이 된다. 이 화면은 사이드바가 없어
  // 영역 레이아웃의 템플릿을 받지 못하므로 제목을 통째로 만든다.
  return { title: { absolute: `${siteTitle} - 로그인` } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && /^\/admin(\/|$)/.test(next) ? next : '/admin/builder';

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-xl">관리자 로그인</CardTitle>
          <CardDescription>업무 화면 빌더에 접근하려면 로그인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={redirectTo} />
        </CardContent>
      </Card>
    </div>
  );
}
