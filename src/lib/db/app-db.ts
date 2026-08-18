import 'server-only';
import Database from 'better-sqlite3';
import { appDbPath } from '@/lib/db/paths';

let instance: Database.Database | null = null;

export function getAppDb(): Database.Database {
  if (instance) return instance;
  instance = new Database(appDbPath());
  instance.pragma('journal_mode = WAL');
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
