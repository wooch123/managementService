import type { DraftSpec, ValidationCtx, DraftPage, DraftNode, DraftField, DraftEntity, DraftAction, DraftRelation } from '@/lib/validation/types';

export function makeSpec(overrides: Partial<DraftSpec> = {}): DraftSpec {
  return { pages: [], nodes: [], entities: [], actions: [], relations: [], ...overrides };
}

export function makeCtx(overrides: Partial<ValidationCtx> = {}): ValidationCtx {
  return {
    getRowCount: () => 0,
    hasDuplicateValues: () => false,
    tableExists: () => true,
    getColumnType: () => undefined,
    hasUncastableValues: () => false,
    getComponentMeta: () => ({ isContainer: false, allowedChildren: null, bindingModes: [], events: [] }),
    deploy: {
      pendingDestructiveChanges: [],
      acceptedDestructiveIds: new Set(),
      migrationDryRunError: null,
      previousRevisionPageSlugs: null,
      hasChangesSincePublish: true,
    },
    ...overrides,
  };
}

export function makePage(overrides: Partial<DraftPage> = {}): DraftPage {
  return {
    id: 'p1',
    slug: 'page-1',
    title: '페이지1',
    icon: null,
    parentId: null,
    order: 0,
    isVisible: true,
    isHome: false,
    layoutCols: 12,
    rowHeight: 8,
    gap: 16,
    ...overrides,
  };
}

export function makeNode(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    id: 'n1',
    pageId: 'p1',
    type: 'button',
    parentNodeId: null,
    order: 0,
    region: 'main',
    grid: { col: 1, span: 2, row: 1, rowSpan: 4 },
    props: {},
    binding: null,
    events: {},
    label: null,
    ...overrides,
  };
}

export function makeField(overrides: Partial<DraftField> = {}): DraftField {
  return {
    id: 'f1',
    entityId: 'e1',
    name: '필드1',
    columnName: 'field_1',
    dataType: 'TEXT',
    isRequired: false,
    isUnique: false,
    isPrimary: false,
    defaultVal: null,
    enumValues: null,
    refEntityId: null,
    order: 0,
    ...overrides,
  };
}

export function makeEntity(overrides: Partial<DraftEntity> = {}): DraftEntity {
  return { id: 'e1', name: '엔티티1', tableName: 'entity_1', description: null, order: 0, fields: [], ...overrides };
}

export function makeAction(overrides: Partial<DraftAction> = {}): DraftAction {
  return {
    id: 'a1',
    name: '액션1',
    kind: 'TOAST',
    config: { kind: 'TOAST', variant: 'default', message: 'hi' },
    description: null,
    ...overrides,
  };
}

export function makeRelation(overrides: Partial<DraftRelation> = {}): DraftRelation {
  return { id: 'r1', fromType: 'COMPONENT', fromId: 'n1', toType: 'ENTITY', toId: 'e1', kind: 'READS', cardinality: null, labelText: null, ...overrides };
}
