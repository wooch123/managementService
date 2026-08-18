import { test, expect } from '@playwright/test';

test.describe('인증 (SPEC.md §7)', () => {
  test('미로그인 상태로 /admin/builder 접근 시 /login으로 리다이렉트', async ({ page }) => {
    await page.goto('/admin/builder');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbuilder/);
  });

  test('오답 로그인 시 destructive alert 표시', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(
      page.getByText('아이디 또는 비밀번호가 올바르지 않습니다.')
    ).toBeVisible();
  });

  test('로그인 → 관리자 진입 → 로그아웃 시나리오', async ({ page }) => {
    await page.goto('/login?next=%2Fadmin%2Fbuilder');
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('123456');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page).toHaveURL(/\/admin\/builder/);
    await expect(page.getByText('layout 구성').first()).toBeVisible();

    const userMenuTrigger = page.getByRole('button', { name: /admin/ });
    await userMenuTrigger.click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();

    // 로그아웃은 fetch → router.push('/login') → router.refresh() 순서로 동작한다. dev 서버는
    // 이 클라이언트 내비게이션에 필요한 RSC 페이로드를 그 자리에서 컴파일하느라 수십 초가
    // 걸리기도 해서(프로덕션 빌드에서는 즉시 이동한다) 이 단언에만 여유를 준다.
    await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });

    await page.goto('/admin/builder');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbuilder/);
  });
});
