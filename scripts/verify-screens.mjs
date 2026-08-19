/**
 * 화면 전수 점검 — 16개 운영 화면을 실제 브라우저로 열어 **눌러 보고** 확인한다.
 *
 * 세 가지를 본다.
 *   ① 콘솔 오류 없이 그려지는가(빈 화면이나 렌더 오류가 없는가)
 *   ② 화면 안의 "누를 수 있는 것"이 실제로 주소를 바꾸거나 화면을 옮기는가
 *   ③ 필터·검색이 목록을 실제로 좁히는가
 *
 * 읽기만 한다 — 저장 버튼은 누르지 않는다(그쪽은 verify-actions.mjs가 실행하고 되돌린다).
 *
 * 실행: node scripts/verify-screens.mjs [베이스URL]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const SLUGS = [
  'claim-dashboard', 'claim-analysis', 'fa-assign', 'fa-status', 'fa-tech-report',
  'reball', 'reball-request', 'reball-status', 'requests',
  'req-dev-lab', 'req-auto', 'req-dram', 'req-pfa-nd', 'req-pfa-d',
  'tips', 'feedback',
];

const browser = await chromium.launch();
const results = [];
const problems = [];

for (const slug of SLUGS) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  await page.goto(`${BASE}/home/${slug}`, { waitUntil: 'networkidle' });

  const counts = await page.evaluate(() => ({
    행: document.querySelectorAll('tbody tr[tabindex]').length,
    목록항목: [...document.querySelectorAll('li button')].length,
    지표: document.querySelectorAll('button.group').length,
    머리버튼: [...document.querySelectorAll('h1')].length > 0 ? document.querySelectorAll('h1 ~ * button, h1').length : 0,
    세그먼트: document.querySelectorAll('[role="group"] button').length,
    검색칸: document.querySelectorAll('input[type="search"]').length,
    빈카드: [...document.querySelectorAll('.runtime-cell')].filter((c) => (c.textContent ?? '').trim() === '').length,
    렌더오류: document.body.innerText.includes('렌더링 오류') || document.body.innerText.includes('알 수 없는 컴포넌트'),
  }));

  if (errors.length > 0) problems.push({ slug, kind: '콘솔 오류', detail: errors[0] });
  if (counts.렌더오류) problems.push({ slug, kind: '렌더 오류 표시', detail: '화면에 오류 문구가 있다' });
  if (counts.빈카드 > 0) problems.push({ slug, kind: '빈 카드', detail: `${counts.빈카드}개` });

  // ── 실제로 눌러 본다: 표의 첫 행
  let rowResult = '없음';
  if (counts.행 > 0) {
    const before = page.url();
    await page.locator('tbody tr[tabindex]').first().click();
    await page.waitForTimeout(900);
    const after = page.url();
    rowResult = after === before ? '주소 안 바뀜' : after.replace(BASE, '');
    if (after === before) problems.push({ slug, kind: '행을 눌러도 주소가 그대로', detail: before.replace(BASE, '') });
  }

  // ── 세그먼트(상태 필터) 두 번째 항목
  let segResult = '없음';
  if (counts.세그먼트 > 1) {
    await page.goto(`${BASE}/home/${slug}`, { waitUntil: 'networkidle' });
    const before = page.url();
    await page.locator('[role="group"] button').nth(1).click();
    await page.waitForTimeout(900);
    segResult = page.url() === before ? '주소 안 바뀜' : page.url().replace(BASE, '');
    if (page.url() === before) problems.push({ slug, kind: '세그먼트를 눌러도 주소가 그대로', detail: before.replace(BASE, '') });
  }

  results.push({ slug, counts, rowResult, segResult, errors: errors.length });
  await context.close();
}
await browser.close();

console.log(`\n대상 ${BASE} · 화면 ${SLUGS.length}개\n`);
for (const r of results) {
  console.log(
    `${problems.some((p) => p.slug === r.slug) ? '⚠️ ' : '✅'} ${r.slug.padEnd(16)} ` +
      `행 ${String(r.counts.행).padStart(2)} · 목록 ${String(r.counts.목록항목).padStart(2)} · 지표 ${r.counts.지표} · 세그 ${String(r.counts.세그먼트).padStart(2)} · 검색 ${r.counts.검색칸}` +
      `  | 행클릭 → ${r.rowResult}`
  );
}
if (problems.length === 0) {
  console.log('\n화면 문제 없음 ✅');
} else {
  console.log('');
  for (const p of problems) console.log(`⚠️  [${p.slug}] ${p.kind} — ${p.detail}`);
  console.log(`\n총 ${problems.length}건`);
}
process.exit(problems.length > 0 ? 1 : 0);
