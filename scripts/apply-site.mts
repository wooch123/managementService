/**
 * 구성 적용 — 「page 구성 및 DB(8.28)」대로 화면과 데이터 설계를 만든다.
 *
 * 화면 쪽은 **매번 처음부터 다시** 만든다(컴포넌트·동작·관계). 설계가 코드에 있으므로 그것이
 * 가장 단순하고, 몇 번을 실행해도 결과가 같다. 피드백 게시판만은 화면을 다시 만들되
 * `boardKey`를 예전 값으로 못 박아 쌓인 대화와 이미지가 그대로 딸려 온다.
 *
 * 데이터 쪽은 **더하기만** 한다 — 없는 표를 만들고, 없는 칸을 더할 뿐 지우지 않는다.
 * 처음 옮겨 올 때는 표를 통째로 갈아엎었지만, 그 뒤로 이 스크립트는 "칸 하나 더하기"에도
 * 쓰이기 때문이다. 설계에서 아예 빠진 표만 지운다(화면에서 닿을 수 없는 데이터가 되므로).
 *
 * 초안(draft)만 바꾼다. 운영 화면(/home)에 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/apply-site.mts
 */
// tsx는 Next 전용 'server-only'를 해석하지 못한다 — DDL 헬퍼를 쓰기 위해 빈 모듈로 바꾼다.
import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};

import { nanoid } from 'nanoid';
import { assertNoOverlap, entityOf, fieldOf, loadSchema, tableColumns, toBindingJson } from './blueprint-lib';
import type { ActionPlan, EntityInfo, NodePlan, ValuePlan } from './blueprint-lib';
import type { FieldDdlSpec } from '@/lib/data-engine/ddl';
import { buildActions, buildSite, type SitePage } from './site-design';
import { APPEND_ONLY_TABLES, DEFAULT_COST_ROW, ENTITIES } from './site-schema';

const { PrismaClient } = await import('@prisma/client');
const { metaDbUrl } = await import('@/lib/db/paths');
const { getAppDb } = await import('@/lib/db/app-db');
const { addColumn, createEntityTable, createUniqueIndexIfNeeded, dropTable } = await import('@/lib/data-engine/ddl');
const { getTableColumns, tableExists } = await import('@/lib/data-engine/introspect');
const { quoteIdent } = await import('@/lib/data-engine/identifiers');
const { nodeMeta } = await import('@/lib/registry/node-meta.generated');

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });
const db = getAppDb();

type Schema = Map<string, EntityInfo>;

/** 이번 재구성에서 유일하게 살아남는 화면. */
const KEEP_SLUG = 'feedback';

// ── 1. 기존 구성 지우기 ─────────────────────────────────────────────────────

async function wipe(): Promise<void> {
  // 관계·그래프 좌표는 노드/액션/엔티티 id를 가리킨다. 먼저 정리하지 않으면 남은 참조가
  // 검증에서 "연결의 시작/끝 요소가 존재하지 않습니다"(E-REL-001)로 배포를 막는다.
  await prisma.relation.deleteMany({});
  await prisma.graphViewPosition.deleteMany({});
  await prisma.graphNode.deleteMany({});
  await prisma.action.deleteMany({});
  await prisma.componentNode.deleteMany({});

  // 페이지는 자기 자신을 부모로 갖는 트리다 — 자식부터 지운다.
  const pages = await prisma.page.findMany({ select: { id: true, slug: true, parentId: true } });
  const keep = pages.find((p) => p.slug === KEEP_SLUG);
  const doomed = pages.filter((p) => p.id !== keep?.id);
  await prisma.page.deleteMany({ where: { id: { in: doomed.filter((p) => p.parentId).map((p) => p.id) } } });
  await prisma.page.deleteMany({ where: { id: { in: doomed.filter((p) => !p.parentId).map((p) => p.id) } } });

  /**
   * 업무 표는 **새 설계에 없는 것만** 지운다.
   *
   * 처음 옮겨 올 때는 전부 지웠지만, 그 뒤로 이 스크립트는 "칸 하나 더하기" 같은 일에도 쓰인다.
   * 그때마다 표를 통째로 다시 만들면 그 안의 데이터가 함께 사라진다 — 실제로 Ball 수 칸을
   * 더하려다 그럴 뻔했다. 설계에 남아 있는 표는 그대로 두고, 모자란 칸만 아래에서 더한다.
   * (설계에서 빠진 표는 화면에서 닿을 수 없는 데이터가 되므로 지우는 것이 맞다.)
   */
  const keepTables = new Set(ENTITIES.map((e) => e.table));
  const entities = await prisma.entity.findMany({ select: { tableName: true } });
  const dropped = entities.filter((e) => !keepTables.has(e.tableName));
  for (const entity of dropped) {
    if (tableExists(db, entity.tableName)) dropTable(db, entity.tableName);
  }
  await prisma.entity.deleteMany({});

  console.log(
    `지움: 화면 ${doomed.length}개(피드백 게시판 유지) · 컴포넌트/동작/관계 전부` +
      (dropped.length > 0 ? ` · 설계에서 빠진 업무 표 ${dropped.length}개` : ' · 업무 표는 그대로 둠')
  );
}

