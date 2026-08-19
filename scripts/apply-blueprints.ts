/**
 * 청사진 적용 — 16화면의 배치·바인딩·액션·관계를 설계(blueprint-design.ts)대로 다시 만든다.
 *
 * 초안(draft)만 고친다. 운영 화면에 반영하려면 배포를 따로 해야 한다.
 * 몇 번 실행해도 결과가 같다(그 전에 만든 노드/액션/관계를 지우고 다시 만든다).
 *
 * 왜 "고치기"가 아니라 "다시 만들기"인가: 화면 구조가 통째로 바뀌어(목록→선택 상세) 남길 것보다
 * 바꿀 것이 훨씬 많다. 다만 **데이터가 붙어 있는 노드**는 예외다 — 게시판은 노드 id가 곧 글 묶음의
 * 열쇠라, 다시 만들면 21건의 대화와 이미지가 화면에서 사라진다. 그래서 그 노드만 `boardKey`를
 * 예전 id로 못 박는다(blueprint-design.ts의 LEGACY_BOARD_KEY).
 *
 * 실행: pnpm tsx scripts/apply-blueprints.ts
 */
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import { assertNoOverlap, entityOf, fieldOf, loadSchema, tableColumns, toBindingJson, type ActionPlan, type EntityInfo, type ValuePlan } from './blueprint-lib';
import { buildActions, buildPages } from './blueprint-design';

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

type Schema = Map<string, EntityInfo>;

