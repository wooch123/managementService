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

// ── 3) 데이터가 실제로 들어왔는지
const checks = [
  ['prisma/meta.db', '설계(페이지·컴포넌트·액션·리비전)와 게시판'],
  ['data/app.db', '업무 데이터(Claim·FA·Reball·의뢰·Tip)'],
];
let missing = false;
for (const [file, what] of checks) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) {
    steps.push(`${file} — ${(fs.statSync(full).size / 1024 / 1024).toFixed(1)}MB · ${what}`);
  } else {
    steps.push(`${file} — 없음! ${what}가 빠졌다`);
    missing = true;
  }
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
    ? '\n데이터 파일이 빠졌습니다. 저장소를 다시 받아 주세요.'
    : `\n이제 실행하면 됩니다:
  pnpm dev                     개발 서버 → http://localhost:3000/home
  pnpm build && pnpm start     운영 모드

관리자: http://localhost:3000/admin (admin / 123456 — 받은 뒤 반드시 바꾸세요: pnpm admin:password)`
);
