/**
 * 배선 점검 — 화면의 "누를 수 있는 것"이 실제로 무언가에 이어져 있는지 본다.
 *
 * 검증 51규칙은 설계가 **말이 되는지**를 본다(없는 액션을 가리키지 않는가). 이 도구는 한 걸음 더
 * 나아가 **의도대로 이어졌는지**를 본다 — 눌러도 아무 일이 없는 버튼, 어디서도 값을 받지 않는
 * 입력칸, 다른 페이지의 입력을 가리키는 액션처럼 "구조는 맞는데 동작하지 않는" 것들이다.
 * 이런 건 화면을 열어 하나씩 눌러 보기 전에는 드러나지 않는다.
 *
 * 배포된 스펙(활성 리비전)을 본다 — 운영 화면이 실제로 그리는 것이 그것이기 때문이다.
 *
 * 실행: pnpm audit:wiring
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
const { nodeMeta } = await import('@/lib/registry/node-meta.generated');

type Node = {
  id: string;
  type: string;
  parentNodeId: string | null;
  props: Record<string, unknown>;
  binding: { mode?: string; entityId?: string; filters?: { ref?: string; source?: string }[] } | null;
  events: Record<string, string>;
  grid: { row: number; col: number };
};
type Page = { id: string; slug: string; title: string; nodes: Node[] };
type Action = { id: string; name: string; config: Record<string, unknown> };
type Spec = { revisionNo: number; pages: Page[]; actions: Action[]; entities: { id: string; name: string; tableName: string; fields: { id: string; columnName: string; name: string }[] }[] };

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });
const deployment = await prisma.deployment.findUnique({ where: { id: 'singleton' } });
const revision = await prisma.revision.findUnique({ where: { id: deployment!.activeRevisionId! } });
const spec = JSON.parse(revision!.specJson) as Spec;
await prisma.$disconnect();

const problems: { page: string; kind: string; detail: string }[] = [];
const note = (page: string, kind: string, detail: string) => problems.push({ page, kind, detail });

const pageOfNode = new Map<string, Page>();
for (const page of spec.pages) for (const node of page.nodes) pageOfNode.set(node.id, page);
const nodeById = new Map<string, Node>();
for (const page of spec.pages) for (const node of page.nodes) nodeById.set(node.id, node);
const actionById = new Map(spec.actions.map((a) => [a.id, a]));

/** 액션이 값을 받아 오는 노드들(fieldMap + keySource) */
function referencedNodes(config: Record<string, unknown>): string[] {
  const out: string[] = [];
  const fieldMap = (config.fieldMap ?? {}) as Record<string, { from: string; nodeId?: string }>;
  for (const src of Object.values(fieldMap)) if (src.from === 'component' && src.nodeId) out.push(src.nodeId);
  const key = config.keySource as { from?: string; nodeId?: string } | undefined;
  if (key?.from === 'component' && key.nodeId) out.push(key.nodeId);
  return out;
}

/** 액션이 필요로 하는 주소 파라미터(route) */
function routeParamsOf(config: Record<string, unknown>): string[] {
  const out: string[] = [];
  const fieldMap = (config.fieldMap ?? {}) as Record<string, { from: string; param?: string }>;
  for (const src of Object.values(fieldMap)) if (src.from === 'route' && src.param) out.push(src.param);
  const key = config.keySource as { from?: string; param?: string } | undefined;
  if (key?.from === 'route' && key.param) out.push(key.param);
  return out;
}

// ── 1) 눌러도 아무 일이 없는 것 ───────────────────────────────────────────────
for (const page of spec.pages) {
  for (const node of page.nodes) {
    const meta = nodeMeta[node.type];
    if (!meta) {
      note(page.slug, '알 수 없는 컴포넌트', node.type);
      continue;
    }
    const canFire = meta.events.length > 0;
    const wired = Object.keys(node.events).length > 0;
    // 버튼류는 이벤트가 없으면 장식이다.
    if (node.type === 'button' && !wired) {
      note(page.slug, '눌러도 아무 일 없는 버튼', String(node.props.label ?? '(라벨 없음)'));
    }
    // 입력류는 어떤 액션도 값을 읽지 않으면 적어도 저장되지 않는다.
    const isInput = ['input', 'textarea', 'option-select', 'select', 'native-select', 'date-picker'].includes(node.type);
    if (isInput) {
      const used = spec.actions.some((a) => referencedNodes(a.config).includes(node.id));
      if (!used) note(page.slug, '어디서도 읽지 않는 입력칸', String(node.props.label ?? node.type));
    }
    if (canFire && !wired && !isInput && node.type !== 'button' && node.type !== 'data-table') {
      // 참고만 — 이벤트를 가질 수 있으나 안 쓴 컴포넌트
    }
  }
}

