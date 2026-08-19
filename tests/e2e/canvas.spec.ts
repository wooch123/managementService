import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login?next=%2Fadmin%2Fbuilder');
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/admin\/builder/);
}

/**
 * 이 스펙은 운영 중인 설계 데이터를 절대 건드리지 않는다 — 테스트마다 임시 페이지를 API로
 * 만들고 끝나면 지운다. (예전에는 특정 페이지 id를 하드코딩하고 그 페이지의 노드를 전부
 * 삭제했는데, 실제 서비스 구성이 들어오면 그대로 지워버리는 위험한 테스트가 된다.)
 */
async function createTempPage(page: Page, title: string): Promise<{ id: string }> {
  const res = await page.request.post('/api/admin/pages', { data: { title } });
  const json = await res.json();
  expect(json.ok).toBe(true);
  return json.data as { id: string };
}

async function addNode(page: Page, pageId: string, type: string, grid: { col: number; span: number; row: number; rowSpan: number }) {
  const res = await page.request.post('/api/admin/nodes', { data: { pageId, type, grid } });
  const json = await res.json();
  expect(json.ok).toBe(true);
  return json.data as { id: string };
}

type Grid = { col: number; span: number; row: number; rowSpan: number };

/** 캔버스 1행의 실제 화면 높이 = 행 높이(8px) + 행 간격(16px). 운영 화면과 같은 값을 쓴다. */
const ROW_PITCH_PX = 8 + 16;

async function gridOf(page: Page, pageId: string, nodeId: string): Promise<Grid> {
  const res = await page.request.get(`/api/admin/pages/${pageId}/nodes`);
  const json = await res.json();
  const node = (json.data as { id: string; grid: Grid }[]).find((n) => n.id === nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  return node.grid;
}

/** 컴포넌트 본문 아무 곳이나 잡아 dx, dy만큼 끈다(별도 핸들 없이 전체가 드래그 영역이다). */
async function dragNodeBy(page: Page, nodeId: string, dx: number, dy: number) {
  const el = page.locator(`[data-node-id="${nodeId}"]`);
  const box = await el.boundingBox();
  if (!box) throw new Error('컴포넌트를 찾을 수 없습니다');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 8 });
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('컴포넌트 카탈로그 + 캔버스 빌더 (SPEC.md §8.1.3, P3)', () => {
  test('빈 페이지에 팔레트에서 card를 끌어다 놓으면 노드가 생성된다', async ({ page }) => {
    await login(page);
    const temp = await createTempPage(page, 'E2E 임시 페이지(팔레트 드롭)');
    await page.goto(`/admin/builder?pageId=${temp.id}`);
    await expect(page.getByText('빈 페이지입니다')).toBeVisible();

    // 정확히 '카드'인 항목을 집는다 — 부분 일치로 찾으면 '문서 카드'·'입력 폼 카드'처럼
    // 이름에 '카드'가 든 다른 컴포넌트가 먼저 잡혀 엉뚱한 타입이 놓인다.
    const cardHandle = page
      .getByText('카드', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"cursor-grab")]')
      .first();
    const canvasDropTarget = page.locator('[style*="grid-template-columns"]').first();

    const cardBox = await cardHandle.boundingBox();
    const canvasBox = await canvasDropTarget.boundingBox();
    if (!cardBox || !canvasBox) throw new Error('drag source/target not found');

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + 20, cardBox.y - 10, { steps: 5 });
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByText('빈 페이지입니다')).toHaveCount(0, { timeout: 3000 });

    const res = await page.request.get(`/api/admin/pages/${temp.id}/nodes`);
    const json = await res.json();
    expect(json.data.some((n: { type: string }) => n.type === 'card')).toBe(true);

    await page.request.delete(`/api/admin/pages/${temp.id}?childStrategy=cascade`);
  });

  test('이미 배치된 컴포넌트를 드래그하면 실제로 이동한다', async ({ page }) => {
    await login(page);
    const temp = await createTempPage(page, 'E2E 임시 페이지(재배치)');
    const target = await addNode(page, temp.id, 'card', { col: 1, span: 4, row: 1, rowSpan: 10 });
    await page.goto(`/admin/builder?pageId=${temp.id}`);
    await expect(page.locator(`[data-node-id="${target.id}"]`)).toBeVisible();

    await dragNodeBy(page, target.id, 0, 3 * ROW_PITCH_PX); // 3행 아래로
    await expect.poll(async () => (await gridOf(page, temp.id, target.id)).row, { timeout: 5000 }).toBeGreaterThan(1);

    await page.request.delete(`/api/admin/pages/${temp.id}?childStrategy=cascade`);
  });

  test('다른 컴포넌트 영역으로 끌어다 놓아도 서로 침범하지 않는다', async ({ page }) => {
    await login(page);
    const temp = await createTempPage(page, 'E2E 임시 페이지(충돌)');
    const mover = await addNode(page, temp.id, 'card', { col: 1, span: 4, row: 1, rowSpan: 10 });
    const blocker = await addNode(page, temp.id, 'alert', { col: 1, span: 12, row: 20, rowSpan: 6 });
    await page.goto(`/admin/builder?pageId=${temp.id}`);
    await expect(page.locator(`[data-node-id="${mover.id}"]`)).toBeVisible();

    // blocker(20~25행)의 한가운데를 노려서 끈다 → 겹치지 않는 자리로 밀려나야 한다
    await dragNodeBy(page, mover.id, 0, 19 * ROW_PITCH_PX);
    await expect.poll(async () => (await gridOf(page, temp.id, mover.id)).row, { timeout: 5000 }).toBeGreaterThan(1);

    const moved = await gridOf(page, temp.id, mover.id);
    const stayed = await gridOf(page, temp.id, blocker.id);
    const rowsOverlap = moved.row < stayed.row + stayed.rowSpan && stayed.row < moved.row + moved.rowSpan;
    const colsOverlap = moved.col < stayed.col + stayed.span && stayed.col < moved.col + moved.span;
    expect(rowsOverlap && colsOverlap).toBe(false);

    await page.request.delete(`/api/admin/pages/${temp.id}?childStrategy=cascade`);
  });

  test('팔레트가 §8.3의 8개 그룹 모두를 표시한다', async ({ page }) => {
    await login(page);
    for (const group of ['레이아웃', '입력', '데이터 표시', '내비게이션', '피드백/오버레이', '액션', '유틸리티', '통계 차트']) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
  });
});
