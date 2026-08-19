/**
 * UI 배치 점검 — 화면을 실제로 띄워 "찐빠"를 기계적으로 찾는다.
 *
 * 찾는 것:
 *   1) 가로 스크롤바가 생기는 페이지(본문이 뷰포트를 넘음)
 *   2) 잘려 나가는 요소 — overflow:hidden인 조상 밖으로 삐져나간 경우(스크롤 가능한 영역은 제외)
 *   3) 말줄임 없이 잘린 글자 — 넘치는데 text-overflow가 ellipsis가 아닌 경우
 *   4) 오와 열이 안 맞는 카드 — 같은 행에 놓였는데 위 끝이나 높이가 다른 경우
 *   5) 형제끼리 겹친 요소
 *
 * 사용: pnpm audit:ui [베이스URL]   (기본 http://localhost:3100)
 */
import { createRequire } from 'node:module';
const require = createRequire('F:/Claude/WebApp_V1/package.json');
const { chromium } = require('@playwright/test');
import { IN_PAGE } from './ui-audit-rules.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const VIEWPORTS = [
  { name: '데스크톱 1600', width: 1600, height: 1000 },
  { name: '노트북 1280', width: 1280, height: 800 },
];


const browser = await chromium.launch();
const ctx = await browser.newContext();

// 운영 화면 목록은 **배포된 스펙**에서 가져온다(인증이 필요 없고, 하위 페이지까지 전부 들어 있다).
// 예전에는 /api/admin/pages를 썼는데 그건 최상위 6개만 주는 데다 인증이 필요해서, 운영 서버를
// 상대로 돌리면(세션 쿠키가 secure) 조용히 빈 목록이 되어 운영 화면을 한 장도 안 보고
// "지적 0건"을 찍었다.
const specRes = await ctx.request.get(`${BASE}/api/runtime/spec`);
const spec = specRes.ok() ? await specRes.json() : null;
const runtimePaths = (spec?.pages ?? []).map((p) => `/home/${p.slug}`);
if (runtimePaths.length === 0) {
  console.log('⚠️  배포된 스펙을 읽지 못했습니다 — 운영 화면은 점검하지 못합니다.');
}

// 관리자 화면은 로그인이 필요하다. 세션이 안 잡히면 로그인 화면만 보고 통과해버리므로 먼저 확인한다.
await ctx.request.post(`${BASE}/api/auth/login`, { data: { username: 'admin', password: '123456' } });
const sessionRes = await ctx.request.get(`${BASE}/api/auth/session`);
const loggedIn = sessionRes.ok() && Boolean((await sessionRes.json())?.data?.username);
const adminPaths = ['/admin/builder', '/admin/graph', '/admin/data', '/admin/validate', '/admin/deploy'];
if (!loggedIn) {
  console.log(
    '⚠️  관리자 세션을 만들지 못해 관리자 화면은 건너뜁니다' +
      ' (운영 서버는 세션 쿠키가 secure라 http로는 로그인되지 않는다 — 개발 서버를 상대로 돌리세요).'
  );
}

const paths = ['/home', ...runtimePaths, ...(loggedIn ? adminPaths : [])];

let total = 0;
for (const vp of VIEWPORTS) {
  console.log(`\n══════ ${vp.name} (${vp.width}×${vp.height}) ══════`);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const path of paths) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(path.startsWith('/admin') ? 6000 : 4000);
      const findings = await page.evaluate(IN_PAGE);
      total += findings.length;
      if (findings.length === 0) {
        console.log(`✅ ${path}`);
      } else {
        console.log(`⚠️  ${path} — ${findings.length}건`);
        for (const f of findings.slice(0, 6)) {
          console.log(`     · ${f.kind}: ${f.detail}`);
          console.log(`       ${f.path}${f.text ? ` | "${f.text}"` : ''}`);
        }
      }
    } catch (e) {
      console.log(`✗ ${path} — 점검 실패: ${String(e).slice(0, 80)}`);
    }
  }
  await page.close();
}
await browser.close();
console.log(`\n총 지적 ${total}건`);
process.exitCode = total > 0 ? 1 : 0;
