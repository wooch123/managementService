import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { getAppDb, closeAppDb } from '@/lib/db/app-db';
import { appDbPath } from '@/lib/db/paths';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

/** §2.3 3단계 — app.db 백업. WAL 모드에서는 커밋된 데이터 일부가 -wal 파일에만 있을 수 있어,
 * 체크포인트로 메인 파일에 먼저 병합한 뒤 복사해야 백업 파일 하나만으로 온전한 스냅샷이 된다. */
export function backupAppDb(revisionNo: number): string {
  getAppDb().pragma('wal_checkpoint(TRUNCATE)');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `app-${revisionNo}-${Date.now()}.db`);
  fs.copyFileSync(appDbPath(), backupPath);
  return backupPath;
}

/** 배포 실패 시 §2.3 롤백 — 열려 있는 커넥션을 먼저 닫아야 파일 교체가 안전하다. */
export function restoreAppDb(backupPath: string): void {
  closeAppDb();
  fs.copyFileSync(backupPath, appDbPath());
}
