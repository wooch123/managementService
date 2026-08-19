/**
 * 설계(메타 DB)와 운영 DB(app.db)의 스키마를 맞춘다 — 없는 표를 만들고, 없는 컬럼을 더한다.
 *
 * 왜 필요한가: 이 앱은 **필드를 만드는 순간 DDL을 적용하는 모델**이다(관리자 API가 그 자리에서
 * ALTER TABLE을 실행한다). 배포는 그 결과를 확인만 하지 스스로 컬럼을 만들지 않는다. 그래서
 * 스크립트로 메타 DB에 필드를 직접 넣으면 설계에는 있고 표에는 없는 상태(드리프트)가 된다 —
 * 그 컬럼을 읽는 화면은 조회가 실패해 조용히 빈 카드로 그려진다.
 *
 * 더하기만 한다(지우거나 타입을 바꾸지 않는다). 그런 변경은 파괴적이라 관리자 화면에서
 * 명시적으로 확인받아야 한다.
 *
 * 실행: pnpm db:sync-schema
 */
import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};

const { PrismaClient } = await import('@prisma/client');
const { metaDbUrl } = await import('@/lib/db/paths');
const { getAppDb } = await import('@/lib/db/app-db');
const { toFieldDdlSpec, addColumn, createEntityTable, createUniqueIndexIfNeeded } = await import('@/lib/data-engine/ddl');
const { tableExists, getTableColumns } = await import('@/lib/data-engine/introspect');

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });
const db = getAppDb();

const entities = await prisma.entity.findMany({ include: { fields: { orderBy: { order: 'asc' } } } });
let added = 0;
let created = 0;

for (const entity of entities) {
  const specs = entity.fields.map(toFieldDdlSpec);
  if (!tableExists(db, entity.tableName)) {
    createEntityTable(db, entity.tableName, specs);
    created += 1;
    console.log(`+ 표 ${entity.tableName} (${specs.length}칼럼)`);
    continue;
  }
  const existing = new Set(getTableColumns(db, entity.tableName).map((c) => c.name));
  for (const spec of specs) {
    if (existing.has(spec.columnName)) continue;
    addColumn(db, entity.tableName, spec);
    createUniqueIndexIfNeeded(db, entity.tableName, spec);
    added += 1;
    console.log(`+ ${entity.tableName}.${spec.columnName} (${spec.dataType})`);
  }
}

console.log(added + created > 0 ? `\n표 ${created}개 · 컬럼 ${added}개를 맞췄습니다.` : '\n이미 설계와 같습니다.');
await prisma.$disconnect();
process.exit(0);
