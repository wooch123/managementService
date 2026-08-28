/**
 * 표본 데이터 — 화면이 실제로 도는지 확인하기 위한 **가짜 데이터**다.
 *
 * 왜 넣는가: 이번 재구성으로 업무 표를 전부 비웠고, 접수 정보는 외부 서버 API가, 분석 값은 분석
 * Tool이 채우기로 되어 있다(둘 다 이관 후 연동). 그때까지 표가 비어 있으면 모든 화면이 빈 카드로만
 * 보여 "만들다 만 것"과 구별되지 않는다.
 *
 * 실제 고객사·제품 이름은 쓰지 않는다(전부 `고객사 A`, `DEV-UFS31-256` 같은 대체 이름).
 *
 * 지우려면: `pnpm tsx scripts/seed-sample.mts --clear`
 * 다시 만들려면: `pnpm tsx scripts/seed-sample.mts`  (기존 표본을 지우고 새로 만든다)
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
const { ANALYSIS_COLUMNS } = await import('@/lib/far/analysis-fields');

const db = getAppDb();

/** 씨앗을 고정한 난수 — 같은 명령이면 같은 데이터가 나온다(결과를 견줄 수 있어야 한다). */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const rand = makeRandom(20260828);

const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number): number => min + rand() * (max - min);
const intBetween = (min: number, max: number): number => Math.floor(between(min, max + 1));
const chance = (p: number): boolean => rand() < p;

