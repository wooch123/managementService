/**
 * 받은 저장소를 이 PC에서 바로 띄울 수 있게 준비한다.
 *
 * 설계(prisma/meta.db)와 업무 데이터(data/app.db), 게시판 첨부(data/uploads)는 저장소에 함께
 * 들어 있으므로 여기서는 **저장소에 담을 수 없는 것**만 만든다.
 *
 *   · `.env.local` — 세션 서명 키. 비밀이라 저장소에 넣지 않는다(넣으면 남이 세션을 위조할 수 있다).
 *     없으면 이 PC 전용으로 무작위 키를 만든다.
 *   · Prisma 클라이언트 — node_modules 안에 생성되는 산출물이라 저장소에 없다.
 *   · `data/logs` 같은 빈 폴더 — git은 빈 폴더를 담지 못한다.
 *
 * 실행: pnpm setup:local
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const steps = [];

// ── 1) 세션 키
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath) && /SESSION_SECRET=.+/.test(fs.readFileSync(envPath, 'utf-8'))) {
  steps.push('.env.local — 이미 있음(그대로 둔다)');
} else {
  // iron-session은 32자 이상을 요구한다.
  const secret = crypto.randomBytes(32).toString('base64url');
  fs.appendFileSync(envPath, `${fs.existsSync(envPath) ? '\n' : ''}SESSION_SECRET=${secret}\n`, 'utf-8');
  steps.push('.env.local — 이 PC 전용 세션 키를 새로 만들었다');
}

// ── 2) 빈 폴더
for (const dir of ['data/logs', 'data/backups', 'data/uploads/board']) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    steps.push(`${dir} — 만들었다`);
  }
}

// ── 2-b) git 훅 — DB를 커밋하기 전에 WAL을 본체에 접어 넣게 한다.
//
// 이 저장소는 설계·업무 DB를 함께 담는 것이 요점인데, WAL 모드라 최근 변경이 `*.db-wal`에만
// 남아 있는 채로 커밋되면 본체만 올라간다(실제로 리비전 하나가 그렇게 누락됐다). 훅은
// 저장소에 담기지 않는 .git/hooks 대신 .githooks/에 두고, 여기서 그 경로를 가리키게 한다.
try {
  const current = execSync('git config core.hooksPath', { cwd: root, stdio: 'pipe' }).toString().trim();
  if (current === '.githooks') steps.push('git 훅 — 이미 켜져 있음');
  else throw new Error('not set');
} catch {
  try {
    execSync('git config core.hooksPath .githooks', { cwd: root, stdio: 'pipe' });
    steps.push('git 훅 — 켰다(커밋 전 DB 체크포인트)');
  } catch {
    steps.push('git 훅 — 켜지 못했다(git 저장소가 아닐 수 있다). DB를 커밋하기 전에 `pnpm db:checkpoint`를 직접 실행할 것');
  }
}

// ── 3) 데이터가 실제로 들어왔는지
const checks = [
  ['prisma/meta.db', '설계(페이지·컴포넌트·액션·리비전)와 게시판'],
  ['data/app.db', '업무 데이터(Claim·FA·Reball·의뢰·Tip)'],
];
let missing = false;
for (const [file, what] of checks) {
  const full = path.join(root, file);
  const problem = checkSqlite(full);
  if (problem) {
    steps.push(`${file} — ${problem} (${what})`);
    missing = true;
  } else {
    steps.push(`${file} — ${(fs.statSync(full).size / 1024 / 1024).toFixed(1)}MB · ${what}`);
  }
}

/**
 * 있는지만 보면 모자란다. SQLite는 없는 파일을 열라면 **말없이 빈 DB를 만들기** 때문에, 한 번
 * 잘못 띄우고 나면 0바이트짜리 meta.db가 남는다. 그 뒤로는 파일이 '있으니' existsSync는
 * 통과하고 앱만 `The table main.Revision does not exist`로 계속 깨진다 — 원인을 찾기 어려운
 * 쪽이라 크기와 머리글까지 본다(실제로 이 오류가 보고됐다).
 */
function checkSqlite(full) {
  if (!fs.existsSync(full)) return '없음!';
  if (fs.statSync(full).size === 0) return '비어 있음(0바이트)! 앞선 실행이 만들어 둔 빈 파일이다';
  const head = Buffer.alloc(15);
  const fd = fs.openSync(full, 'r');
  try {
    fs.readSync(fd, head, 0, 15, 0);
  } finally {
    fs.closeSync(fd);
  }
  return head.toString('latin1') === 'SQLite format 3' ? null : 'SQLite 파일이 아님(깨졌을 수 있다)!';
}

// ── 4) Prisma 클라이언트
try {
  execSync('pnpm prisma generate', { cwd: root, stdio: 'pipe' });
  steps.push('Prisma 클라이언트 — 생성했다');
} catch {
  // 서버가 떠 있으면 엔진 DLL이 잠겨 실패한다(그래도 타입은 대개 만들어진다).
  steps.push('Prisma 클라이언트 — 생성 실패(서버가 떠 있으면 잠깁니다. 멈춘 뒤 `pnpm prisma generate`)');
}

console.log('\n준비 결과');
for (const step of steps) console.log(`  · ${step}`);
console.log(
  missing
    ? `\n데이터 파일에 문제가 있습니다. 저장소에 함께 들어 있는 파일이니 되돌리세요:
  git checkout -- prisma/meta.db data/app.db

빈 파일(0바이트)이 남아 있다면 그것부터 지워야 합니다 — 파일이 '있는' 상태라서
앱은 뜨지만 모든 질의가 "The table main.Revision does not exist"로 깨집니다.`
    : `\n이제 실행하면 됩니다:
  pnpm dev                     개발 서버 → http://localhost:3000/home
  pnpm build && pnpm start     운영 모드

관리자: http://localhost:3000/admin (admin / 123456 — 받은 뒤 반드시 바꾸세요: pnpm admin:password)`
);