// ── 2. 데이터 설계 ──────────────────────────────────────────────────────────

async function createEntities(): Promise<void> {
  for (const [order, plan] of ENTITIES.entries()) {
    const entity = await prisma.entity.create({
      data: { name: plan.name, tableName: plan.table, description: plan.description, order },
    });
    const specs: FieldDdlSpec[] = [];
    for (const [fieldOrder, field] of plan.fields.entries()) {
      await prisma.field.create({
        data: {
          entityId: entity.id,
          name: field.name,
          columnName: field.col,
          dataType: field.type,
          isRequired: field.required ?? false,
          isUnique: field.unique ?? false,
          isPrimary: false,
          defaultVal: null,
          enumValues: field.enumValues ? JSON.stringify(field.enumValues) : null,
          order: fieldOrder,
        },
      });
      specs.push({
        columnName: field.col,
        dataType: field.type,
        isRequired: field.required ?? false,
        isUnique: field.unique ?? false,
        isPrimary: false,
        defaultVal: null,
        enumValues: field.enumValues ?? null,
      });
    }
    // 설계를 만든 그 자리에서 표도 만든다(이 앱의 즉시 적용 모델 — SYSTEM.md / sync-schema.mts 주석).
    // 이미 있으면 **더하기만** 한다 — 안에 든 데이터를 지키기 위해서다. 지우거나 타입을 바꾸는
    // 변경은 파괴적이라 관리자 화면에서 따로 확인받아야 한다(sync-schema.mts와 같은 원칙).
    if (!tableExists(db, plan.table)) {
      createEntityTable(db, plan.table, specs);
      console.log(`  + 표 ${plan.table} (${specs.length}칼럼)`);
      continue;
    }
    const existing = new Set(getTableColumns(db, plan.table).map((c) => c.name));
    const added = specs.filter((spec) => !existing.has(spec.columnName));
    for (const spec of added) {
      addColumn(db, plan.table, spec);
      createUniqueIndexIfNeeded(db, plan.table, spec);
    }
    console.log(
      added.length > 0
        ? `  = 표 ${plan.table} — 칸 ${added.length}개 추가(${added.map((s) => s.columnName).join(', ')})`
        : `  = 표 ${plan.table} (${specs.length}칼럼, 이미 설계와 같음)`
    );
  }
}

/**
 * 조회를 빠르게 하는 색인.
 *
 * 화면이 거의 항상 좁히는 축은 정해져 있다 — FAR No로 고르고, 접수일·마감일로 자르고, 담당자로
 * 거른다. 이 표는 곧 수만 행이 되므로 색인 없이는 목록 한 번에 표를 통째로 훑는다.
 */
function createIndexes(): void {
  const statements = [
    'CREATE INDEX IF NOT EXISTS "far_table_far_no_idx" ON "far_table"("far_no")',
    'CREATE INDEX IF NOT EXISTS "far_table_rcv_date_idx" ON "far_table"("rcv_date")',
    'CREATE INDEX IF NOT EXISTS "far_table_due_date_idx" ON "far_table"("due_date")',
    'CREATE INDEX IF NOT EXISTS "far_table_name_idx" ON "far_table"("name")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "far_table_sample_uk" ON "far_table"("far_no", "sample_no")',
    'CREATE INDEX IF NOT EXISTS "far_analysis_log_key_idx" ON "far_analysis_log"("far_no", "sample_no", "rev")',
    'CREATE INDEX IF NOT EXISTS "reball_table_far_no_idx" ON "reball_table"("far_no")',
    'CREATE INDEX IF NOT EXISTS "reball_table_date_idx" ON "reball_table"("date")',
  ];
  for (const sql of statements) db.exec(sql);
  console.log(`  색인 ${statements.length}개`);
}

