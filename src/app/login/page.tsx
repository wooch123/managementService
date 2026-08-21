import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/shell/LoginForm';

export const metadata = { title: '로그인' };

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