// ── 2) 액션이 다른 페이지의 입력을 가리키는지 ─────────────────────────────────
for (const action of spec.actions) {
  const refs = referencedNodes(action.config);
  const pages = new Set(refs.map((id) => pageOfNode.get(id)?.slug ?? '(없음)'));
  if (pages.size > 1) {
    note('(액션)', '여러 페이지의 입력을 섞어 읽는 액션', `${action.name} → ${[...pages].join(', ')}`);
  }
  for (const ref of refs) {
    if (!nodeById.has(ref)) note('(액션)', '없는 노드를 가리키는 액션', `${action.name} → ${ref}`);
  }
}

// ── 3) 액션을 부르는 곳이 있는지 ─────────────────────────────────────────────
const triggered = new Set<string>();
for (const page of spec.pages) for (const node of page.nodes) for (const id of Object.values(node.events)) triggered.add(id);
const chained = new Set<string>();
for (const action of spec.actions) {
  const config = action.config as { onSuccess?: string | null; onError?: string | null; steps?: string[] };
  if (config.onSuccess) chained.add(config.onSuccess);
  if (config.onError) chained.add(config.onError);
  for (const step of config.steps ?? []) chained.add(step);
}
for (const action of spec.actions) {
  if (!triggered.has(action.id) && !chained.has(action.id)) {
    note('(액션)', '아무도 부르지 않는 액션', action.name);
  }
}

// ── 4) 선택(sel)이 필요한데 그 페이지에 선택할 표가 없는지 ────────────────────
for (const page of spec.pages) {
  const selectParams = new Set(
    page.nodes
      .filter((n) => n.type === 'data-table' && typeof n.props.selectParam === 'string' && n.props.selectParam !== '')
      .map((n) => String(n.props.selectParam))
  );
  // 이 페이지의 버튼이 부르는 액션이 route 파라미터를 요구하는지
  for (const node of page.nodes) {
    for (const actionId of Object.values(node.events)) {
      const action = actionById.get(actionId);
      if (!action) continue;
      for (const param of routeParamsOf(action.config)) {
        if (!selectParams.has(param)) {
          note(page.slug, '선택값을 쓰는데 고를 표가 없음', `${action.name} 이(가) ?${param} 를 요구`);
        }
      }
    }
  }
  // 바인딩이 주소 파라미터를 참조하는데 그 값을 만드는 컴포넌트가 페이지에 있는지
  const producers = new Set<string>();
  for (const node of page.nodes) {
    if (node.type === 'data-table' && node.props.selectParam) producers.add(String(node.props.selectParam));
    if (node.type === 'status-filter' && node.props.param) producers.add(String(node.props.param));
    if (node.type === 'search-filter' && node.props.param) producers.add(String(node.props.param));
    if (node.type === 'select-filter' && node.props.param) producers.add(String(node.props.param));
    if (node.type === 'date-range-filter') {
      producers.add('from');
      producers.add('to');
      producers.add('preset');
    }
  }
  producers.add('today'); // 서버가 항상 넣어 준다
  for (const node of page.nodes) {
    for (const filter of node.binding?.filters ?? []) {
      if (filter.source !== 'query' || !filter.ref) continue;
      if (!producers.has(filter.ref)) {
        note(page.slug, '값을 만들 컴포넌트가 없는 조건', `${node.type}(r${node.grid.row}) 가 ?${filter.ref} 를 참조`);
      }
    }
  }
}

// ── 5) 컨테이너 자식이 실제로 붙어 있는지 ────────────────────────────────────
for (const page of spec.pages) {
  for (const node of page.nodes) {
    const meta = nodeMeta[node.type];
    if (!meta?.isContainer) continue;
    const children = page.nodes.filter((n) => n.parentNodeId === node.id);
    if (children.length === 0) note(page.slug, '자식이 없는 컨테이너', `${node.type} "${String(node.props.title ?? '')}"`);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
const buttons = spec.pages.flatMap((p) => p.nodes.filter((n) => n.type === 'button'));
const inputs = spec.pages.flatMap((p) =>
  p.nodes.filter((n) => ['input', 'textarea', 'option-select'].includes(n.type))
);
console.log(`리비전 #${spec.revisionNo} — 화면 ${spec.pages.length} · 컴포넌트 ${spec.pages.reduce((n, p) => n + p.nodes.length, 0)} · 액션 ${spec.actions.length}`);
console.log(`버튼 ${buttons.length}개 · 입력칸 ${inputs.length}개 · 이벤트 연결 ${[...triggered].length}개\n`);

if (problems.length === 0) {
  console.log('배선 문제 없음 ✅');
} else {
  const byKind = new Map<string, { page: string; detail: string }[]>();
  for (const p of problems) {
    byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), { page: p.page, detail: p.detail }]);
  }
  for (const [kind, items] of byKind) {
    console.log(`⚠️  ${kind} — ${items.length}건`);
    for (const item of items) console.log(`     · [${item.page}] ${item.detail}`);
  }
  console.log(`\n총 ${problems.length}건`);
}
process.exit(problems.length > 0 ? 1 : 0);
