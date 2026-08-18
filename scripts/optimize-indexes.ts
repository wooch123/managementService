/**
 * 운영 DB 인덱스 최적화.
 *
 * 배포된 스펙의 바인딩이 실제로 어떤 컬럼으로 정렬·집계·필터하는지 읽어, 그 컬럼에 인덱스를 만든다.
 * (사람이 짐작해서 만드는 게 아니라 화면이 실제로 쓰는 컬럼만 만든다.)
 *
 * WHY: 인덱스가 없으면 목록 조회마다 전체 스캔 + 임시 정렬이 일어난다. 5,000행에서는 1ms라
 * 티가 안 나지만 행 수에 비례해 늘어난다 — 10만 행이면 화면 하나에 수백 ms가 된다.
 *
 * 실행: pnpm db:optimize   (몇 번 실행해도 안전 — 이미 있으면 건너뛴다)
 */
// 이 파일은 tsx로 직접 실행하는 유지보수 스크립트라 server-only를 쓰지 않는다(번들러 밖에서 돈다).
import Database from 'better-sqlite3';
import { appDbPath } from '@/lib/db/paths';
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';
import { quoteIdent, isValidIdentifierFormat } from '@/lib/data-engine/identifiers';

type SpecField = { id: string; columnName: string };
type SpecEntity = { id: string; tableName: string; fields: SpecField[] };
type Binding = {
  mode: string;
  entityId?: string;
  sort?: { fieldId: string }[];
  filters?: { fieldId: string }[];
  groupFieldId?: string;
};

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

async function main() {
  const deployment = await prisma.deployment.findFirst({ select: { activeRevisionId: true } });
  if (!deployment?.activeRevisionId) {
    console.log('배포된 리비전이 없습니다 — 할 일이 없습니다.');
    return;
  }
  const revision = await prisma.revision.findUnique({
    where: { id: deployment.activeRevisionId },
    select: { revisionNo: true, specJson: true },
  });
  if (!revision) return;

  const spec = JSON.parse(revision.specJson) as {
    entities: SpecEntity[];
    pages: { nodes: { binding: Binding | null }[] }[];
  };
  const entityById = new Map(spec.entities.map((e) => [e.id, e]));

  /** (테이블, 컬럼) → 왜 필요한지 */
  const wanted = new Map<string, { table: string; column: string; reasons: Set<string> }>();
  const want = (entityId: string | undefined, fieldId: string | undefined, reason: string) => {
    if (!entityId || !fieldId) return;
    const entity = entityById.get(entityId);
    const field = entity?.fields.find((f) => f.id === fieldId);
    if (!entity || !field) return;
    if (!isValidIdentifierFormat(entity.tableName) || !isValidIdentifierFormat(field.columnName)) return;
    const key = `${entity.tableName}.${field.columnName}`;
    const entry = wanted.get(key) ?? { table: entity.tableName, column: field.columnName, reasons: new Set<string>() };
    entry.reasons.add(reason);
    wanted.set(key, entry);
  };

  for (const page of spec.pages) {
    for (const node of page.nodes) {
      const b = node.binding;
      if (!b || !b.entityId) continue;
      for (const s of b.sort ?? []) want(b.entityId, s.fieldId, '정렬');
      for (const f of b.filters ?? []) want(b.entityId, f.fieldId, '필터');
      if (b.groupFieldId) want(b.entityId, b.groupFieldId, '집계');
    }
  }

  const db = new Database(appDbPath());
  let created = 0;
  let existing = 0;
  for (const { table, column, reasons } of wanted.values()) {
    const indexName = `idx_${table}_${column}`;
    const already = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
      .get(indexName) as { name: string } | undefined;
    if (already) {
      existing += 1;
      continue;
    }
    db.exec(`CREATE INDEX ${quoteIdent(indexName)} ON ${quoteIdent(table)} (${quoteIdent(column)})`);
    created += 1;
    console.log(`  + ${indexName}  (${[...reasons].join('·')})`);
  }

  // 통계를 갱신해야 계획기가 새 인덱스를 실제로 쓴다.
  db.exec('ANALYZE');
  db.close();

  console.log(`리비전 #${revision.revisionNo} 기준 — 새로 만든 인덱스 ${created}개, 이미 있던 것 ${existing}개`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