/**
 * 분석 이력을 **고쳐 쓰거나 지울 수 없게** 막는다.
 *
 * 사용자 요구: "분석 Tool이 갱신하는 값은 여러 번 갱신되더라도 이전에 기록했던 값을 조회할 수
 * 있도록 안전 설계". 이력 표에 줄을 쌓는 것만으로는 부족하다 — 어딘가에서 UPDATE/DELETE가
 * 한 번 나가면 그걸로 끝이다. 규칙을 코드가 아니라 **DB에** 둔다. 어떤 경로로 들어와도 막힌다.
 *
 * 되돌려야 한다면 트리거를 지우면 된다(`DROP TRIGGER far_analysis_log_no_update`).
 */
function createAppendOnlyGuards(): void {
  for (const table of APPEND_ONLY_TABLES) {
    const ident = quoteIdent(table);
    for (const [suffix, event, message] of [
      ['no_update', 'UPDATE', '분석 이력은 수정할 수 없습니다'],
      ['no_delete', 'DELETE', '분석 이력은 삭제할 수 없습니다'],
    ] as const) {
      const name = quoteIdent(`${table}_${suffix}`);
      db.exec(`DROP TRIGGER IF EXISTS ${name}`);
      db.exec(
        `CREATE TRIGGER ${name} BEFORE ${event} ON ${ident}
         BEGIN SELECT RAISE(ABORT, '${message}'); END`
      );
    }
    console.log(`  ${table}: 수정·삭제 금지 트리거`);
  }
}

/** 단가표는 행 하나만 쓴다 — 계산이 0원으로만 나오지 않게 시작값을 넣어 둔다(화면에서 고칠 수 있다). */
function seedCostRow(): void {
  // 이미 한 줄이 있으면 그대로 둔다 — 화면에서 고쳐 둔 단가를 다시 실행할 때마다 되돌리면 안 된다.
  const existing = db.prepare('SELECT COUNT(*) AS n FROM "reball_cost_table"').get() as { n: number };
  if (existing.n > 0) {
    console.log('  단가표 그대로 둠(이미 값이 있다)');
    return;
  }
  const columns = ['id', 'created_at', 'updated_at', ...Object.keys(DEFAULT_COST_ROW)];
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO "reball_cost_table" (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  ).run(nanoid(), now, now, ...Object.values(DEFAULT_COST_ROW));
  console.log('  단가표 시작값 1줄');
}

// ── 3. 화면 ─────────────────────────────────────────────────────────────────

/** 트리를 (부모, 자식) 평면 목록으로 편다. 화면 계층은 2단까지다(검증 E-STRUCT-005). */
function flatten(pages: SitePage[]): { page: SitePage; parentSlug: string | null; order: number }[] {
  const out: { page: SitePage; parentSlug: string | null; order: number }[] = [];
  pages.forEach((page, order) => {
    out.push({ page, parentSlug: null, order });
    page.children?.forEach((child, childOrder) => out.push({ page: child, parentSlug: page.slug, order: childOrder }));
  });
  return out;
}

async function createPages(flat: ReturnType<typeof flatten>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  // 부모를 먼저 만든다(자식이 parentId로 가리킨다).
  for (const { page, parentSlug, order } of flat) {
    if (parentSlug) continue;
    const existing = await prisma.page.findUnique({ where: { slug: page.slug } });
    const data = { title: page.title, icon: page.icon, parentId: null, order, isVisible: true, isHome: page.isHome ?? false };
    const row = existing
      ? await prisma.page.update({ where: { id: existing.id }, data })
      : await prisma.page.create({ data: { slug: page.slug, ...data } });
    ids.set(page.slug, row.id);
  }
  for (const { page, parentSlug, order } of flat) {
    if (!parentSlug) continue;
    const existing = await prisma.page.findUnique({ where: { slug: page.slug } });
    const data = { title: page.title, icon: page.icon, parentId: ids.get(parentSlug)!, order, isVisible: true, isHome: false };
    const row = existing
      ? await prisma.page.update({ where: { id: existing.id }, data })
      : await prisma.page.create({ data: { slug: page.slug, ...data } });
    ids.set(page.slug, row.id);
  }
  return ids;
}

// ── 4. 컴포넌트 · 동작 · 관계 ───────────────────────────────────────────────

function resolveValue(source: ValuePlan, nodeIds: Map<string, string>) {
  switch (source.from) {
    case 'literal':
      return { from: 'literal', value: source.value };
    case 'component': {
      const nodeId = nodeIds.get(source.node);
      if (!nodeId) throw new Error(`동작이 가리키는 컴포넌트를 찾을 수 없습니다: ${source.node}`);
      return source.path ? { from: 'component', nodeId, path: source.path } : { from: 'component', nodeId };
    }
    case 'route':
      return { from: 'route', param: source.param };
    case 'now':
      return { from: 'now' };
    case 'sequence':
      return { from: 'sequence', prefix: source.prefix, digits: source.digits ?? 6 };
  }
}

