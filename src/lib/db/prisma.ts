import 'server-only';
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** datasource URL을 코드에서 명시한다 — schema.prisma의 상대경로(`file:./meta.db`)는 스키마
 * 파일 기준이라 실행 위치에 따라 흔들리고, E2E처럼 다른 DB 파일로 갈아끼울 방법도 없다. */
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: metaDbUrl() });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 워커를 여러 개 띄우면 같은 파일을 여러 프로세스가 함께 쓴다. WAL로 읽기와 쓰기가 서로를 막지
// 않게 하고, 잠금이 겹칠 때는 즉시 실패 대신 잠깐 기다리게 한다. 실패해도 앱은 그대로 뜬다.
void prisma
  .$executeRawUnsafe('PRAGMA journal_mode = WAL')
  .then(() => prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000'))
  .catch(() => undefined);
