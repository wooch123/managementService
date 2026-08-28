/**
 * 드롭다운 전수 검사 — 열리는 목록의 **글자가 실제로 보이는지**를 대비로 잰다.
 *
 * 왜 필요했나: 어두운 테마에서 네이티브 선택 상자를 펼치면 흰 바탕에 흰 글자가 나왔다. 닫힌
 * 상자만 보고는 알 수 없는 종류의 결함이라(펼친 목록은 브라우저가 그린다) 눈으로 훑어서는
 * 놓친다. 그래서 화면을 돌며 **모든 드롭다운을 열어** 배경과 글자색을 재고 대비를 계산한다.
 *
 * 재는 대상
 *   · 네이티브 `<select>`의 `<option>` — 브라우저가 그리는 목록
 *   · Radix 계열 팝업(선택 상자·드롭다운 메뉴·콤보박스) — 열어서 실제 DOM을 잰다
 *
 * 기준은 3:1이다(굵지 않은 작은 글자의 최소선인 4.5:1보다 낮게 잡은 이유: 목록의 흐린 보조
 * 문구까지 4.5를 요구하면 정상적인 위계까지 실패로 잡힌다. 여기서 찾으려는 것은 "안 보이는" 것이다).
 *
 * 실행: pnpm tsx scripts/audit-dropdowns.mts [베이스URL]
 */
import { chromium, type Page } from 'playwright';
import { THEMES } from '@/lib/theme/palettes';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const MIN_CONTRAST = 3;

/** 관리자 화면은 로그인이 필요하다 — 초기 자격증명(CLAUDE.md §8). */
const ADMIN = { username: 'admin', password: '123456' };

/** 관리자 화면 — 여기의 선택 상자는 Radix 계열이라 열어서 DOM을 잰다. */
const ADMIN_PAGES = ['/admin/builder', '/admin/data', '/admin/graph', '/admin/validate', '/admin/deploy'];

/** 테마를 바꿔 가며 잴 대표 화면(선택 상자가 둘 있다). */
const THEME_PAGE = '/home/fa-status';

/** 운영 화면 중 드롭다운이 있는 곳. */
const PAGES = [
  '/home/overview',
  '/home/fa-assign',
  '/home/fa-status',
  '/home/reball-status',
  '/home/reball-request',
  '/home/info-fail-rate',
  '/home/tech-report',
  '/home/feedback',
];

type Finding = { page: string; scheme: string; kind: string; label: string; fg: string; bg: string; ratio: number };

/**
 * 페이지 안에서 쟤는 일은 전부 브라우저에서 한다 — 문자열로 넘긴다(tsx가 넣는 헬퍼가
 * 브라우저 쪽에 없어서 함수를 그대로 넘기면 터진다).
 */
