import path from 'node:path';

/**
 * DB 파일 경로를 한 곳에서 정한다. 기본값은 저장소 표준 위치(`prisma/meta.db`, `data/app.db`)이고,
 * 환경변수로 갈아끼울 수 있다 — **E2E가 운영 설계 데이터를 건드리지 못하게 하는 격리 지점**이다
 * (실제로 옛 E2E 테스트가 운영 페이지의 slug를 덮어쓴 사고가 있었다, PROGRESS.md P9 참고).
 *
 * `server-only`를 붙이지 않는다: `prisma/seed.ts`, `src/lib/db/init-app-db.ts`, E2E global setup처럼
 * Next.js 번들 밖에서 tsx로 실행되는 스크립트도 같은 경로 규칙을 써야 하기 때문이다.
 */

function resolveFromCwd(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

/** 메타 DB(설계 데이터) 파일 경로. 재정의: `META_DB_PATH` */
export function metaDbPath(): string {
  return resolveFromCwd(process.env.META_DB_PATH ?? path.join('prisma', 'meta.db'));
}

/** Prisma datasource용 URL. 상대경로 해석 차이를 없애려고 항상 절대경로로 만든다. */
export function metaDbUrl(): string {
  return `file:${metaDbPath()}`;
}

/** 운영 DB(관리자가 설계한 테이블) 파일 경로. 재정의: `APP_DB_PATH` */
export function appDbPath(): string {
  return resolveFromCwd(process.env.APP_DB_PATH ?? path.join('data', 'app.db'));
}
