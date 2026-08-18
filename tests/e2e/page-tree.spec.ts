import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login?next=%2Fadmin%2Fbuilder');
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/admin\/builder/);
}

/** 운영 중인 설계 데이터에 의존하지 않도록, 각 테스트가 쓸 페이지를 API로 직접 만들고 지운다. */
async function createTempPage(page: Page, title: string, slug?: string): Promise<{ id: string; slug: string }> {
  const res = await page.request.post('/api/admin/pages', { data: { title, ...(slug ? { slug } : {}) } });
  const json = await res.json();
  expect(json.ok).toBe(true);
  return json.data as { id: string; slug: string };
}

test.describe('페이지 관리 (SPEC.md §8.1.1, P2)', () => {
  test('생성 → 드래그로 부모 이동 → 새로고침 후 유지', async ({ page }) => {
    await login(page);

    const beforeRes = await page.request.get('/api/admin/pages');
    const before = (await beforeRes.json()).data as { id: string; title: string; children: { id: string }[] }[];
    // 페이지 트리는 2단이므로 "루트 수"가 아니라 "전체 노드 수"로 세야 아래 비교와 기준이 맞는다
    // (평평한 구성에서만 우연히 같았다 — 자식이 있는 실제 구성에서는 매번 어긋난다).
    const beforeCount = before.reduce((sum, p) => sum + 1 + (p.children?.length ?? 0), 0);
    const beforeNewPageCount = await page.getByRole('button', { name: '새 페이지' }).count();

    const addButton = page.getByRole('button', { name: '페이지 추가' });
    await addButton.click();
    await addButton.click();
    await expect(page.getByRole('button', { name: '새 페이지' })).toHaveCount(beforeNewPageCount + 2);

    const handles = page.locator('[aria-label="드래그 핸들"]');
    const count = await handles.count();
    const sourceBox = await handles.nth(count - 1).boundingBox();
    const targetBox = await handles.nth(count - 2).boundingBox();
    if (!sourceBox || !targetBox) throw new Error('드래그 핸들을 찾을 수 없습니다');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 20, sourceBox.y - 5, { steps: 5 });
    await page.mouse.move(targetBox.x + 40, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await page.reload();
    const afterRes = await page.request.get('/api/admin/pages');
    const after = (await afterRes.json()).data as { id: string; title: string; children: { id: string; title: string }[] }[];
    const totalNodes = after.reduce((sum, p) => sum + 1 + p.children.length, 0);

    expect(totalNodes).toBe(beforeCount + 2);

    // 정리: 이 테스트가 만든 "새 페이지" 항목을 삭제해 반복 실행 시 데이터가 누적되지 않게 한다.
    // 드래그로 한쪽이 다른 쪽의 자식이 됐을 수 있으므로 childStrategy를 반드시 지정한다 —
    // 자식이 있는 페이지를 전략 없이 DELETE하면 API가 거부해서 정리가 조용히 실패한다
    // (실제로 '새 페이지' 하나가 드래프트에 남았다).
    const created = after.flatMap((p) => [p, ...p.children]).filter((p) => p.title === '새 페이지');
    for (const p of created) {
      await page.request.delete(`/api/admin/pages/${p.id}?childStrategy=cascade`);
    }
  });

  test('slug 중복 입력 시 저장 차단', async ({ page }) => {
    await login(page);
    const taken = await createTempPage(page, 'E2E slug 선점', 'e2e-slug-taken');
    const target = await createTempPage(page, 'E2E slug 대상', 'e2e-slug-target');
    await page.reload();

    await page.getByRole('button', { name: 'E2E slug 대상' }).click();
    await page.getByLabel('slug').fill(taken.slug);
    await expect(page.getByText('이미 사용 중인 slug입니다')).toBeVisible();

    const res = await page.request.get('/api/admin/pages');
    const json = await res.json();
    const stored = json.data.find((p: { id: string }) => p.id === target.id);
    expect(stored.slug).not.toBe(taken.slug);

    for (const id of [taken.id, target.id]) await page.request.delete(`/api/admin/pages/${id}`);
  });

  test('아이콘 피커에서 검색 → 선택 시 즉시 반영', async ({ page }) => {
    await login(page);
    const temp = await createTempPage(page, 'E2E 아이콘 테스트');
    await page.reload();
    await page.getByRole('button', { name: 'E2E 아이콘 테스트' }).first().click();
    await page.locator('[data-slot="dialog-trigger"]').click();

    await page.getByPlaceholder('아이콘 이름 검색').fill('bug');
    await page.getByRole('button', { name: /^bug$/ }).first().click();

    await expect(page.locator('[data-slot="dialog-trigger"]')).toContainText('bug');

    await page.request.delete(`/api/admin/pages/${temp.id}`);
  });
});