const MEASURE = `(() => {
  /**
   * 표기가 무엇이든 sRGB 숫자로 바꾼다.
   *
   * 테마 팔레트는 oklch로 쓰여 있어 getComputedStyle이 oklch(...)를 그대로 돌려준다.
   * rgb만 읽던 예전 방식은 그걸 null로 흘려보냈고, 그래서 테마 20종을 도는 구간이
   * **아무것도 재지 못한 채 조용히 통과**했다(잰 항목 0개). 캔버스에 한 점 찍어 되읽으면
   * 브라우저가 직접 변환해 주므로 어떤 표기든 상관없다.
   */
  var probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function parse(color) {
    if (!color) return null;
    var direct = parseRgb(color);
    if (direct) return direct;
    try {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      var d = probe.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) {
      return null;
    }
  }
  function parseRgb(color) {
    var m = color.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (v) { return parseFloat(v); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    var v = [c.r, c.g, c.b].map(function (x) {
      var s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function effectiveBg(el) {
    var node = el;
    while (node) {
      var c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.5) return c;
      node = node.parentElement;
    }
    var root = parse(getComputedStyle(document.body).backgroundColor);
    return root && root.a > 0.5 ? root : { r: 255, g: 255, b: 255, a: 1 };
  }
  function ratio(fg, bg) {
    var a = lum(fg), b = lum(bg);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  var out = [];

  /**
   * ① 네이티브 선택 상자.
   *
   * 여기가 핵심이다. 펼친 목록은 **DOM에 없다** — 브라우저가 직접 그린다. 그래서 조상 배경을
   * 따라 올라가 재면 안 된다(그렇게 재면 카드의 어두운 배경이 잡혀 늘 통과해 버린다. 실제로
   * 처음 만든 검사가 그래서 결함을 못 잡았다).
   *
   * 브라우저가 쓰는 배경은 이렇게 정해진다.
   *   · option에 배경색이 **선언돼 있으면** 그 색
   *   · 없으면 color-scheme이 정한 시스템 색 — light면 흰색, dark면 어두운 회색
   */
  var scheme = getComputedStyle(document.documentElement).colorScheme;
  var systemPopupBg = scheme.indexOf('dark') >= 0 ? { r: 43, g: 43, b: 43, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  var selects = Array.prototype.slice.call(document.querySelectorAll('select'));
  for (var i = 0; i < selects.length; i += 1) {
    var opts = Array.prototype.slice.call(selects[i].querySelectorAll('option'));
    for (var j = 0; j < opts.length; j += 1) {
      var os = getComputedStyle(opts[j]);
      var fg = parse(os.color);
      if (!fg) continue;
      var declared = parse(os.backgroundColor);
      var painted = declared && declared.a > 0.5 ? declared : systemPopupBg;
      out.push({
        kind: 'native option',
        label: (selects[i].getAttribute('aria-label') || selects[i].id || 'select') + ' › ' + (opts[j].textContent || '').slice(0, 14),
        fg: os.color,
        bg: declared && declared.a > 0.5 ? os.backgroundColor : 'color-scheme:' + scheme + '(시스템 기본)',
        ratio: Math.round(ratio(fg, painted) * 100) / 100
      });
      break; // 같은 select의 option은 규칙이 같다 — 하나만 대표로 본다
    }
  }

  // ② 열려 있는 Radix 팝업 — 실제 DOM을 잰다.
  var popups = Array.prototype.slice.call(
    document.querySelectorAll('[data-slot$="-content"][data-state="open"], [role="listbox"], [role="menu"]')
  );
  for (var k = 0; k < popups.length; k += 1) {
    var items = Array.prototype.slice.call(popups[k].querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'));
    if (items.length === 0) items = [popups[k]];
    for (var m2 = 0; m2 < Math.min(items.length, 3); m2 += 1) {
      var is = getComputedStyle(items[m2]);
      var f2 = parse(is.color);
      if (!f2) continue;
      var b2 = effectiveBg(items[m2]);
      out.push({
        kind: 'popup ' + (popups[k].getAttribute('data-slot') || popups[k].getAttribute('role')),
        label: (items[m2].textContent || '').slice(0, 18),
        fg: is.color,
        bg: 'rgb(' + b2.r + ', ' + b2.g + ', ' + b2.b + ')',
        ratio: Math.round(ratio(f2, b2) * 100) / 100
      });
    }
  }
  return out;
})()`;

/** 지금 화면에 있는 드롭다운을 전부 잰다 — 닫힌 것은 그대로, 팝업은 하나씩 열어 가며. */
async function measureAll(page: Page, label: string, scheme: string, findings: Finding[]): Promise<number> {
  let measured = 0;
  const record = async () => {
    const rows = (await page.evaluate(MEASURE)) as Omit<Finding, 'page' | 'scheme'>[];
    measured += rows.length;
    for (const row of rows) findings.push({ page: label, scheme, ...row });
  };
  await record();

  // Radix 팝업은 열어야 DOM에 생긴다 — 트리거를 차례로 눌러 본다.
  const triggers = await page.$$('[data-slot$="-trigger"], [aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="dialog"]');
  for (const trigger of triggers.slice(0, 8)) {
    try {
      await trigger.click({ timeout: 2000 });
      await page.waitForTimeout(250);
      await record();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
    } catch {
      // 눌리지 않는 트리거(가려짐·비활성)는 건너뛴다 — 검사 자체가 멈추면 안 된다.
    }
  }
  return measured;
}

