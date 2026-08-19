import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};
const { PrismaClient } = await import('@prisma/client');
const { metaDbUrl } = await import('@/lib/db/paths');

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });
const dep = await prisma.deployment.findUnique({ where: { id: 'singleton' } });
const rev = await prisma.revision.findUnique({ where: { id: dep!.activeRevisionId! } });
type N = { id: string; type: string; parentNodeId: string | null; props: Record<string, unknown>; events: Record<string, string>; grid: { row: number } };
const spec = JSON.parse(rev!.specJson) as { pages: { slug: string; title: string; nodes: N[] }[]; actions: { id: string; name: string; config: { kind: string } }[] };
await prisma.$disconnect();

const actionName = new Map(spec.actions.map((a) => [a.id, `${a.name} [${a.config.kind}]`]));

for (const page of spec.pages) {
  const top = page.nodes.filter((n) => !n.parentNodeId).sort((a, b) => a.grid.row - b.grid.row);
  const buttons = page.nodes.filter((n) => n.type === 'button');
  const tables = page.nodes.filter((n) => n.type === 'data-table');
  const lists = page.nodes.filter((n) => ['list-panel', 'article-cards', 'issue-list', 'record-timeline'].includes(n.type));
  const tiles = page.nodes.filter((n) => n.type === 'stat-tile');
  const navs = page.nodes.filter((n) => ['nav-cards', 'metric-cards'].includes(n.type));

  console.log(`\n## ${page.slug} (${page.title}) — 최상위 ${top.length}`);
  for (const b of buttons) console.log(`  버튼 "${b.props.label}" → ${actionName.get(Object.values(b.events)[0] ?? '') ?? '(연결 없음)'}`);
  for (const t of tables) {
    const sel = t.props.selectParam ? `선택 ?${t.props.selectParam}` : '행 클릭 없음';
    console.log(`  표 "${t.props.title}" — ${sel}`);
  }
  for (const l of lists) console.log(`  ${l.type} "${l.props.title ?? ''}" — 항목 클릭 없음`);
  for (const t of tiles) console.log(`  지표 "${t.props.title}" — 클릭 없음`);
  for (const n of navs) console.log(`  ${n.type} — 카드 링크 있음`);
}
process.exit(0);
