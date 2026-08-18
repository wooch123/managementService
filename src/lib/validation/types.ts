export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationCategory = 'structure' | 'data' | 'action' | 'relation' | 'deploy';
export type ValidationTargetType = 'PAGE' | 'COMPONENT' | 'ENTITY' | 'FIELD' | 'ACTION' | 'RELATION' | 'GLOBAL';

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  message: string;
  target: { type: ValidationTargetType; id: string };
  fixable: boolean;
};

export type DraftPage = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: number;
  isVisible: boolean;
  isHome: boolean;
  asideVisible: boolean;
  layoutCols: number;
  rowHeight: number;
  gap: number;
};

export type DraftGrid = { col: number; span: number; row: number; rowSpan: number };

export type DraftNode = {
  id: string;
  pageId: string;
  type: string;
  parentNodeId: string | null;
  order: number;
  region: 'main' | 'aside';
  grid: DraftGrid;
  props: Record<string, unknown>;
  binding: unknown;
  events: Record<string, string>;
  label: string | null;
};

export type DraftField = {
  id: string;
  entityId: string;
  name: string;
  columnName: string;
  dataType: string;
  isRequired: boolean;
  isUnique: boolean;
  isPrimary: boolean;
  defaultVal: string | null;
  enumValues: string[] | null;
  refEntityId: string | null;
  order: number;
};

export type DraftEntity = {
  id: string;
  name: string;
  tableName: string;
  description: string | null;
  order: number;
  fields: DraftField[];
};

export type DraftAction = {
  id: string;
  name: string;
  kind: string;
  config: Record<string, unknown> & { kind: string };
  description: string | null;
};

export type DraftRelation = {
  id: string;
  fromType: ValidationTargetType;
  fromId: string;
  toType: ValidationTargetType;
  toId: string;
  kind: string;
  cardinality: string | null;
  labelText: string | null;
};

export type DraftSpec = {
  pages: DraftPage[];
  nodes: DraftNode[];
  entities: DraftEntity[];
  actions: DraftAction[];
  relations: DraftRelation[];
};

/** §11.6: 규칙 함수는 DB에 직접 접근하지 않고 이 ctx를 통해서만 조회한다 → 단위 테스트에서
 * 가짜 ctx를 주입해 app.db 없이도 순수하게 테스트할 수 있다. */
export type ValidationCtx = {
  getRowCount: (tableName: string) => number;
  hasDuplicateValues: (tableName: string, columnName: string) => boolean;
  tableExists: (tableName: string) => boolean;
  /** 실제 물리 컬럼 SQLite 타입("TEXT"/"INTEGER"/"REAL") — 컬럼이 없으면 undefined */
  getColumnType: (tableName: string, columnName: string) => string | undefined;
  /** 캐스팅 불가 여부를 직접 검사(§6.5 안전 캐스팅 규칙과 동일 기준) — 값이 하나라도 실패하면 true */
  hasUncastableValues: (tableName: string, columnName: string, targetDataType: string) => boolean;
  getComponentMeta: (type: string) =>
    | { isContainer: boolean; allowedChildren: string[] | null; bindingModes: string[]; events: string[] }
    | undefined;
  /** §11.5 배포 안전성 규칙 전용 — P8(배포 파이프라인) 이전에는 항상 기본값(변경 없음/이전
   * 리비전 없음)이며, P8의 배포 엔드포인트가 실제 배포 시도 시점의 값을 주입한다. */
  deploy: {
    pendingDestructiveChanges: { description: string; id: string }[];
    acceptedDestructiveIds: Set<string>;
    migrationDryRunError: string | null;
    previousRevisionPageSlugs: string[] | null;
    hasChangesSincePublish: boolean;
  };
};

export type ValidationRule = {
  code: string;
  run: (spec: DraftSpec, ctx: ValidationCtx) => ValidationIssue[];
};