function actionConfig(
  plan: ActionPlan,
  schema: Schema,
  nodeIds: Map<string, string>,
  actionIds: Map<string, string>,
  pageIds: Map<string, string>
): Record<string, unknown> {
  const fieldMapOf = (table: string, values: Record<string, ValuePlan>) =>
    Object.fromEntries(Object.entries(values).map(([col, src]) => [fieldOf(schema, table, col).id, resolveValue(src, nodeIds)]));

  switch (plan.kind) {
    case 'CREATE':
      return { kind: 'CREATE', entityId: entityOf(schema, plan.table).id, fieldMap: fieldMapOf(plan.table, plan.values) };
    case 'UPDATE':
      return {
        kind: 'UPDATE',
        entityId: entityOf(schema, plan.table).id,
        keySource: resolveValue(plan.keyFrom, nodeIds),
        keyFieldId: fieldOf(schema, plan.table, plan.keyCol).id,
        fieldMap: fieldMapOf(plan.table, plan.values),
      };
    case 'QUERY':
      return { kind: 'QUERY', entityId: entityOf(schema, plan.table).id, filters: [], targetNodeId: nodeIds.get(plan.targetNode) ?? '' };
    case 'NAVIGATE':
      return { kind: 'NAVIGATE', pageId: pageIds.get(plan.pageSlug) ?? '' };
    case 'TOAST':
      return { kind: 'TOAST', variant: plan.variant, message: plan.message };
    case 'COMPOSITE':
      return { kind: 'COMPOSITE', steps: plan.steps.map((s) => actionIds.get(s) ?? ''), stopOnError: true };
    case 'EXPORT_CSV':
      return { kind: 'EXPORT_CSV', entityId: entityOf(schema, plan.table).id, filters: [], filename: plan.filename };
  }
}

/** 이 컴포넌트가 곧바로 여는 다른 화면들(props에 적힌 slug). */
function navigationTargets(node: NodePlan): string[] {
  const props = (node.props ?? {}) as {
    linkSlug?: string;
    selectSlug?: string;
    moreSlug?: string;
    items?: { slug?: string }[];
  };
  const slugs = [props.linkSlug, props.selectSlug, props.moreSlug, ...(props.items ?? []).map((i) => i.slug)];
  return [...new Set(slugs.filter((s): s is string => typeof s === 'string' && s !== ''))];
}

