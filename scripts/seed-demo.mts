/**
 * 새로 만든 화면들의 **보기용 데이터** — DRAM LF 평가표와 주요 Issue.
 *
 * 왜 `seed-sample.mts`와 나눠 두는가: 그쪽은 표본을 **전부 지우고 다시 만든다**. 지금 원장에는
 * 사람이 손댄 것이 이미 얹혀 있다(담당자 지정·분석 인계, FAR No로 묶인 Tech Report·PKG Stack).
 * 전체를 다시 만들면 FAR No가 새로 뽑히면서 그 연결이 통째로 끊긴다 — 보기용 몇 줄을 넣자고
 * 치를 값이 아니다. 그래서 **비어 있는 표에만** 더한다.
 *
 * 넣는 값은 이미 원장에 있는 FAR No를 골라 쓴다. 없는 번호를 지어내면 Issue 표에서 FAR No를
 * 눌러도 아무 데도 닿지 않아, 보기용 데이터가 오히려 "이 화면은 이렇게 안 이어지는구나"를
 * 가르친다.
 *
 * 실행:  pnpm tsx scripts/seed-demo.mts
 * 지우기: pnpm tsx scripts/seed-demo.mts --clear
 */
import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};

import { nanoid } from 'nanoid';

const { getAppDb } = await import('@/lib/db/app-db');
const db = getAppDb();

/** 씨앗을 고정한 난수 — 같은 명령이면 같은 데이터가 나온다. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
const rand = makeRandom(20260831);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const intBetween = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;

const now = new Date().toISOString();

/** 원장에 실제로 있는 FAR No를 쓴다 — 보기용 값도 이어지는 값이어야 한다. */
function realFarNos(limit: number): { far_no: string; sample_no: string }[] {
  return db
    .prepare(`SELECT "far_no", "sample_no" FROM "far_table" WHERE "far_no" LIKE 'FAR-%' ORDER BY "far_no" LIMIT ?`)
    .all(limit) as { far_no: string; sample_no: string }[];
}

// ── DRAM LF 평가 ────────────────────────────────────────────────────────────

const DRAM_SYMPTOM = ['N/A', 'Boot 실패', 'Read Retry 증가', '전류 이상'] as const;
const DRAM_TYPE = ['N/A', 'Cell Fail', 'Peri Fail', 'Bump Open'] as const;

