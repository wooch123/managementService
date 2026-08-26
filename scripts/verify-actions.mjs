/**
 * 액션 전수 검증 — 배포된 액션을 **실제로 실행해** 의도대로 동작하는지 확인한다.
 *
 * 정적 점검(pnpm audit:wiring)은 "이어져 있는가"를 본다. 이 도구는 "눌렀을 때 실제로 그 일이
 * 일어나는가"를 본다 — 자동 번호가 붙는지, 후속 갱신이 따라오는지, 대상이 없을 때 제대로
 * 거절하는지. 화면을 열어 서른세 번 누르는 대신 같은 경로(/api/runtime/action)로 부른다.
 *
 * **실제 운영 DB를 건드린다.** 그래서 검증이 만든 행은 전부 되돌린다 — 저장은 지우고, 갱신은
 * 원래 값으로 되돌린다. 되돌리지 못한 것이 있으면 마지막에 경고한다.
 *
 * 실행: node scripts/verify-actions.mjs  (운영 서버가 떠 있어야 한다)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.VERIFY_BASE ?? 'http://127.0.0.1:3000';
const MARK = '검증용';

// 경로는 저장소 위치에서 잡는다(절대 경로를 박으면 다른 PC·OS에서 깨진다).
// src/lib/db/paths.ts와 같은 기본값을 쓰고, 환경변수 재정의도 그대로 따른다.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const resolveFromRoot = (value) => (path.isAbsolute(value) ? value : path.join(ROOT, value));
const APP_DB = resolveFromRoot(process.env.APP_DB_PATH ?? path.join('data', 'app.db'));
const META_DB = resolveFromRoot(process.env.META_DB_PATH ?? path.join('prisma', 'meta.db'));

const db = new Database(APP_DB);
const prisma = new PrismaClient({ datasourceUrl: `file:${META_DB}` });
const deployment = await prisma.deployment.findUnique({ where: { id: 'singleton' } });
const revision = await prisma.revision.findUnique({ where: { id: deployment.activeRevisionId } });
const spec = JSON.parse(revision.specJson);
await prisma.$disconnect();

const results = [];
const cleanups = [];
const pass = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => results.push({ ok: false, name, detail });

function findAction(name) {
  const action = spec.actions.find((a) => a.name === name);
  if (!action) throw new Error(`액션 없음: ${name}`);
  const entity = spec.entities.find((e) => e.id === action.config.entityId);
  const nodeByCol = {};
  for (const [fieldId, src] of Object.entries(action.config.fieldMap ?? {})) {
    const column = entity?.fields.find((f) => f.id === fieldId)?.columnName;
    if (column) nodeByCol[column] = src;
  }
  return { id: action.id, kind: action.config.kind, table: entity?.tableName, nodeByCol };
}

async function call(actionId, componentValues = {}, routeParams = {}) {
  const res = await fetch(`${BASE}/api/runtime/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, context: { componentValues, routeParams } }),
  });
  return { status: res.status, body: await res.json() };
}

/** 컴포넌트 값 맵을 만든다 — 액션이 실제로 읽는 노드 id에 값을 넣는다. */
function valuesFor(action, byColumn) {
  const values = {};
  for (const [column, value] of Object.entries(byColumn)) {
    const source = action.nodeByCol[column];
    if (!source || source.from !== 'component') continue;
    values[source.nodeId] = value;
  }
  return values;
}

// ── CREATE 액션: 저장되고 자동 번호가 붙는지 ─────────────────────────────────
const createCases = [
  {
    name: 'FA 담당자 배정',
    route: { sel: 'FAR-23-2475' },
    values: { assignee: MARK, due_date: '2026-09-30', priority: '보통', note: MARK },
    expect: { prefix: 'ASG-', keyColumn: 'assign_no', where: "assignee = '검증용'" },
    // 후속 액션이 Claim 원장까지 바꾼다
    follow: { table: 'claims', key: 'far_no', value: 'FAR-23-2475', column: 'claim_status', expected: '배정' },
  },
  {
    name: 'FA 인수인계 등록',
    route: { sel: 'FAR-23-2475' },
    values: { assignee: MARK, prev_assignee: '이전담당', due_date: '2026-09-30', priority: '높음', note: MARK },
    expect: { prefix: 'ASG-', keyColumn: 'assign_no', where: "assignee = '검증용'" },
    follow: { table: 'claims', key: 'far_no', value: 'FAR-23-2475', column: 'owner', expected: MARK },
  },
  {
    name: 'Tech Report 검토 요청',
    route: { sel: 'FAR-23-2475' },
    values: { author: MARK, ng_location: 'NAND Die #1', fail_mode: 'Init Fail', observation: MARK, root_cause: MARK, conclusion: MARK, to_dev_lab: 'N' },
    expect: { prefix: 'FTR-', keyColumn: 'report_no', where: "author = '검증용'" },
  },
  {
    name: 'Reball 의뢰 등록',
    route: { sel: 'FAR-23-2475' },
    values: { requester: MARK, qty: '5', package_type: 'BGA153', vendor: '협력사 A', out_date: '2026-09-01', in_date: '2026-09-10', work_note: MARK },
    expect: { prefix: 'RB-', keyColumn: 'request_no', where: "requester = '검증용'" },
  },
  {
    name: 'Tip 등록',
    values: { title: `${MARK} 임시 글`, category: '기타', author: MARK, tags: MARK, content: MARK },
    expect: { prefix: 'TIP-', keyColumn: 'post_no', where: "author = '검증용'" },
  },
  ...['개발실 상세분석', 'Auto향 이력 확인', 'DRAM 분석', 'pFA(비파괴)', 'pFA(파괴)'].map((type) => ({
    name: `${type} 의뢰 등록`,
    values: {
      far_no: 'FAR-23-2475',
      requester: MARK,
      due_date: '2026-09-30',
      priority: '보통',
      content: MARK,
      analysis_scope: MARK,
      sample_qty: '2',
      preserve_cond: MARK,
      lot_no: MARK,
      vehicle_project: MARK,
      dram_model: MARK,
      destruct_approval: '승인 대기',
    },
    expect: { prefix: 'REQ-', keyColumn: 'request_no', where: "requester = '검증용'" },
  })),
];