async function main() {
  const site = buildSite();
  const flat = flatten(site);
  const actions = buildActions();

  for (const { page } of flat) assertNoOverlap(page);
  const nodeTotal = flat.reduce((n, { page }) => n + page.nodes.length, 0);
  console.log(`설계 확인: 화면 ${flat.length}개 · 최상위 컴포넌트 ${nodeTotal}개 · 동작 ${actions.length}개 (배치 겹침 없음)`);

  await wipe();

  console.log('데이터 설계:');
  await createEntities();
  createIndexes();
  createAppendOnlyGuards();
  seedCostRow();

  const schema = await loadSchema(prisma);
  const pageIds = await createPages(flat);
  console.log(`만듦: 화면 ${pageIds.size}개`);

  // ── 컴포넌트 ─────────────────────────────────────────────────────────────
  const nodeIds = new Map<string, string>();
  const built: { id: string; plan: NodePlan }[] = [];

  async function createNode(node: NodePlan, pageId: string, order: number, parentNodeId: string | null): Promise<void> {
    const meta = nodeMeta[node.type];
    if (!meta) throw new Error(`카탈로그에 없는 컴포넌트입니다: ${node.type}`);
    // 카탈로그 기본값을 먼저 깔고 설계값을 덮는다 — 나중에 속성이 추가돼도 기존 노드가
    // "렌더링 오류"로 떨어지지 않게 한다.
    const props: Record<string, unknown> = { ...meta.defaultProps, ...(node.props ?? {}) };
    if (node.type === 'data-table' && node.bind) {
      props.columns = tableColumns(schema, node.bind, node.headers, node.formats);
      // 설계에는 읽기 쉬운 **컬럼명**을 적지만 런타임은 **fieldId**로 조회 결과의 컬럼을 찾는다.
      if (props.selectFieldId && node.bind.mode === 'list') {
        props.selectFieldId = fieldOf(schema, node.bind.table, String(props.selectFieldId)).id;
      }
    }
    const created = await prisma.componentNode.create({
      data: {
        pageId,
        type: node.type,
        parentNodeId,
        order,
        gridCol: node.col,
        gridSpan: node.span,
        gridRow: node.row,
        gridRowSpan: node.rowSpan,
        region: 'main',
        propsJson: JSON.stringify(props),
        bindingJson: node.bind ? toBindingJson(schema, node.bind) : null,
        eventsJson: '{}',
        label: null,
      },
    });
    if (node.key) {
      if (nodeIds.has(node.key)) throw new Error(`컴포넌트 별칭이 겹칩니다: ${node.key}`);
      nodeIds.set(node.key, created.id);
    }
    built.push({ id: created.id, plan: node });
    let childOrder = 0;
    for (const child of node.children ?? []) await createNode(child, pageId, childOrder++, created.id);
  }

  for (const { page } of flat) {
    const pageId = pageIds.get(page.slug)!;
    let order = 0;
    for (const node of page.nodes) await createNode(node, pageId, order++, null);
  }
  console.log(`만듦: 컴포넌트 ${built.length}개`);

  // ── 동작 ─────────────────────────────────────────────────────────────────
  const actionIds = new Map<string, string>();
  for (const plan of actions) {
    const created = await prisma.action.create({
      data: { name: plan.name, kind: plan.kind, description: plan.desc, configJson: '{}' },
    });
    actionIds.set(plan.key, created.id);
  }
  for (const plan of actions) {
    const config = actionConfig(plan, schema, nodeIds, actionIds, pageIds);
    await prisma.action.update({ where: { id: actionIds.get(plan.key)! }, data: { configJson: JSON.stringify(config) } });
  }
  console.log(`만듦: 동작 ${actions.length}개`);

  // ── 이벤트 연결 ──────────────────────────────────────────────────────────
  let eventCount = 0;
  const triggers: { nodeId: string; actionId: string }[] = [];
  for (const { id, plan: node } of built) {
    if (!node.on) continue;
    const events: Record<string, string> = {};
    for (const [eventName, actionKey] of Object.entries(node.on)) {
      const actionId = actionIds.get(actionKey);
      if (!actionId) throw new Error(`이벤트가 가리키는 동작이 없습니다: ${actionKey}`);
      events[eventName] = actionId;
      triggers.push({ nodeId: id, actionId });
    }
    await prisma.componentNode.update({ where: { id }, data: { eventsJson: JSON.stringify(events) } });
    eventCount += Object.keys(events).length;
  }
  console.log(`연결: 이벤트 ${eventCount}개`);

  // ── 관계도 ───────────────────────────────────────────────────────────────
  // 관계는 배치에서 그대로 파생된다(손으로 그리지 않는다). 검증 규칙 E-REL-004는 관계가
  // 이벤트 설정과 일치할 것을 요구한다.
  const relations: { fromType: string; fromId: string; toType: string; toId: string; kind: string }[] = [];
  for (const { id, plan: node } of built) {
    if (node.bind) {
      relations.push({ fromType: 'COMPONENT', fromId: id, toType: 'ENTITY', toId: entityOf(schema, node.bind.table).id, kind: 'READS' });
    }
    for (const slug of navigationTargets(node)) {
      const target = pageIds.get(slug);
      if (!target) throw new Error(`이동 대상 화면을 찾을 수 없습니다: ${slug}`);
      relations.push({ fromType: 'COMPONENT', fromId: id, toType: 'PAGE', toId: target, kind: 'NAVIGATES' });
    }
  }
  for (const trigger of triggers) {
    relations.push({ fromType: 'COMPONENT', fromId: trigger.nodeId, toType: 'ACTION', toId: trigger.actionId, kind: 'TRIGGERS' });
  }
  for (const plan of actions) {
    if (plan.kind === 'CREATE' || plan.kind === 'UPDATE') {
      relations.push({ fromType: 'ACTION', fromId: actionIds.get(plan.key)!, toType: 'ENTITY', toId: entityOf(schema, plan.table).id, kind: 'WRITES' });
    }
    if (plan.kind === 'NAVIGATE') {
      relations.push({ fromType: 'ACTION', fromId: actionIds.get(plan.key)!, toType: 'PAGE', toId: pageIds.get(plan.pageSlug)!, kind: 'NAVIGATES' });
    }
  }
  const seen = new Set<string>();
  let relationCount = 0;
  for (const relation of relations) {
    const key = `${relation.fromId}|${relation.toId}|${relation.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.relation.create({ data: { ...relation, metaJson: '{}' } });
    relationCount += 1;
  }
  console.log(`만듦: 관계 ${relationCount}개`);

  console.log('\n초안에 반영했습니다. `pnpm validate`로 확인한 뒤 배포하세요.');
}

await main();
await prisma.$disconnect();
process.exit(0);
