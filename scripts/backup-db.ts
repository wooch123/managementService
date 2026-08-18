// §13.3 "app.db와 meta.db를 매일 03:00에 data/backups/로 복사" — deploy/backup.ps1이 이 스크립트를
// 호출한다. better-sqlite3의 온라인 백업 API(db.backup())를 써서, 앱이 pm2로 계속 실행 중이라
// 파일이 열려 있는 상태에서도 안전하게(WAL 재생까지 포함해) 스냅샷을 뜬다 — 단순 파일 복사와
// 달리 백업 도중 쓰기가 섞여도 일관된 상태가 보장된다.
//
// prisma/seed.ts와 같은 이유로(§ PROGRESS.md P4) data-engine의 `import 'server-only'` 모듈들을
// 거치지 않고 better-sqlite3를 직접 연다 — 이 스크립트는 tsx로 실행되고 Next.js 번들러 밖이다.
import path from 'node:path';
import { appDbPath, metaDbPath } from '../src/lib/db/paths';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const RETENTION_DAYS = 30;

const TARGETS = [
  { label: 'app', src: appDbPath() },
  { label: 'meta', src: metaDbPath() },
];

async function backupOne(label: string, srcPath: string, ts: string) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`[backup] 건너뜀 — 파일이 없습니다: ${srcPath}`);
    return;
  }
  const dest = path.join(BACKUP_DIR, `${label}-${ts}.db`);
  const db = new Database(srcPath, { readonly: true });
  try {
    await db.backup(dest);
    console.log(`[backup] ${label} → ${dest}`);
  } finally {
    db.close();
  }
}

function pruneOld() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(full);
    if (stat.isFile() && stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log(`[backup] ${RETENTION_DAYS}일 지나 삭제: ${file}`);
    }
  }
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  for (const t of TARGETS) {
    await backupOne(t.label, t.src, ts);
  }
  pruneOld();
}

main().catch((err) => {
  console.error('[backup] 실패:', err);
  process.exit(1);
});
