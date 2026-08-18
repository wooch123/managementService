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