function seedDram(): number {
  const rows = realFarNos(14);
  if (rows.length === 0) return 0;

  const columns = [
    'id', 'created_at', 'updated_at', 'far_no', 'sample_no', 'result', 'dc_open', 'dc_short',
    'pin_lkg', 'idd2p', 'ate', 'fail_symptom', 'fail_type', 'fail_address', 'signatures', 'images',
  ];
  const insert = db.prepare(
    `INSERT INTO "dram_lf_table" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  );

  const run = db.transaction(() => {
    for (const { far_no, sample_no } of rows) {
      // 다섯에 하나쯤만 Fail이다 — 전부 Fail이면 판정 칸이 무슨 뜻인지 안 보인다.
      const failed = rand() < 0.22;
      const ate = failed && rand() < 0.6 ? 'Fail' : 'Pass';
      const open = failed && rand() < 0.3 ? 'Fail' : 'Pass';
      const signatures = failed
        ? JSON.stringify(
            Array.from({ length: intBetween(2, 6) }, (_, i) => `CH${intBetween(0, 3)} CS${intBetween(0, 1)} Signature_${String(i + 1).padStart(2, '0')}`)
          )
        : '[]';
      insert.run(
        nanoid(), now, now, far_no, sample_no,
        failed ? 'Fail' : 'Pass',
        open,
        'Pass',
        `${intBetween(2, 9) * 100}uA`,
        `${intBetween(1, 5) * 100}uA`,
        ate,
        failed ? pick(DRAM_SYMPTOM.slice(1)) : 'N/A',
        failed ? pick(DRAM_TYPE.slice(1)) : 'N/A',
        failed ? `0x${intBetween(0x1000, 0xfffff).toString(16).toUpperCase()}` : 'N/A',
        signatures,
        '[]'
      );
    }
  });
  run();
  return rows.length;
}

// ── 주요 Issue ──────────────────────────────────────────────────────────────

const LOCATIONS = ['CH0 CS0', 'CH0 CS1', 'CH1 CS0', 'CH1 CS1', 'CH2 CS0', 'CH3 CS1'] as const;
const MODES = ['Read Fail', 'Write Fail', 'Init Fail', 'No Boot', 'Data Retention'] as const;
const TYPES = ['ECC Uncorrectable', 'Program Fail', 'Init Timeout', 'Solder Crack', 'Read Timeout'] as const;
const PJTS = ['PJT-Alpha', 'PJT-Beta', 'PJT-Gamma'] as const;
const PROGRESS = ['접수', '분석 중', 'Reball 대기', '분석 완료', '고객 회신'] as const;
const SYMPTOMS = ['부팅 불가', '간헐적 read 오류', '쓰기 속도 저하', '전원 재인가 시 복구'] as const;
const ANALYSIS = ['FA 진행 중', 'Signature 확보', 'Wafer Map 확인 필요', '원인 규명 완료'] as const;

/** 보기용 Issue — 제목만으로도 무엇을 모아 둔 화면인지 알 수 있게 짓는다. */
const ISSUES = [
  { title: '26W20 UFS40 Init Fail 급증', rows: 9 },
  { title: 'eMMC 초도 양산 Read Fail 추적', rows: 7 },
] as const;

function seedIssues(): { pages: number; rows: number } {
  const far = realFarNos(40);
  if (far.length === 0) return { pages: 0, rows: 0 };

  const pageCols = ['id', 'created_at', 'updated_at', 'title', 'note', 'created_on'];
  const insertPage = db.prepare(
    `INSERT INTO "issue_page" (${pageCols.map((c) => `"${c}"`).join(', ')}) VALUES (${pageCols.map(() => '?').join(', ')})`
  );
  const rowCols = [
    'id', 'created_at', 'updated_at', 'issue_id', 'no', 'fail_location', 'fail_mode', 'fail_type',
    'pjt', 'week_code', 'slc_max_ec', 'mlc_max_ec', 'tbw', 'far_no', 'sample_no', 'cust_symptom',
    'fail_analysis', 'stack', 'wafer_map', 'progress', 'comment', 'images',
  ];
  const insertRow = db.prepare(
    `INSERT INTO "issue_row" (${rowCols.map((c) => `"${c}"`).join(', ')}) VALUES (${rowCols.map(() => '?').join(', ')})`
  );

  let rowCount = 0;
  const run = db.transaction(() => {
    for (const issue of ISSUES) {
      const pageId = nanoid();
      insertPage.run(pageId, now, now, issue.title, '', now);
      for (let i = 0; i < issue.rows; i += 1) {
        const source = far[(i * 3) % far.length]!;
        // 같은 자리가 여러 번 나오게 둔다 — 차트가 '어느 자리가 많은지'를 보여 주는 그림이라
        // 자리마다 하나씩이면 막대가 전부 1이 되어 아무것도 읽히지 않는다.
        const location = LOCATIONS[Math.min(LOCATIONS.length - 1, Math.floor(i / 2))]!;
        insertRow.run(
          nanoid(), now, now, pageId,
          String(i + 1),
          location,
          pick(MODES),
          pick(TYPES),
          pick(PJTS),
          `26W${String(intBetween(10, 34)).padStart(2, '0')}`,
          String(intBetween(120, 980)),
          String(intBetween(400, 2600)),
          `${intBetween(3, 90) * 10}TB`,
          source.far_no,
          source.sample_no,
          pick(SYMPTOMS),
          pick(ANALYSIS),
          `${intBetween(4, 16)}단`,
          rand() < 0.5 ? '확보' : '미확보',
          pick(PROGRESS),
          i === 0 ? '보기용으로 넣어 둔 줄입니다. 줄 왼쪽 화살표를 누르면 이 코멘트와 그림 칸이 나옵니다.' : '',
          '[]'
        );
        rowCount += 1;
      }
    }
  });
  run();
  return { pages: ISSUES.length, rows: rowCount };
}

// ── 실행 ────────────────────────────────────────────────────────────────────

function clearDemo(): void {
  const rows = db.prepare('DELETE FROM "issue_row"').run().changes;
  const pages = db.prepare('DELETE FROM "issue_page"').run().changes;
  const dram = db.prepare('DELETE FROM "dram_lf_table"').run().changes;
  console.log(`보기용 데이터를 비웠습니다 — dram_lf_table ${dram}행 · issue_page ${pages}행 · issue_row ${rows}행.`);
}

if (process.argv.includes('--clear')) {
  clearDemo();
} else {
  /**
   * 이미 무언가 들어 있으면 손대지 않는다. 보기용 데이터를 넣자고 **사람이 적어 둔 것**을
   * 지우거나 그 옆에 가짜를 섞을 수는 없다. 다시 만들려면 `--clear` 뒤에 실행한다.
   */
  const used = ['dram_lf_table', 'issue_page', 'issue_row'].filter(
    (t) => (db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c > 0
  );
  if (used.length > 0) {
    console.log(`이미 값이 들어 있어 넣지 않았습니다: ${used.join(', ')}`);
    console.log('보기용으로 다시 채우려면: pnpm tsx scripts/seed-demo.mts --clear && pnpm tsx scripts/seed-demo.mts');
    process.exit(0);
  }

  const dram = seedDram();
  const issue = seedIssues();
  if (dram === 0 && issue.pages === 0) {
    console.log('원장(far_table)이 비어 있어 넣을 것이 없습니다 — 먼저 pnpm tsx scripts/seed-sample.mts를 실행하세요.');
    process.exit(1);
  }
  console.log('보기용 데이터를 넣었습니다:');
  console.log(`  dram_lf_table  ${dram}행`);
  console.log(`  issue_page     ${issue.pages}행`);
  console.log(`  issue_row      ${issue.rows}행`);
  console.log('\n실제 데이터가 들어오면 `pnpm tsx scripts/seed-demo.mts --clear`로 비우세요.');
}
