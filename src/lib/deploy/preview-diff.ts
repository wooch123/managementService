import 'server-only';
import type { DraftSpec } from '@/lib/validation/types';
import type { PublishedSpec } from '@/types/spec';
import type { SchemaChange } from '@/lib/data-engine/diff';

export type DiffKind = 'added' | 'modified' | 'removed';
export type DiffItem = { kind: DiffKind; id: string; label: string; before?: unknown; after?: unknown };

export type ComponentsByPage = { pageId: string; pageTitle: string; added: number; modified: number; removed: number };

export type DeployPreview = {
  pages: DiffItem[];
  componentsByPage: ComponentsByPage[];
  actions: DiffItem[];
  relations: DiffItem[];
  schemaChanges: SchemaChange[];
  hasAnyChange: boolean;
};

function diffById<T extends { id: string }>(before: T[], after: T[], label: (item: T) => string): DiffItem[] {
  const beforeMap = new Map(before.map((b) => [b.id, b]));
  const afterMap = new Map(after.map((a) => [a.id, a]));
  const items: DiffItem[] = [];
  for (const a of after) {
    const b = beforeMap.get(a.id);
    if (!b) items.push({ kind: 'added', id: a.id, label: label(a), after: a });
    else if (JSON.stringify(b) !== JSON.stringify(a)) items.push({ kind: 'modified', id: a.id, label: label(a), before: b, after: a });
  }
  for (const b of before) {
    if (!afterMap.has(b.id)) items.push({ kind: 'removed', id: b.id, label: label(b), before: b });
  }
  return items;
}

/**
 * §8.6 좌측 "변경 요약(diff)" — 직전 활성 리비전(없으면 전부 "추가"로 취급)과 현재 드래프트를
 * id 기준으로 비교한다. 사람이 읽는 필드별 비교까지는 만들지 않고, 각 항목의 이전/이후 전체
 * 객체를 그대로 넘긴다 — 화면에서 JSON으로 펼쳐 보이는 정도로 충분하다고 판단했다.
 */
export function computeDeployPreview(draft: DraftSpec, schemaChanges: SchemaChange[], lastSpec: PublishedSpec | null): DeployPreview {
  const beforePages = (lastSpec?.pages ?? []).map((p) => ({
    id: p.id, slug: p.slug, title: p.title, icon: p.icon, parentId: p.parentId, order: p.order, isVisible: p.isVisible, isHome: p.isHome,
  }));
  const afterPages = draft.pages.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, icon: p.icon, parentId: p.parentId, order: p.order, isVisible: p.isVisible, isHome: p.isHome,
  }));
  const pages = diffById(beforePages, afterPages, (p) => p.title);

  const beforeNodes = (lastSpec?.pages ?? []).flatMap((p) =>
    p.nodes.map((n) => ({
      id: n.id, pageId: p.id, type: n.type, parentNodeId: n.parentNodeId, order: n.order,
      grid: n.grid, props: n.props, binding: n.binding, events: n.events, label: n.label,
    }))
  );
  const afterNodes = draft.nodes.map((n) => ({
    id: n.id, pageId: n.pageId, type: n.type, parentNodeId: n.parentNodeId, order: n.order,
    grid: n.grid, props: n.props, binding: n.binding, events: n.events, label: n.label,
  }));
  const nodeDiff = diffById(beforeNodes, afterNodes, (n) => n.type);

  const pageIdOf = (item: DiffItem): string | undefined =>
    (item.after as { pageId?: string } | undefined)?.pageId ?? (item.before as { pageId?: string } | undefined)?.pageId;

  const componentsByPage: ComponentsByPage[] = draft.pages
    .map((p) => {
      const items = nodeDiff.filter((d) => pageIdOf(d) === p.id);
      return {
        pageId: p.id,
        pageTitle: p.title,
        added: items.filter((i) => i.kind === 'added').length,
        modified: items.filter((i) => i.kind === 'modified').length,
        removed: items.filter((i) => i.kind === 'removed').length,
      };
    })
    .filter((p) => p.added + p.modified + p.removed > 0);

  // config/kind는 PublishedSpec 쪽이 zod로 좁혀진 타입이라 DraftSpec 쪽(느슨한 string)과
  // 그대로는 diffById<T>의 T를 통합 추론할 수 없다 — 비교는 어차피 JSON.stringify 기준이라
  // unknown으로 넓혀도 무해하다.
  const beforeActions = (lastSpec?.actions ?? []).map((a) => ({ id: a.id, name: a.name, config: a.config as unknown, description: a.description }));
  const afterActions = draft.actions.map((a) => ({ id: a.id, name: a.name, config: a.config as unknown, description: a.description }));
  const actions = diffById(beforeActions, afterActions, (a) => a.name);

  const beforeRelations = (lastSpec?.relations ?? []).map((r) => ({ ...r, kind: r.kind as string }));
  const afterRelations = draft.relations.map((r) => ({ ...r, kind: r.kind as string }));
  const relations = diffById(beforeRelations, afterRelations, (r) => `${r.fromType}→${r.toType}(${r.kind})`);

  const hasAnyChange = pages.length > 0 || componentsByPage.length > 0 || actions.length > 0 || relations.length > 0 || schemaChanges.length > 0;

  return { pages, componentsByPage, actions, relations, schemaChanges, hasAnyChange };
}