/** 페이지를 열고 그 안의 드롭다운을 전부 잰다. */
async function auditPage(page: Page, path: string, scheme: string, findings: Finding[]): Promise<number> {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(600);
  return measureAll(page, path, scheme, findings);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings: Finding[] = [];
let total = 0;

for (const scheme of ['light', 'dark'] as const) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const path of PAGES) {
    total += await auditPage(page, path, scheme, findings);
  }
  await context.close();
}

/**
 * 테마 20종 훑기.
 *
 * 밝기 클래스(`dark`)와 팔레트(`data-theme`)는 **따로 저장된다** — 새로고침하면 팔레트는
 * 복원되는데 밝기는 next-themes가 따로 정한다. 그래서 "어두운 팔레트인데 밝기는 light"인
 * 상태가 실제로 만들어질 수 있고, 그때 브라우저는 목록을 흰 바탕에 그린다. 두 경우를 다 잰다.
 */
{
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}${THEME_PAGE}`, { waitUntil: 'networkidle', timeout: 60_000 });
  for (const theme of THEMES) {
    for (const withDarkClass of [false, true]) {
      await page.evaluate(
        `(() => {
          document.documentElement.setAttribute('data-theme', '${theme.id}');
          document.documentElement.classList.toggle('dark', ${withDarkClass});
          return true;
        })()`
      );
      total += await measureAll(
        page,
        `테마 ${theme.id}${theme.isDark ? '(어두움)' : ''}`,
        withDarkClass ? 'dark 클래스 있음' : 'dark 클래스 없음',
        findings
      );
    }
  }
  await context.close();
}

// 관리자 화면 — 로그인한 뒤 Radix 팝업을 열어 잰다.
for (const scheme of ['light', 'dark'] as const) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const login = await page.request.post(`${BASE}/api/auth/login`, { data: ADMIN });
  if (!login.ok()) {
    console.log(`(관리자 로그인 실패 ${login.status()} — 관리자 화면은 건너뜁니다)`);
    await context.close();
    break;
  }
  for (const path of ADMIN_PAGES) {
    try {
      total += await auditPage(page, path, scheme, findings);
    } catch {
      console.log(`(건너뜀: ${path})`);
    }
  }
  await context.close();
}

await browser.close();

const bad = findings.filter((f) => f.ratio < MIN_CONTRAST);
const byKind = new Map<string, number>();
for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
const byPage = new Map<string, number>();
for (const f of findings) byPage.set(f.page, (byPage.get(f.page) ?? 0) + 1);

console.log(
  `\n대상 ${BASE} · 화면 ${PAGES.length + ADMIN_PAGES.length}개 × 밝기 2가지 · 테마 ${THEMES.length}종 × 밝기 2가지 · 잰 항목 ${total}개\n`
);
for (const [kind, n] of [...byKind].sort()) console.log(`  ${kind.padEnd(26)} ${n}개`);
console.log('');
console.log('검사한 곳:');
for (const [where, n] of [...byPage].sort()) console.log(`  ${where.padEnd(26)} ${n}개`);

if (bad.length === 0) {
  console.log(`\n대비가 ${MIN_CONTRAST}:1 아래인 드롭다운 없음 ✅`);
} else {
  console.log(`\n⚠️ 글자가 묻히는 곳 ${bad.length}개 (기준 ${MIN_CONTRAST}:1)\n`);
  for (const f of bad) {
    console.log(`  [${f.scheme}] ${f.page} · ${f.kind} · ${f.label}`);
    console.log(`      글자 ${f.fg} / 배경 ${f.bg} → ${f.ratio}:1`);
  }
}

// 가장 아슬아슬한 것들도 함께 보여 준다 — 기준을 겨우 넘긴 것이 있으면 알아야 한다.
const worst = [...findings].sort((a, b) => a.ratio - b.ratio).slice(0, 5);
console.log('\n대비가 낮은 순 5개:');
for (const f of worst) console.log(`  ${f.ratio.toFixed(2)}:1  [${f.scheme}] ${f.kind} · ${f.label} (${f.page})`);

process.exit(bad.length > 0 ? 1 : 0);