const CUSTOMERS = ['고객사 A', '고객사 B', '고객사 C', '고객사 D', '고객사 E', '고객사 F', '고객사 G'] as const;
const OWNERS = ['김분석', '이신뢰', '박품질', '최계측', '정해석', '한검증'] as const;
const FAIL_LOCS = ['Qual', 'In-process', 'Field', 'Incoming'] as const;
const APPS = ['Auto', 'Mobile', 'PC/NB', 'Consumer', 'Server'] as const;
const DEVICES = ['DEV-EMMC51-064', 'DEV-UFS22-128', 'DEV-UFS31-256', 'DEV-UFS40-512', 'DEV-UFS40-1TB'] as const;
const CTRLS = ['CTRL-A1', 'CTRL-B2', 'CTRL-C3'] as const;
const NANDS = ['NAND-V6', 'NAND-V7', 'NAND-V8'] as const;
const DRAMS = ['DRAM-LP4X', 'DRAM-LP5', ''] as const;
const FBGAS = ['FBGA153', 'FBGA221', 'FBGA254'] as const;
const DENSITIES = ['64GB', '128GB', '256GB', '512GB', '1TB'] as const;
const FAILMODE1 = ['No Boot', 'Read Fail', 'Write Fail', 'Init Fail', 'Data Retention', 'Performance'] as const;
const FAILMODE2: Record<string, readonly string[]> = {
  'No Boot': ['Power Up Fail', 'Solder Crack', 'ROM Fail'],
  'Read Fail': ['ECC Uncorrectable', 'Read Timeout', 'CRC Error'],
  'Write Fail': ['Program Fail', 'Write Timeout'],
  'Init Fail': ['Init Timeout', 'Handshake Fail'],
  'Data Retention': ['High Temp Retention', 'Cross Temp'],
  Performance: ['Seq Read Drop', 'Random Write Drop'],
};
const SYMPTOMS = [
  '고객 단말에서 부팅 중 멈춤',
  '대용량 파일 복사 중 오류 반환',
  '고온 보관 후 read 오류',
  '전원 재인가 시 인식 실패',
  '연속 쓰기 중 성능 저하',
  '초기화 명령 무응답',
] as const;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 그 날짜가 속한 주의 week code(YYWW) — 출하 week code 자리에 넣는다. */
function weekCode(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${String(date.getFullYear()).slice(2)}${String(week).padStart(2, '0')}`;
}

function hex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += '0123456789ABCDEF'[intBetween(0, 15)];
  return out;
}

/** 한 번의 측정에서 나오는 분석 값 한 벌. */
function analysisSnapshot(): Record<string, unknown> {
  const slcAvg = between(60, 900);
  const mlcAvg = between(200, 2600);
  const write = between(20, 9000);
  return {
    firmware: `FW${intBetween(1, 9)}.${intBetween(0, 9)}${intBetween(0, 9)}`,
    init: chance(0.82) ? 1 : 0,
    slc_max_ec: Math.round(slcAvg * between(1.15, 1.8)),
    slc_min_ec: Math.round(slcAvg * between(0.35, 0.85)),
    slc_avg_ec: Math.round(slcAvg),
    mlc_max_ec: Math.round(mlcAvg * between(1.15, 1.9)),
    mlc_min_ec: Math.round(mlcAvg * between(0.3, 0.8)),
    mlc_avg_ec: Math.round(mlcAvg),
    open_count: intBetween(20, 40000),
    rtbb_count: intBetween(0, 180),
    reclaim_count: intBetween(0, 5000),
    write_size: Math.round(write),
    read_size: Math.round(write * between(0.8, 3.2)),
    lvd_count: intBetween(0, 40),
    npor_count: intBetween(10, 20000),
    spor_count: intBetween(0, 900),
    ecid: hex(16),
    nand_lotid: JSON.stringify(Array.from({ length: intBetween(2, 8) }, () => `NL${hex(6)}`)),
  };
}

function clearSample(): void {
  for (const table of ['far_analysis_log', 'far_table', 'reball_table']) {
    // 이력 표는 DELETE가 트리거로 막혀 있다 — 표본을 비울 때만 잠시 내렸다가 다시 건다.
    if (table === 'far_analysis_log') {
      db.exec('DROP TRIGGER IF EXISTS "far_analysis_log_no_delete"');
      db.exec(`DELETE FROM "${table}"`);
      db.exec(
        `CREATE TRIGGER "far_analysis_log_no_delete" BEFORE DELETE ON "far_analysis_log"
         BEGIN SELECT RAISE(ABORT, '분석 이력은 삭제할 수 없습니다'); END`
      );
      continue;
    }
    db.exec(`DELETE FROM "${table}"`);
  }
  console.log('표본 데이터를 비웠습니다 (far_table · far_analysis_log · reball_table).');
}

function seed(): void {
  clearSample();

  const today = new Date();
  const farColumns = [
    'id', 'created_at', 'updated_at',
    'far_no', 'sample_no', 'name',
    'rcv_date', 'due_date', 'cust_name', 'fail_loc', 'fail_symptom', 'part_id', 'app', 'device',
    'ctrl', 'nand', 'dram', 'fbga', 'failmode1', 'failmode2', 'comp_wc', 'lot_id', 'density',
    ...ANALYSIS_COLUMNS,
    'visual_inspaction_top', 'visual_inspaction_bottom',
  ];
  const insertFar = db.prepare(
    `INSERT INTO "far_table" (${farColumns.map((c) => `"${c}"`).join(', ')}) VALUES (${farColumns.map(() => '?').join(', ')})`
  );

  const logColumns = ['id', 'created_at', 'updated_at', 'far_no', 'sample_no', 'rev', 'recorded_at', 'source', ...ANALYSIS_COLUMNS];
  const insertLog = db.prepare(
    `INSERT INTO "far_analysis_log" (${logColumns.map((c) => `"${c}"`).join(', ')}) VALUES (${logColumns.map(() => '?').join(', ')})`
  );

  const cost = db.prepare('SELECT * FROM "reball_cost_table" ORDER BY "created_at" ASC LIMIT 1').get() as
    | Record<string, number>
    | undefined;
  const reballColumns = [
    'id', 'created_at', 'updated_at',
    'far_no', 'urgent', 'date', 'export_no', 'name', 'pjt',
    'is_reball', 'is_component_detach', 'is_underfill', 'is_grinding', 'count', 'handling', 'per_cost', 'total_cost',
  ];
  const insertReball = db.prepare(
    `INSERT INTO "reball_table" (${reballColumns.map((c) => `"${c}"`).join(', ')}) VALUES (${reballColumns.map(() => '?').join(', ')})`
  );

  const CLAIMS = 340;
  let sampleRows = 0;
  let logRows = 0;
  let reballRows = 0;
  const farNumbers: { far_no: string; device: string; rcv: Date; owner: string | null }[] = [];

  const run = db.transaction(() => {
    for (let i = 0; i < CLAIMS; i += 1) {
      const rcv = addDays(today, -intBetween(0, 420));
      const due = addDays(rcv, intBetween(10, 45));
      const farNo = `FAR-${String(rcv.getFullYear()).slice(2)}-${String(1000 + i)}`;
      const customer = pick(CUSTOMERS);
      const device = pick(DEVICES);
      const mode1 = pick(FAILMODE1);
      // 접수된 지 얼마 안 된 건일수록 담당자가 아직 없다.
      const assigned = chance(rcv > addDays(today, -21) ? 0.45 : 0.88);
      const owner = assigned ? pick(OWNERS) : null;
      const analysed = assigned && chance(0.72);
      const sampleCount = intBetween(1, 3);

      farNumbers.push({ far_no: farNo, device, rcv, owner });

      for (let s = 1; s <= sampleCount; s += 1) {
        // 분석 값은 여러 번 기록될 수 있다 — 마지막 기록이 원장의 '지금 값'이 된다.
        const revisions = analysed ? (chance(0.3) ? intBetween(2, 3) : 1) : 0;
        let latest: Record<string, unknown> = Object.fromEntries(ANALYSIS_COLUMNS.map((c) => [c, null]));
        const now = new Date().toISOString();

        for (let rev = 1; rev <= revisions; rev += 1) {
          const snapshot = analysisSnapshot();
          latest = snapshot;
          // 접수 뒤 며칠 지나 측정한 것으로 둔다. **오늘을 넘지 않게** 자른다 — 접수일이
          // 최근이면 계산된 날짜가 미래가 되어, 아직 하지도 않은 측정이 이력에 남는다.
          const measured = addDays(rcv, intBetween(3, 20) + rev * 3);
          const recordedAt = (measured > today ? addDays(today, -intBetween(0, 2)) : measured).toISOString();
          insertLog.run(
            nanoid(), now, now,
            farNo, String(s), rev, recordedAt, '분석 Tool',
            ...ANALYSIS_COLUMNS.map((c) => snapshot[c] ?? null)
          );
          logRows += 1;
        }

        insertFar.run(
          nanoid(), now, now,
          farNo, String(s), owner,
          isoDay(rcv), isoDay(due), customer, pick(FAIL_LOCS), pick(SYMPTOMS), `PN-${hex(5)}`, pick(APPS), device,
          pick(CTRLS), pick(NANDS), pick(DRAMS), pick(FBGAS), mode1, pick(FAILMODE2[mode1]), weekCode(rcv), `LOT${hex(6)}`, pick(DENSITIES),
          ...ANALYSIS_COLUMNS.map((c) => latest[c] ?? null),
          `\\images\\${farNo}_top.png`, `\\images\\${farNo}_bottom.png`
        );
        sampleRows += 1;
      }
    }

    // Reball 의뢰 — 실제 단가표를 참조해 계산한다(화면이 계산하는 것과 같은 규칙).
    if (cost) {
      for (const claim of farNumbers.filter(() => chance(0.13))) {
        const overBall = chance(0.6);
        const detach = chance(0.35);
        const underfill = chance(0.25);
        const grinding = chance(0.2);
        // 아무 작업도 고르지 않으면 가격이 0원이 되어 "계산이 안 된 것"처럼 보인다 —
        // 다른 항목이 하나도 없으면 Reball을 켠다.
        const isReball = chance(0.85) || !(detach || underfill || grinding);
        const urgent = chance(0.18);
        const count = intBetween(1, 8);
        const per =
          (isReball ? (overBall ? cost.upper_200ball : cost.under_200ball) : 0) +
          (detach ? cost.component_detach : 0) +
          (underfill ? cost.underfill : 0) +
          (grinding ? cost.grinding : 0) +
          (urgent ? cost.urgent : 0);
        const now = new Date().toISOString();
        insertReball.run(
          nanoid(), now, now,
          claim.far_no, urgent ? 1 : 0, isoDay(addDays(claim.rcv, intBetween(5, 30))), `EX-${hex(5)}`, claim.owner ?? pick(OWNERS), claim.device,
          isReball ? 1 : 0, detach ? 1 : 0, underfill ? 1 : 0, grinding ? 1 : 0, count,
          chance(0.5) ? '작업 후 외관 사진 함께 회신 부탁드립니다.' : '', per, per * count
        );
        reballRows += 1;
      }
    }
  });

  run();

  console.log(`표본 데이터를 넣었습니다:`);
  console.log(`  far_table         ${sampleRows.toLocaleString('ko-KR')}행 (FAR ${CLAIMS}건)`);
  console.log(`  far_analysis_log  ${logRows.toLocaleString('ko-KR')}행`);
  console.log(`  reball_table      ${reballRows.toLocaleString('ko-KR')}행`);
  console.log('\n실제 데이터가 들어오면 `pnpm tsx scripts/seed-sample.mts --clear`로 비우세요.');
}

if (process.argv.includes('--clear')) clearSample();
else seed();

process.exit(0);
