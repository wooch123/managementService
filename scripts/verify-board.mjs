/**
 * 게시판(슬랙형 스레드) 전수 검증 — 실제로 글을 쓰고 답글을 달아 의도대로 동작하는지 확인한다.
 *
 * 정적 점검으로는 "답글이 채널에 새어 나오지 않는가" 같은 것을 알 수 없다. 그래서 운영 서버와
 * 같은 경로(`/api/board/posts`)로 직접 부른다.
 *
 * **실제 DB에 쓴다.** 그래서 만든 것은 전부 되돌린다 — 검증이 만든 부모 하나를 지우면 그 스레드의
 * 답글도 함께 사라진다(FK 캐스케이드). 마지막에 남은 것이 있으면 경고한다.
 *
 * 실행: node scripts/verify-board.mjs           (기본 http://127.0.0.1:3000)
 *       VERIFY_BASE=http://localhost:3100 node scripts/verify-board.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const BASE = process.env.VERIFY_BASE ?? 'http://127.0.0.1:3000';
const MARK = '게시판검증';

// 경로는 저장소 위치에서 잡는다(절대 경로를 박으면 다른 PC·OS에서 깨진다).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const resolveFromRoot = (value) => (path.isAbsolute(value) ? value : path.join(ROOT, value));
const META_DB = resolveFromRoot(process.env.META_DB_PATH ?? path.join('prisma', 'meta.db'));

const db = new Database(META_DB);
db.pragma('busy_timeout = 5000');

// 검증할 게시판: 배치된 board 컴포넌트에서 boardKey를 읽는다(없으면 노드 id가 곧 게시판 id다).
const boardNode = db
  .prepare(`SELECT id, propsJson FROM ComponentNode WHERE type = 'board' LIMIT 1`)
  .get();
if (!boardNode) {
  console.error('배치된 게시판 컴포넌트가 없습니다 — 검증할 대상이 없습니다.');
  process.exit(1);
}
const BK = JSON.parse(boardNode.propsJson).boardKey?.trim() || boardNode.id;

const get = async (qs) => (await fetch(`${BASE}/api/board/posts?boardKey=${encodeURIComponent(BK)}&${qs}`)).json();
const post = async (body) =>
  (
    await fetch(`${BASE}/api/board/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardKey: BK, title: '', ...body }),
    })
  ).json();

const results = [];
const pass = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => results.push({ ok: false, name, detail });
const check = (name, condition, detail) => (condition ? pass(name, detail) : fail(name, detail));

// ── 1) 채널 메시지 하나를 만든다 ─────────────────────────────────────────────
const root = await post({ content: `${MARK} 부모 메시지`, author: MARK });
check('채널 메시지 저장', root.ok && root.data?.parentId === null, root.error?.message ?? `id=${root.data?.id}`);
if (!root.ok) {
  console.error('부모 메시지를 만들지 못해 나머지를 건너뜁니다.');
  process.exit(1);
}
const rootId = root.data.id;

// ── 2) 답글 두 개 ────────────────────────────────────────────────────────────
const r1 = await post({ content: `${MARK} 답글 하나`, author: `${MARK}A`, parentId: rootId });
const r2 = await post({ content: `${MARK} 답글 둘`, author: `${MARK}B`, parentId: rootId });
check('답글 저장', r1.ok && r2.ok && r1.data?.parentId === rootId, `parentId=${r1.data?.parentId}`);

// ── 3) 답글은 채널에 끼어들지 않는다(스레드를 쓰는 이유) ──────────────────────
const channel = await get('limit=30');
const leaked = channel.data.items.filter((m) => m.id === r1.data?.id || m.id === r2.data?.id);
check('답글이 채널에 새어 나오지 않음', leaked.length === 0, `새어 나온 답글 ${leaked.length}건`);

// ── 4) 부모에 스레드 요약이 붙는다 ───────────────────────────────────────────
const parentInChannel = channel.data.items.find((m) => m.id === rootId);
check('스레드 요약 — 답글 수', parentInChannel?.thread?.replyCount === 2, JSON.stringify(parentInChannel?.thread));
check(
  '스레드 요약 — 참여자는 답글 단 순서',
  JSON.stringify(parentInChannel?.thread?.participants) === JSON.stringify([`${MARK}A`, `${MARK}B`]),
  JSON.stringify(parentInChannel?.thread?.participants)
);

// ── 5) 스레드 조회 ───────────────────────────────────────────────────────────
const thread = await get(`threadOf=${rootId}`);
check('스레드 조회', thread.ok && thread.data.parent.id === rootId && thread.data.items.length === 2, `답글 ${thread.data?.items?.length}건`);

// ── 6) 답글 id로 열어도 같은 스레드가 나온다(검색 결과에서 바로 들어오는 경로) ─
const viaReply = await get(`threadOf=${r1.data.id}`);
check('답글 id로 스레드 열기', viaReply.ok && viaReply.data.parent.id === rootId, `parent=${viaReply.data?.parent?.id}`);

// ── 7) 답글에 답글을 달아도 깊이는 한 단계 ───────────────────────────────────
const r3 = await post({ content: `${MARK} 답글의 답글`, author: `${MARK}C`, parentId: r1.data.id });
check('스레드 깊이 1단계 고정', r3.ok && r3.data?.parentId === rootId, `parentId=${r3.data?.parentId}`);

// ── 8) 스레드 증분 폴링 — 커서 뒤의 답글만 ───────────────────────────────────
const incremental = await get(`threadOf=${rootId}&after=${r2.data.id}`);
check(
  '스레드 증분 폴링',
  incremental.ok && incremental.data.incremental && incremental.data.items.length === 1 && incremental.data.items[0].id === r3.data.id,
  `${incremental.data?.items?.length}건`
);

// ── 9) 채널 폴링이 "스레드가 바뀌었다"를 함께 알린다 ─────────────────────────
const poll = await get(`after=${rootId}`);
check('폴링이 스레드 변화를 알림', poll.data?.threadUpdates?.[rootId]?.replyCount === 3, JSON.stringify(poll.data?.threadUpdates?.[rootId]));

// ── 10) 검색은 스레드 안까지 훑고, 어느 스레드인지 알려 준다 ─────────────────
const found = await get(`q=${encodeURIComponent(`${MARK} 답글 하나`)}&limit=10`);
const hit = found.data?.items?.find((h) => h.id === r1.data.id);
check('검색이 답글도 찾음', Boolean(hit), `${found.data?.items?.length ?? 0}건`);
check('검색 결과가 스레드를 가리킴', hit?.parentId === rootId, `parentId=${hit?.parentId}`);

// ── 11) 없는 부모에는 답글을 달 수 없다 ──────────────────────────────────────
const orphan = await post({ content: 'x', author: MARK, parentId: 'no-such-parent-id' });
check('없는 부모 거절', !orphan.ok && orphan.error?.code === 'NOT_FOUND', orphan.error?.code ?? '거절되지 않음');

// ── 12) 부모를 지우면 답글도 함께 사라진다 ───────────────────────────────────
db.prepare('DELETE FROM BoardPost WHERE id = ?').run(rootId);
const orphanReplies = db.prepare('SELECT COUNT(*) c FROM BoardPost WHERE parentId = ?').get(rootId).c;
check('부모 삭제 시 답글도 함께 삭제', orphanReplies === 0, `남은 답글 ${orphanReplies}건`);

// ── 뒷정리 확인 ──────────────────────────────────────────────────────────────
const leftovers = db.prepare(`SELECT COUNT(*) c FROM BoardPost WHERE author LIKE ?`).get(`${MARK}%`).c;
if (leftovers > 0) {
  db.prepare(`DELETE FROM BoardPost WHERE author LIKE ?`).run(`${MARK}%`);
  console.warn(`검증이 만든 글 ${leftovers}건이 남아 있어 지웠습니다.`);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✔' : '  ✘'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n통과 ${results.length - failed.length} / ${results.length}`);
process.exit(failed.length ? 1 : 0);
