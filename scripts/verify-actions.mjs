/**
 * 동작 전수 검증 — 배포된 동작을 **실제로 실행해** 의도대로 되는지 확인한다.
 *
 * 정적 점검(pnpm audit:wiring)은 "이어져 있는가"를 본다. 이 도구는 "눌렀을 때 실제로 그 일이
 * 일어나는가"를 본다 — 값이 그 칸에 들어가는지, 여러 칸이 함께 정해지는 값(Reball 단가)이
 * 제대로 갈라져 들어가는지, 대상이 없을 때 제대로 거절하는지. 화면을 열어 누르는 대신 같은
 * 경로(/api/runtime/action)로 부른다.
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

/** 배포된 동작 하나를 찾아, 어떤 컬럼이 어떤 값 소스에서 오는지까지 풀어 준다. */
function findAction(name) {
  const action = spec.actions.find((a) => a.name === name);
  if (!action) throw new Error(`동작 없음: ${name}`);
  const entity = spec.entities.find((e) => e.id === action.config.entityId);
  const sourceByColumn = {};
  for (const [fieldId, src] of Object.entries(action.config.fieldMap ?? {})) {
    const column = entity?.fields.find((f) => f.id === fieldId)?.columnName;
    if (column) sourceByColumn[column] = src;
  }
  return { id: action.id, kind: action.config.kind, table: entity?.tableName, sourceByColumn };
}

async function call(actionId, componentValues = {}, routeParams = {}) {
  const res = await fetch(`${BASE}/api/runtime/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, context: { componentValues, routeParams } }),
  });
  return { status: res.status, body: await res.json() };
}

/**
 * 컬럼별로 넣고 싶은 값을 그 동작이 실제로 읽는 **노드 값**으로 옮긴다.
 *
 * 한 노드가 값 하나만 내는 경우(입력칸)와 객체를 내는 경우(Reball 작업·단가)를 함께 다룬다 —
 * 뒤쪽은 여러 컬럼이 같은 노드의 서로 다른 키를 가리키므로 한 객체에 모아 담아야 한다.
 */
function valuesFor(action, byColumn) {
  const values = {};
  for (const [column, value] of Object.entries(byColumn)) {
    const source = action.sourceByColumn[column];
    if (!source || source.from !== 'component') continue;
    if (source.path) {
      values[source.nodeId] = { ...(values[source.nodeId] ?? {}), [source.path]: value };
    } else {
      values[source.nodeId] = value;
    }
  }
  return values;
}

// ── ① FA 담당자 지정 — 고른 FAR의 모든 sample에 반영되는가 ───────────────────
{
  const action = findAction('FA 담당자 지정');
  const target = db.prepare('SELECT far_no FROM far_table ORDER BY rcv_date DESC LIMIT 1').get()?.far_no;
  if (!target) {
    fail(action.kind + ' FA 담당자 지정', 'far_table이 비어 있어 확인할 수 없다');
  } else {
    const before = db.prepare('SELECT id, name FROM far_table WHERE far_no = ?').all(target);
    const res = await call(action.id, valuesFor(action, { name: MARK }), { sel: target });
    const after = db.prepare('SELECT COUNT(*) AS n FROM far_table WHERE far_no = ? AND name = ?').get(target, MARK).n;
    if (res.body.ok && after === before.length) pass('FA 담당자 지정', `${target} · sample ${after}건 모두 반영`);
    else fail('FA 담당자 지정', `반영 ${after}/${before.length} · ${JSON.stringify(res.body).slice(0, 120)}`);
    cleanups.push(() => {
      const restore = db.prepare('UPDATE far_table SET name = ? WHERE id = ?');
      for (const row of before) restore.run(row.name, row.id);
    });
  }

  // 대상을 고르지 않고 부르면 조용히 0건 처리하지 않고 **거절해야** 한다.
  const res = await call(action.id, valuesFor(action, { name: MARK }), {});
  if (!res.body.ok) pass('FA 담당자 지정(대상 없음)', `거절 — ${res.body.error}`);
  else fail('FA 담당자 지정(대상 없음)', '대상이 없는데도 성공으로 처리했다');
}

// ── ② Reball 의뢰 등록 — 여러 칸이 함께 정해지는 값이 갈라져 들어가는가 ──────
{
  const action = findAction('Reball 의뢰 등록');
  const values = valuesFor(action, {
    far_no: `${MARK}-FAR`,
    export_no: `${MARK}-EX`,
    name: MARK,
    pjt: `${MARK}-PJT`,
    date: '2026-09-30',
    handling: `${MARK} 코멘트`,
    urgent: true,
    is_reball: true,
    is_component_detach: true,
    is_underfill: false,
    is_grinding: false,
    ball_count: 254,
    count: 3,
    per_cost: 60000,
    total_cost: 180000,
  });
  const res = await call(action.id, values);
  const row = db.prepare('SELECT * FROM reball_table WHERE name = ? ORDER BY created_at DESC LIMIT 1').get(MARK);
  const ok =
    res.body.ok &&
    row &&
    row.urgent === 1 &&
    row.is_reball === 1 &&
    row.is_component_detach === 1 &&
    row.is_underfill === 0 &&
    row.ball_count === 254 &&
    row.count === 3 &&
    row.per_cost === 60000 &&
    row.total_cost === 180000 &&
    row.handling === `${MARK} 코멘트`;
  if (ok) pass('Reball 의뢰 등록', `${row.ball_count}ball · 시료 ${row.count}개 · 시료당 ${row.per_cost} · 총액 ${row.total_cost} · 코멘트 저장됨`);
  else fail('Reball 의뢰 등록', `저장된 행: ${JSON.stringify(row)} · ${JSON.stringify(res.body).slice(0, 120)}`);
  cleanups.push(() => db.prepare('DELETE FROM reball_table WHERE name = ?').run(MARK));
}

// ── ③ 내보내기 ──────────────────────────────────────────────────────────────
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
  ['reball_table', `name = '${MARK}'`],
  ['far_table', `name = '${MARK}'`],
].map(([table, where]) => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n]);

console.log(`\n리비전 #${spec.revisionNo} · 동작 ${spec.actions.length}개\n`);
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n통과 ${results.length - failed.length} / ${results.length}`);
const dirty = leftovers.filter(([, n]) => n > 0);
console.log(dirty.length === 0 ? '검증용 데이터 남김 없음 ✅' : `⚠️ 되돌리지 못한 행: ${JSON.stringify(dirty)}`);

db.close();
process.exit(failed.length > 0 || dirty.length > 0 ? 1 : 0);