for (const testCase of createCases) {
  const action = findAction(testCase.name);
  const before = testCase.follow
    ? db.prepare(`SELECT * FROM ${testCase.follow.table} WHERE ${testCase.follow.key} = ?`).get(testCase.follow.value)
    : null;
  const res = await call(action.id, valuesFor(action, testCase.values), testCase.route ?? {});
  if (!res.body.ok) {
    fail(testCase.name, `실행 실패: ${res.body.error}`);
    continue;
  }
  const row = db.prepare(`SELECT * FROM ${action.table} WHERE ${testCase.expect.where} ORDER BY created_at DESC LIMIT 1`).get();
  if (!row) {
    fail(testCase.name, '저장된 행을 찾지 못함');
    continue;
  }
  const number = row[testCase.expect.keyColumn];
  if (!String(number).startsWith(testCase.expect.prefix)) {
    fail(testCase.name, `자동 번호 형식이 다름: ${number}`);
  } else if (testCase.follow) {
    const after = db.prepare(`SELECT * FROM ${testCase.follow.table} WHERE ${testCase.follow.key} = ?`).get(testCase.follow.value);
    if (after[testCase.follow.column] !== testCase.follow.expected) {
      fail(testCase.name, `후속 갱신 안 됨: ${testCase.follow.column}=${after[testCase.follow.column]}`);
    } else {
      pass(testCase.name, `${number} 저장 · 후속으로 ${testCase.follow.table}.${testCase.follow.column} → ${testCase.follow.expected}`);
    }
  } else {
    pass(testCase.name, `${number} 저장`);
  }
  cleanups.push(() => db.prepare(`DELETE FROM ${action.table} WHERE ${testCase.expect.where}`).run());
  if (testCase.follow && before) {
    const { table, key, value } = testCase.follow;
    const columns = Object.keys(before).filter((c) => c !== 'id');
    cleanups.push(() =>
      db
        .prepare(`UPDATE ${table} SET ${columns.map((c) => `"${c}" = ?`).join(', ')} WHERE ${key} = ?`)
        .run(...columns.map((c) => before[c]), value)
    );
  }
}

// ── UPDATE 액션: 업무 키로 찾아 바꾸는지, 대상이 없으면 거절하는지 ────────────
const updateCases = [
  { name: 'Claim 담당자 변경', table: 'claims', key: 'far_no', target: 'FAR-23-2475', values: { owner: MARK }, column: 'owner' },
  { name: 'Claim 진행상태 변경', table: 'claims', key: 'far_no', target: 'FAR-23-2475', values: { claim_status: '보류' }, column: 'claim_status' },
  { name: 'Reball 진행 단계 반영', table: 'reball_requests', key: 'request_no', target: 'RB-260001', values: { reball_status: '작업중' }, column: 'reball_status' },
  ...['개발실 상세분석', 'Auto향 이력 확인', 'DRAM 분석', 'pFA(비파괴)', 'pFA(파괴)'].map((type) => ({
    name: `${type} 결과 등록`,
    table: 'analysis_requests',
    key: 'request_no',
    target: null, // 유형별로 실제 존재하는 의뢰를 찾아 쓴다
    typeValue: type,
    values: { result_summary: MARK, req_status: '진행중' },
    column: 'result_summary',
  })),
];

