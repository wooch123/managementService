import 'server-only';
import Database from 'better-sqlite3';
import { appDbPath } from '@/lib/db/paths';
import { assertSqliteDb } from '@/lib/db/assert-db';

let instance: Database.Database | null = null;

export function getAppDb(): Database.Database {
  if (instance) return instance;
  // 열기 전에 파일이 진짜 있는지 본다. 없으면 better-sqlite3가 말없이 빈 DB를 만들고,
  // 그다음부터 "no such table" 로 깨진다 — 원인이 파일 부재라는 게 보이지 않는다.
  // (DB를 처음 만드는 `pnpm db:init`은 이 함수를 거치지 않으므로 영향받지 않는다.)
  assertSqliteDb(appDbPath(), 'app');
  instance = new Database(appDbPath());
  instance.pragma('journal_mode = WAL');
  // 여러 워커 프로세스가 동시에 쓰면 순간적으로 잠금이 겹친다. 바로 실패시키지 않고 기다린다
  // (cluster 모드로 띄우면서 필요해졌다 — 단일 프로세스일 때는 없어도 문제가 없었다).
  instance.pragma('busy_timeout = 5000');
  instance.pragma('foreign_keys = ON');
  return instance;
}

/** 배포 실패 롤백(§2.3)이 백업 파일로 app.db를 통째로 덮어쓰기 전에 반드시 호출한다 —
 * better-sqlite3는 파일 핸들을 계속 들고 있어서, 연 채로 파일을 교체하면 다음 쿼리부터
 * 깨진 상태를 참조하게 된다. 다음 getAppDb() 호출이 새 파일로 다시 연결한다. */
export function closeAppDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