function resolveValue(source: ValuePlan, nodeIds: Map<string, string>) {
  switch (source.from) {
    case 'literal':
      return { from: 'literal', value: source.value };
    case 'component': {
      const nodeId = nodeIds.get(source.node);
      if (!nodeId) throw new Error(`액션이 가리키는 노드를 찾을 수 없습니다: ${source.node}`);
      return { from: 'component', nodeId };
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
      return {
        kind: 'CREATE',
        entityId: entityOf(schema, plan.table).id,
        fieldMap: fieldMapOf(plan.table, plan.values),
        ...(plan.onSuccess ? { onSuccess: actionIds.get(plan.onSuccess) ?? null } : {}),
      };
    case 'UPDATE':
      return {
        kind: 'UPDATE',
        entityId: entityOf(schema, plan.table).id,
        keySource: resolveValue(plan.keyFrom, nodeIds),
        keyFieldId: fieldOf(schema, plan.table, plan.keyCol).id,
        fieldMap: fieldMapOf(plan.table, plan.values),
        ...(plan.onSuccess ? { onSuccess: actionIds.get(plan.onSuccess) ?? null } : {}),
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

/** 액션이 건드리는 엔티티(WRITES 관계용). */
function writesTable(plan: ActionPlan): string | null {
  return plan.kind === 'CREATE' || plan.kind === 'UPDATE' ? plan.table : null;
}

async function main() {
  const schema = await loadSchema(prisma);
  const pages = buildPages(schema);
  const actions = buildActions();

  for (const page of pages) assertNoOverlap(page);
  console.log(`설계 확인: ${pages.length}화면 · 컴포넌트 ${pages.reduce((n, p) => n + p.nodes.length, 0)}개 · 액션 ${actions.length}개 (배치 겹침 없음)`);

  const dbPages = await prisma.page.findMany();
  const bySlug = new Map(dbPages.map((p) => [p.slug, p]));
  // 슬러그를 바꾸는 화면이 있으므로(page-6v05og → feedback) 새 이름으로도 찾는다 —
  // 그러지 않으면 이 스크립트를 두 번째로 돌릴 때 "페이지를 찾을 수 없습니다"로 멈춘다.
  const pageBySlug = new Map(
    pages.map((plan) => {
      const page = bySlug.get(plan.slug) ?? (plan.newSlug ? bySlug.get(plan.newSlug) : undefined);
      if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${plan.slug}`);
      return [plan.slug, page] as const;
    })
  );

  // ── 지우기 ────────────────────────────────────────────────────────────────
  // 관계와 관계도 좌표는 노드/액션 id를 가리킨다. 노드를 지우기 전에 함께 정리하지 않으면
  // "연결의 시작/끝 요소가 존재하지 않습니다"(E-REL-001)로 배포가 막힌다.
  const targetPageIds = pages.map((p) => pageBySlug.get(p.slug)!.id);
  const oldNodes = await prisma.componentNode.findMany({ where: { pageId: { in: targetPageIds } }, select: { id: true } });
  const oldNodeIds = oldNodes.map((n) => n.id);
  const oldActions = await prisma.action.findMany({ select: { id: true } });
  const oldActionIds = oldActions.map((a) => a.id);
  const staleRefIds = [...oldNodeIds, ...oldActionIds];

  await prisma.relation.deleteMany({
    where: { OR: [{ fromId: { in: staleRefIds } }, { toId: { in: staleRefIds } }] },
  });
  await prisma.graphViewPosition.deleteMany({ where: { refId: { in: staleRefIds } } });
  await prisma.graphNode.deleteMany({ where: { refId: { in: oldNodeIds } } });
  await prisma.action.deleteMany({});
  await prisma.componentNode.deleteMany({ where: { pageId: { in: targetPageIds } } });
  console.log(`지움: 컴포넌트 ${oldNodeIds.length}개 · 액션 ${oldActionIds.length}개 · 관련 관계/좌표`);

  // ── 페이지 속성 ───────────────────────────────────────────────────────────
  for (const plan of pages) {
    const page = pageBySlug.get(plan.slug)!;
    const data: { title?: string; slug?: string; icon?: string } = {};
    if (plan.title && plan.title !== page.title) data.title = plan.title;
    if (plan.newSlug && plan.newSlug !== page.slug) data.slug = plan.newSlug;
    if (plan.icon && plan.icon !== page.icon) data.icon = plan.icon;
    if (Object.keys(data).length > 0) {
      await prisma.page.update({ where: { id: page.id }, data });
      console.log(`  페이지 갱신 ${plan.slug}: ${JSON.stringify(data)}`);
    }
  }

  // ── 컴포넌트 ─────────────────────────────────────────────────────────────
  const nodeIds = new Map<string, string>();
  let order = 0;
  for (const plan of pages) {
    const page = pageBySlug.get(plan.slug)!;
    order = 0;
    for (const node of plan.nodes) {
      const meta = nodeMeta[node.type];
      if (!meta) throw new Error(`카탈로그에 없는 컴포넌트입니다: ${node.type}`);
      // 카탈로그 기본값을 먼저 깔고 설계값을 덮는다 — 나중에 속성이 추가돼도 기존 노드가
      // "렌더링 오류"로 떨어지지 않게 하는 것과 같은 이유다(SYSTEM.md §8).
      const props = { ...meta.defaultProps, ...(node.props ?? {}) };
      if (node.type === 'data-table' && node.bind) {
        props.columns = tableColumns(schema, node.bind, node.headers);
      }
      const created = await prisma.componentNode.create({
        data: {
          pageId: page.id,
          type: node.type,
          order: order++,
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
        if (nodeIds.has(node.key)) throw new Error(`노드 별칭이 겹칩니다: ${node.key}`);
        nodeIds.set(node.key, created.id);
      }
    }
  }
  console.log(`만듦: 컴포넌트 ${pages.reduce((n, p) => n + p.nodes.length, 0)}개`);

  // ── 액션 ─────────────────────────────────────────────────────────────────
  // 후속 액션(onSuccess)과 COMPOSITE 스텝은 다른 액션의 id를 가리킨다. 먼저 빈 껍데기로 모두
  // 만들어 id를 확보한 뒤 설정을 채운다(순서에 상관없이 서로를 가리킬 수 있게).
  const actionIds = new Map<string, string>();
  for (const plan of actions) {
    const created = await prisma.action.create({
      data: { name: plan.name, kind: plan.kind, description: plan.desc, configJson: '{}' },
    });
    actionIds.set(plan.key, created.id);
  }
  const pageIds = new Map(pages.map((p) => [p.newSlug ?? p.slug, pageBySlug.get(p.slug)!.id]));
  for (const plan of actions) {
    const config = actionConfig(plan, schema, nodeIds, actionIds, pageIds);
    await prisma.action.update({ where: { id: actionIds.get(plan.key)! }, data: { configJson: JSON.stringify(config) } });
  }
  console.log(`만듦: 액션 ${actions.length}개`);

  // ── 이벤트 연결 ──────────────────────────────────────────────────────────
  // 노드를 만든 뒤에야 액션 id가 생기므로 이벤트는 여기서 채운다.
  let eventCount = 0;
  const triggers: { nodeId: string; actionId: string; eventName: string }[] = [];
  for (const plan of pages) {
    const page = pageBySlug.get(plan.slug)!;
    const created = await prisma.componentNode.findMany({ where: { pageId: page.id }, orderBy: { order: 'asc' } });
    for (let i = 0; i < plan.nodes.length; i += 1) {
      const node = plan.nodes[i];
      if (!node.on) continue;
      const events: Record<string, string> = {};
      for (const [eventName, actionKey] of Object.entries(node.on)) {
        const actionId = actionIds.get(actionKey);
        if (!actionId) throw new Error(`이벤트가 가리키는 액션이 없습니다: ${actionKey}`);
        events[eventName] = actionId;
        triggers.push({ nodeId: created[i].id, actionId, eventName });
      }
      await prisma.componentNode.update({ where: { id: created[i].id }, data: { eventsJson: JSON.stringify(events) } });
      eventCount += Object.keys(events).length;
    }
  }
  console.log(`연결: 이벤트 ${eventCount}개`);

  // ── 관계도 ───────────────────────────────────────────────────────────────
  // 관계는 화면·데이터·동작이 실제로 어떻게 이어져 있는지를 담는다. 배치에서 그대로 파생되므로
  // 손으로 그리지 않고 여기서 만든다(검증 규칙 E-REL-004는 이벤트 설정과 일치할 것을 요구한다).
  const relations: { fromType: string; fromId: string; toType: string; toId: string; kind: string }[] = [];
  for (const plan of pages) {
    const page = pageBySlug.get(plan.slug)!;
    const created = await prisma.componentNode.findMany({ where: { pageId: page.id }, orderBy: { order: 'asc' } });
    for (let i = 0; i < plan.nodes.length; i += 1) {
      const bind = plan.nodes[i].bind;
      if (!bind) continue;
      relations.push({ fromType: 'COMPONENT', fromId: created[i].id, toType: 'ENTITY', toId: entityOf(schema, bind.table).id, kind: 'READS' });
    }
  }
  for (const trigger of triggers) {
    relations.push({ fromType: 'COMPONENT', fromId: trigger.nodeId, toType: 'ACTION', toId: trigger.actionId, kind: 'TRIGGERS' });
  }
  for (const plan of actions) {
    const table = writesTable(plan);
    if (table) relations.push({ fromType: 'ACTION', fromId: actionIds.get(plan.key)!, toType: 'ENTITY', toId: entityOf(schema, table).id, kind: 'WRITES' });
    if (plan.kind === 'NAVIGATE') {
      relations.push({ fromType: 'ACTION', fromId: actionIds.get(plan.key)!, toType: 'PAGE', toId: pageIds.get(plan.pageSlug)!, kind: 'NAVIGATES' });
    }
  }
  // 같은 (from,to,kind)가 두 번 나오면 유니크 제약에 걸린다 — 한 컴포넌트가 같은 엔티티를 두 번
  // 읽는 경우(표+상세)는 자연스러우므로 여기서 접는다.
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

  console.log('\n초안에 반영했습니다. /admin/validate에서 확인한 뒤 배포하세요.');
}

main().finally(() => prisma.$disconnect());