for (const testCase of updateCases) {
  const action = findAction(testCase.name);
  const target =
    testCase.target ??
    db.prepare(`SELECT request_no FROM analysis_requests WHERE request_type = ? LIMIT 1`).get(testCase.typeValue)?.request_no;
  if (!target) {
    fail(testCase.name, '검증 대상 행을 찾지 못함');
    continue;
  }
  const before = db.prepare(`SELECT * FROM ${testCase.table} WHERE ${testCase.key} = ?`).get(target);
  const res = await call(action.id, valuesFor(action, testCase.values), { sel: target });
  if (!res.body.ok) {
    fail(testCase.name, `실행 실패: ${res.body.error}`);
    continue;
  }
  const after = db.prepare(`SELECT * FROM ${testCase.table} WHERE ${testCase.key} = ?`).get(target);
  const expected = testCase.values[testCase.column];
  if (after[testCase.column] !== expected) {
    fail(testCase.name, `값이 바뀌지 않음: ${testCase.column}=${after[testCase.column]}`);
  } else {
    pass(testCase.name, `${target} · ${testCase.column} → ${expected}`);
  }
  const columns = Object.keys(before).filter((c) => c !== 'id');
  cleanups.push(() =>
    db
      .prepare(`UPDATE ${testCase.table} SET ${columns.map((c) => `"${c}" = ?`).join(', ')} WHERE ${testCase.key} = ?`)
      .run(...columns.map((c) => before[c]), target)
  );

  // 대상이 없을 때 거절하는지 — 조용히 0건 갱신하고 "저장됨"이라 알리면 안 된다.
  const empty = await call(action.id, valuesFor(action, testCase.values), {});
  if (empty.body.ok) fail(`${testCase.name} (빈 선택)`, '선택 없이도 성공으로 응답함');
  else pass(`${testCase.name} (빈 선택)`, '거절함');
}

// ── COMPOSITE: 이력과 단계가 함께 움직이는지 ─────────────────────────────────
{
  const action = findAction('Reball 진행 이력 등록'); // 스텝의 노드를 빌리기 위해
  const composite = spec.actions.find((a) => a.name === 'Reball 상태 업데이트');
  const target = 'RB-260002';
  const before = db.prepare('SELECT * FROM reball_requests WHERE request_no = ?').get(target);
  const values = valuesFor(action, { update_type: '완료', update_date: '2026-08-19', worker: MARK, note: MARK });
  const res = await call(composite.id, values, { sel: target });
  const after = db.prepare('SELECT reball_status FROM reball_requests WHERE request_no = ?').get(target);
  const history = db.prepare("SELECT update_type FROM reball_updates WHERE request_no = ? AND worker = '검증용' ORDER BY created_at DESC LIMIT 1").get(target);
  if (!res.body.ok) fail('Reball 상태 업데이트', `실행 실패: ${res.body.error}`);
  else if (!history) fail('Reball 상태 업데이트', '이력이 남지 않음');
  else if (after.reball_status !== '완료') fail('Reball 상태 업데이트', `단계가 반영되지 않음: ${after.reball_status}`);
  else pass('Reball 상태 업데이트', `이력(${history.update_type}) + 단계 → 완료`);
  cleanups.push(() => db.prepare("DELETE FROM reball_updates WHERE worker = '검증용'").run());
  cleanups.push(() => db.prepare('UPDATE reball_requests SET reball_status = ? WHERE request_no = ?').run(before.reball_status, target));
}

// ── NAVIGATE / EXPORT_CSV ───────────────────────────────────────────────────
for (const action of spec.actions.filter((a) => a.config.kind === 'NAVIGATE')) {
  const res = await call(action.id);
  const effect = res.body.effects?.find((e) => e.type === 'navigate');
  if (res.body.ok && effect) pass(action.name, `→ /home/${effect.slug}`);
  else fail(action.name, `이동 효과 없음: ${JSON.stringify(res.body)}`);
}
for (const action of spec.actions.filter((a) => a.config.kind === 'EXPORT_CSV')) {
  const res = await call(action.id);
  const csv = res.body.data?.csv;
  if (res.body.ok && typeof csv === 'string' && csv.split('\n').length > 1) {
    pass(action.name, `${csv.split('\n').length - 1}행 생성`);
  } else {
    fail(action.name, 'CSV가 비어 있음');
  }
}

// ── 되돌리기 ────────────────────────────────────────────────────────────────
for (const cleanup of cleanups.reverse()) cleanup();
const leftovers = [
  ['fa_assignments', "assignee = '검증용'"],
  ['fa_tech_reports', "author = '검증용'"],
  ['reball_requests', "requester = '검증용'"],
  ['reball_updates', "worker = '검증용'"],
  ['analysis_requests', "requester = '검증용'"],
  ['tips', "author = '검증용'"],
  ['claims', "owner = '검증용'"],
].map(([table, where]) => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n]);

console.log(`\n리비전 #${spec.revisionNo} · 액션 ${spec.actions.length}개\n`);
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n통과 ${results.length - failed.length} / ${results.length}`);
const dirty = leftovers.filter(([, n]) => n > 0);
console.log(dirty.length === 0 ? '검증용 데이터 남김 없음 ✅' : `⚠️ 되돌리지 못한 행: ${JSON.stringify(dirty)}`);

db.close();
process.exit(failed.length > 0 || dirty.length > 0 ? 1 : 0);
