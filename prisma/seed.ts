import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { appDbPath, metaDbUrl } from '../src/lib/db/paths';

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

/**
 * app.db에 직접 연결한다(src/lib/data-engine 산출물을 재사용하지 않는 이유: 이 파일들은
 * top-level에 `import 'server-only'`가 있고, 그 패키지는 Next.js 번들러가 내부적으로만
 * 제공한다 — seed.ts는 tsx로 Next 바깥에서 실행되므로 그 import가 해석되지 않는다).
 * P4부터 엔티티/필드 CRUD는 app.db DDL을 즉시 적용하므로, 시드가 만드는 샘플 엔티티도
 * 실제 테이블이 있어야 §8.2 데이터 탭이 빈 화면 대신 동작하는 예시를 보여줄 수 있다.
 */
function seedAppDbTable(): void {
  const appDb = new Database(appDbPath());
  appDb.pragma('journal_mode = WAL');
  appDb.exec(`
    CREATE TABLE IF NOT EXISTS "orders" (
      "id" TEXT PRIMARY KEY,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "customer_name" TEXT NOT NULL,
      "amount" REAL NOT NULL
    )
  `);
  appDb.close();
}

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);
  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash },
  });

  await prisma.deployment.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', activeRevisionId: null },
  });

  const dashboard = await prisma.page.upsert({
    where: { slug: 'dashboard' },
    update: {},
    create: {
      slug: 'dashboard',
      title: '대시보드',
      icon: 'layout-dashboard',
      order: 0,
      isHome: true,
    },
  });

  await prisma.page.upsert({
    where: { slug: 'orders' },
    update: {},
    create: {
      slug: 'orders',
      title: '주문 관리',
      icon: 'shopping-cart',
      order: 1,
    },
  });

  await prisma.page.upsert({
    where: { slug: 'settings' },
    update: {},
    create: {
      slug: 'settings',
      title: '설정',
      icon: 'settings',
      order: 2,
    },
  });

  const order = await prisma.entity.upsert({
    where: { name: '주문' },
    update: {},
    create: {
      name: '주문',
      tableName: 'orders',
      description: '샘플 주문 엔티티',
      order: 0,
    },
  });

  await prisma.field.upsert({
    where: { entityId_columnName: { entityId: order.id, columnName: 'customer_name' } },
    update: {},
    create: {
      entityId: order.id,
      name: '고객명',
      columnName: 'customer_name',
      dataType: 'TEXT',
      isRequired: true,
      order: 0,
    },
  });

  await prisma.field.upsert({
    where: { entityId_columnName: { entityId: order.id, columnName: 'amount' } },
    update: {},
    create: {
      entityId: order.id,
      name: '금액',
      columnName: 'amount',
      dataType: 'REAL',
      isRequired: true,
      order: 1,
    },
  });

  seedAppDbTable();

  console.log(`Seed complete. dashboard page id: ${dashboard.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
