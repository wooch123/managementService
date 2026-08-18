import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { DraftSpec, ValidationTargetType } from '@/lib/validation/types';

export async function loadDraftSpec(): Promise<DraftSpec> {
  const [pages, nodes, entities, actions, relations] = await Promise.all([
    prisma.page.findMany(),
    prisma.componentNode.findMany(),
    prisma.entity.findMany({ include: { fields: { orderBy: { order: 'asc' } } } }),
    prisma.action.findMany(),
    prisma.relation.findMany(),
  ]);

  return {
    pages: pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      icon: p.icon,
      parentId: p.parentId,
      order: p.order,
      isVisible: p.isVisible,
      isHome: p.isHome,
      asideVisible: p.asideVisible,
      layoutCols: p.layoutCols,
      rowHeight: p.rowHeight,
      gap: p.gap,
    })),
    nodes: nodes.map((n) => ({
      id: n.id,
      pageId: n.pageId,
      type: n.type,
      parentNodeId: n.parentNodeId,
      order: n.order,
      region: n.region === 'aside' ? ('aside' as const) : ('main' as const),
      grid: { col: n.gridCol, span: n.gridSpan, row: n.gridRow, rowSpan: n.gridRowSpan },
      props: JSON.parse(n.propsJson) as Record<string, unknown>,
      binding: n.bindingJson ? JSON.parse(n.bindingJson) : null,
      events: JSON.parse(n.eventsJson) as Record<string, string>,
      label: n.label,
    })),
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      tableName: e.tableName,
      description: e.description,
      order: e.order,
      fields: e.fields.map((f) => ({
        id: f.id,
        entityId: f.entityId,
        name: f.name,
        columnName: f.columnName,
        dataType: f.dataType,
        isRequired: f.isRequired,
        isUnique: f.isUnique,
        isPrimary: f.isPrimary,
        defaultVal: f.defaultVal,
        enumValues: f.enumValues ? (JSON.parse(f.enumValues) as string[]) : null,
        refEntityId: f.refEntityId,
        order: f.order,
      })),
    })),
    actions: actions.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      config: JSON.parse(a.configJson) as Record<string, unknown> & { kind: string },
      description: a.description,
    })),
    relations: relations.map((r) => ({
      id: r.id,
      fromType: r.fromType as ValidationTargetType,
      fromId: r.fromId,
      toType: r.toType as ValidationTargetType,
      toId: r.toId,
      kind: r.kind,
      cardinality: r.cardinality,
      labelText: r.labelText,
    })),
  };
}
