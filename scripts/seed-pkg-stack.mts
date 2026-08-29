/**
 * PKG Stack 확인용 샘플 데이터.
 *
 * 왜 스크립트인가: 값을 눈으로 확인해 보려면 몇 건이 있어야 하는데, 손으로 넣으면 나중에
 * "어느 것이 진짜인지" 알 수 없게 된다. 여기서 넣는 줄은 전부 메모에 표식을 달고, 같은
 * 스크립트로 **한 번에 지울 수 있게** 한다.
 *
 * Part ID는 지어내지 않고 **FAR 원장에 실제로 있는 것**을 쓴다 — 그래야 Tech Report의
 * Stack 칸이 이 값을 끌어오는 것까지 함께 확인된다(part_id로 잇는다).
 *
 * 실행:
 *   pnpm tsx scripts/seed-pkg-stack.mts          넣기(이미 있으면 건너뛴다)
 *   pnpm tsx scripts/seed-pkg-stack.mts --clear  이 스크립트가 넣은 줄만 지우기
 *
 * 그림은 **앱의 업로드 창구**(POST /api/runtime/tech-report/image)로 올린다. 형식 판별·크기
 * 제한·저장 이름 짓기가 전부 그쪽에 있어, 여기서 파일을 직접 쓰면 그 규칙을 한 벌 더 적게 된다.
 * 그래서 개발 서버가 떠 있어야 한다(기본 http://localhost:3100, 인자로 바꿀 수 있다).
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { chromium } from 'playwright';

/** 이 스크립트가 넣은 줄임을 알리는 표식 — 지울 때도 이것으로 찾는다. */
const MARK = '[샘플 데이터] 확인용으로 넣은 줄입니다. scripts/seed-pkg-stack.mts --clear 로 지웁니다.';

type Plan = {
  part_id: string;
  device: string;
  /** 채널 수 · way 수 · 층 수 — 이 셋으로 적층 줄을 만든다. */
  ch: number;
  way: number;
  chip: number;
};

/**
 * Part ID는 원장에 실제로 있는 값이다(2026-08-29 기준).
 *   PN-80ACA · PN-5A2DC · PN-D1FA4 → FAR-25-1251의 sample 1·2·3
 *   PN-44009 · PN-747DC           → FAR-26-1148의 sample 1·2
 * 한 FAR의 sample을 모두 덮어 둬야 Tech Report의 탭을 넘겨 가며 확인할 수 있다.
 */
const PLANS: Plan[] = [
  { part_id: 'PN-80ACA', device: 'DEV-UFS40-512', ch: 4, way: 2, chip: 2 },
  { part_id: 'PN-5A2DC', device: 'DEV-UFS40-512', ch: 4, way: 2, chip: 1 },
  { part_id: 'PN-D1FA4', device: 'DEV-UFS40-512', ch: 2, way: 2, chip: 2 },
  { part_id: 'PN-44009', device: 'DEV-EMMC51-064', ch: 1, way: 2, chip: 2 },
  { part_id: 'PN-747DC', device: 'DEV-EMMC51-064', ch: 1, way: 1, chip: 4 },
];

function layersOf(plan: Plan): { ch: string; way: string; chip: string }[] {
  const rows: { ch: string; way: string; chip: string }[] = [];
  for (let c = 0; c < plan.ch; c += 1) {
    for (let w = 0; w < plan.way; w += 1) {
      for (let k = 1; k <= plan.chip; k += 1) {
        rows.push({ ch: String(c), way: String(w), chip: String(k) });
      }
    }
  }
  return rows;
}

/**
 * 적층 그림 — 표를 그대로 그림으로 옮긴 **도식**이다.
 *
 * 실제 제품 사진이 아니므로 '샘플'을 크게 적어 둔다. 진짜 구조도로 오해되면 안 된다.
 */
function diagramHtml(plan: Plan): string {
  const cells = Array.from({ length: plan.ch }, (_, c) =>
    Array.from({ length: plan.way }, (_, w) => {
      const stack = Array.from({ length: plan.chip }, (_, k) => plan.chip - k)
        .map((k) => `<div class="chip">CH${c}·W${w} · ${k}차</div>`)
        .join('');
      return `<div class="col">${stack}<div class="base">CH${c} WAY${w}</div></div>`;
    }).join('')
  ).join('');

  return `<!doctype html><meta charset="utf-8" /><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 520px; padding: 14px; font-family: "Malgun Gothic", system-ui, sans-serif; background: #ffffff; color: #20252b; position: relative; }
    h1 { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
    p { font-size: 10px; color: #727a83; margin-bottom: 10px; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
    .col { display: flex; flex-direction: column; gap: 2px; }
    .chip { border: 1px solid #7759f4; background: #efeaff; color: #4b3bb0; font-size: 9px; padding: 4px 6px; border-radius: 3px; text-align: center; }
    .base { border: 1px solid #c9ced3; background: #f2f3f5; color: #727a83; font-size: 9px; padding: 3px 6px; border-radius: 3px; text-align: center; }
    .mark { position: absolute; right: 14px; top: 12px; font-size: 10px; font-weight: 700; color: #df6b62; border: 1px solid #df6b62; border-radius: 3px; padding: 1px 5px; }
  </style>
  <span class="mark">샘플</span>
  <h1>${plan.part_id} 적층 도식</h1>
  <p>${plan.device} · CH ${plan.ch} × WAY ${plan.way} × ${plan.chip}단 — 표를 그대로 옮긴 도식입니다(실제 사진 아님).</p>
  <div class="grid">${cells}</div>`;
}

const clear = process.argv.includes('--clear');
const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const db = new Database(path.join(process.cwd(), 'data', 'app.db'));

if (clear) {
  const n = db.prepare('DELETE FROM "pkg_stack" WHERE "note" = ?').run(MARK).changes;
  console.log(`샘플 ${n}건을 지웠습니다.`);
  db.close();
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 400 }, deviceScaleFactor: 2 });

let added = 0;
for (const plan of PLANS) {
  const exists = db.prepare('SELECT 1 FROM "pkg_stack" WHERE "part_id" = ?').get(plan.part_id);
  if (exists) {
    console.log(`건너뜀 — ${plan.part_id}는 이미 있습니다.`);
    continue;
  }

  await page.setContent(diagramHtml(plan), { waitUntil: 'load' });
  const png = await page.locator('body').screenshot({ type: 'png' });

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'stack.png');
  const res = await fetch(`${BASE}/api/runtime/tech-report/image`, { method: 'POST', body: form });
  const uploaded = (await res.json()) as { ok: boolean; data?: { file: string }; error?: { message: string } };
  if (!uploaded.ok || !uploaded.data) {
    console.error(`그림을 올리지 못했습니다(${plan.part_id}): ${uploaded.error?.message ?? res.status}`);
    continue;
  }
  const stored = uploaded.data;

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO "pkg_stack" ("id","created_at","updated_at","part_id","layers","image","note") VALUES (?,?,?,?,?,?,?)'
  ).run(
    `seed-pkg-${plan.part_id}`,
    now,
    now,
    plan.part_id,
    JSON.stringify(layersOf(plan)),
    stored.file,
    MARK
  );
  added += 1;
  console.log(`넣음 — ${plan.part_id} (${plan.device}) · ${layersOf(plan).length}줄 · ${stored.file}`);
}

await browser.close();
db.close();
console.log(`\n샘플 ${added}건을 넣었습니다. 지우려면 --clear로 다시 실행하세요.`);
