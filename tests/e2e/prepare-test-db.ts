import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

/**
 * E2E 전용 DB를 매 실행마다 새로 만든다.
 *
 * 예전에는 테스트가 운영과 **같은** `prisma/meta.db` / `data/app.db`를 썼다. 그 상태에서 P2 시절
 * 작성된 테스트가 하드코딩한 페이지 이름으로 실제 서비스 페이지를 집어 slug를 덮어써버린 사고가
 * 있었다(PROGRESS.md P9). 이제 테스트는 `prisma/test-meta.db`/`data/test-app.db`만 보고,
 * 그 경로는 playwright.config.ts의 webServer.env가 dev 서버에 주입한다.
 *
 * 실행 시점: dev 서버가 뜨기 전(webServer.command 앞단). 스키마는 `prisma/migrations` 하위의 각 `migration.sql`을 순서대로 적용해 만든다 — `prisma migrate deploy`는
 * schema.prisma에 적힌 datasource URL(운영 meta.db)을 그대로 쓰기 때문에 여기서는 쓸 수 없고,
 * 마이그레이션 SQL 자체가 스키마의 단일 진실 공급원이라 결과는 동일하다.
 */

const ROOT = process.cwd();
export const TEST_META_DB = path.join(ROOT, 'prisma', 'test-meta.db');
export const TEST_APP_DB = path.join(ROOT, 'data', 'test-app.db');

function removeSqliteFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${file}${suffix}`, { force: true });
  }
}

function applyMigrations(db: Database.Database): number {
  const dir = path.join(ROOT, 'prisma', 'migrations');
  const folders = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // 폴더명이 타임스탬프 접두사라 사전순 = 적용순

  for (const folder of folders) {
    const sqlPath = path.join(dir, folder, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    db.exec(fs.readFileSync(sqlPath, 'utf-8'));
  }
  return folders.length;
}

async function seedAdmin(db: Database.Database): Promise<void> {
  // 로그인만 되면 되는 최소 시드 — 페이지·엔티티 같은 설계 데이터는 각 테스트가 직접 만든다.
  const passwordHash = await bcrypt.hash('123456', 10);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO "AdminUser" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)'
  ).run('e2e-admin', 'admin', passwordHash, now, now);
  db.prepare('INSERT INTO "Deployment" ("id", "activeRevisionId", "updatedAt") VALUES (?, ?, ?)').run(
    'singleton',
    null,
    now
  );
}

export async function prepareTestDatabases(): Promise<void> {
  removeSqliteFiles(TEST_META_DB);
  removeSqliteFiles(TEST_APP_DB);
  fs.mkdirSync(path.dirname(TEST_APP_DB), { recursive: true });

  const meta = new Database(TEST_META_DB);
  meta.pragma('journal_mode = WAL');
  const applied = applyMigrations(meta);
  await seedAdmin(meta);
  meta.close();

  const app = new Database(TEST_APP_DB);
  app.pragma('journal_mode = WAL');
  app.pragma('foreign_keys = ON');
  app.close();

  console.log(`[e2e] 테스트 DB 준비 완료 — 마이그레이션 ${applied}개 적용`);
  console.log(`[e2e]   meta: ${TEST_META_DB}`);
  console.log(`[e2e]   app : ${TEST_APP_DB}`);
}

// playwright.config.ts의 webServer.command가 dev 서버보다 **먼저** 이 파일을 tsx로 실행한다.
// globalSetup으로 두면 안 된다 — Playwright는 webServer를 globalSetup보다 먼저 띄우기 때문에,
// 그 시점에 테이블이 없는 DB를 보고 서버가 500(P2021)을 반환해 기동 대기에서 타임아웃난다.
// (tsx가 CJS로 트랜스파일해서 top-level await은 쓸 수 없다 — then/catch로 처리한다.)
prepareTestDatabases().catch((err) => {
  console.error('[e2e] 테스트 DB 준비 실패:', err);
  process.exit(1);
});
