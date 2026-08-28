/**
 * 청사진 적용 스크립트가 함께 쓰는 뼈대 — 설계(계획) → 메타 DB(초안) 변환.
 *
 * 페이지 배치를 손으로 쓰면 fieldId·nodeId 같은 난수 id가 계획서를 뒤덮어 읽을 수 없다. 계획은
 * **테이블명·컬럼명·노드 별칭**으로만 적고, id 해석은 전부 여기서 한다. 배치가 겹치는지도 여기서
 * 검사한다 — 좌표를 손으로 적는 이상 겹침은 반드시 생기고, 겹치면 화면에서 카드가 서로를 덮는다.
 */
import type { PrismaClient } from '@prisma/client';

export type FilterPlan = {
  col: string;
  /** 같은 값을 여러 컬럼 중 하나라도 만족하면 되는 조건(통합 검색). 비우면 col 하나만 본다. */
  cols?: string[];
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'isNull' | 'isNotNull';
  source: 'fixed' | 'query';
  value?: unknown;
  /** source: 'query'일 때 주소 파라미터 이름 */
  ref?: string;
  /** 주소에 값이 없을 때 — 'ignore'(기본, 조건을 뺀다) / 'empty'(아무것도 보여주지 않는다) */
  whenMissing?: 'ignore' | 'empty';
};

export type BindPlan =
  | {
      mode: 'list';
      table: string;
      select: string[];
      filters?: FilterPlan[];
      sort?: [string, 'asc' | 'desc'][];
      pageSize?: number;
    }
  | {
      mode: 'aggregate';
      table: string;
      fn: 'count' | 'sum' | 'avg' | 'min' | 'max';
      field?: string;
      filters?: FilterPlan[];
      compare?: boolean;
      /** 보조 수치를 위한 두 번째 조건 세트 */
      secondaryFilters?: FilterPlan[];
    }
  | {
      mode: 'group';
      table: string;
      groupField: string;
      groupTransform?: 'none' | 'month' | 'week' | 'year';
      fn?: 'count' | 'sum' | 'avg';
      valueField?: string;
      filters?: FilterPlan[];
      orderBy?: 'value' | 'label';
      limit?: number;
    };

export type NodePlan = {
  /** 액션이 이 노드를 가리킬 때 쓰는 별칭(스크립트 안에서만 쓰인다) */
  key?: string;
  type: string;
  col: number;
  span: number;
  row: number;
  rowSpan: number;
  props?: Record<string, unknown>;
  bind?: BindPlan;
  /** 이벤트 → 액션 별칭 */
  on?: Record<string, string>;
  /** data-table의 열 머리글을 select 순서대로 덮어쓴다(비우면 필드 이름 그대로) */
  headers?: string[];
  /** data-table의 칸 서식을 select 순서대로 덮어쓴다(비우면 칸 타입에서 정한다). null은 '기본값 그대로'. */
  formats?: (CellFormat | null)[];
  /**
   * 바인딩 말고 **전용 창구로** 읽고 쓰는 표들(테이블명).
   *
   * 화면 하나가 표 여러 개를 오가며 문서 단위로 저장하는 경우(Tech Report)는 바인딩 하나로
   * 표현되지 않는다. 그래도 관계도가 그 의존을 모르면 "아무도 안 쓰는 표"로 그려지므로,
   * 실제로 읽는 표를 여기에 적어 관계로 남긴다.
   */
  reads?: string[];
  /**
   * 컨테이너의 자식(폼 카드 안의 입력들, 페이지 머리 옆 버튼들).
   * 자식은 좌표를 갖지 않는다 — 부모가 순서대로 배치한다.
   */
  children?: NodePlan[];
};

export type PagePlan = {
  slug: string;
  title?: string;
  icon?: string;
  /** 슬러그를 바꿀 때(예: page-6v05og → feedback) */
  newSlug?: string;
  nodes: NodePlan[];
};

export type ValuePlan =
  | { from: 'literal'; value: unknown }
  /** `path`를 주면 그 컴포넌트의 값(객체)에서 키 하나만 집어 온다 — 여러 칸이 함께 정해지는 값(Reball 단가)용. */
  | { from: 'component'; node: string; path?: string }
  | { from: 'route'; param: string }
  | { from: 'now' }
  | { from: 'sequence'; prefix: string; digits?: number };

export type ActionPlan =
  | { key: string; name: string; desc: string; kind: 'CREATE'; table: string; values: Record<string, ValuePlan>; onSuccess?: string }
  | {
      key: string;
      name: string;
      desc: string;
      kind: 'UPDATE';
      table: string;
      keyCol: string;
      keyFrom: ValuePlan;
      values: Record<string, ValuePlan>;
      onSuccess?: string;
    }
  | { key: string; name: string; desc: string; kind: 'QUERY'; table: string; targetNode: string }
  | { key: string; name: string; desc: string; kind: 'NAVIGATE'; pageSlug: string }
  | { key: string; name: string; desc: string; kind: 'TOAST'; variant: 'default' | 'success' | 'destructive'; message: string }
  | { key: string; name: string; desc: string; kind: 'COMPOSITE'; steps: string[] }
  | { key: string; name: string; desc: string; kind: 'EXPORT_CSV'; table: string; filename: string };

// ── 스키마 조회 ──────────────────────────────────────────────────────────────

export type FieldInfo = { id: string; name: string; columnName: string; dataType: string; enumValues: string[] | null };
export type EntityInfo = { id: string; name: string; tableName: string; fields: Map<string, FieldInfo> };

export async function loadSchema(prisma: PrismaClient): Promise<Map<string, EntityInfo>> {
  const entities = await prisma.entity.findMany({ include: { fields: { orderBy: { order: 'asc' } } } });
  const map = new Map<string, EntityInfo>();
  for (const entity of entities) {
    map.set(entity.tableName, {
      id: entity.id,
      name: entity.name,
      tableName: entity.tableName,
      fields: new Map(
        entity.fields.map((f) => [
          f.columnName,
          {
            id: f.id,
            name: f.name,
            columnName: f.columnName,
            dataType: f.dataType,
            enumValues: f.enumValues ? (JSON.parse(f.enumValues) as string[]) : null,
          },
        ])
      ),
    });
  }
  return map;
}

export function entityOf(schema: Map<string, EntityInfo>, table: string): EntityInfo {
  const entity = schema.get(table);
  if (!entity) throw new Error(`엔티티(테이블)를 찾을 수 없습니다: ${table}`);
  return entity;
}

export function fieldOf(schema: Map<string, EntityInfo>, table: string, col: string): FieldInfo {
  const field = entityOf(schema, table).fields.get(col);
  if (!field) throw new Error(`필드를 찾을 수 없습니다: ${table}.${col}`);
  return field;
}

/** 설계에 적힌 ENUM 값 목록 — 화면의 선택 상자 옵션을 여기서 가져오면 설계와 어긋날 일이 없다. */
export function enumOf(schema: Map<string, EntityInfo>, table: string, col: string): string[] {
  const field = fieldOf(schema, table, col);
  if (!field.enumValues) throw new Error(`ENUM 필드가 아닙니다: ${table}.${col}`);
  return field.enumValues;
}

// ── 계획 → JSON ─────────────────────────────────────────────────────────────

function toFilters(schema: Map<string, EntityInfo>, table: string, filters: FilterPlan[] | undefined) {
  return (filters ?? []).map((f) => {
    const base = {
      fieldId: fieldOf(schema, table, f.col).id,
      ...(f.cols ? { fieldIds: f.cols.map((c) => fieldOf(schema, table, c).id) } : {}),
      op: f.op,
      source: f.source,
    };
    return f.source === 'fixed'
      ? { ...base, value: f.value }
      : { ...base, ref: f.ref, ...(f.whenMissing ? { whenMissing: f.whenMissing } : {}) };
  });
}

export function toBindingJson(schema: Map<string, EntityInfo>, bind: BindPlan): string {
  if (bind.mode === 'list') {
    return JSON.stringify({
      mode: 'list',
      entityId: entityOf(schema, bind.table).id,
      select: bind.select.map((col) => fieldOf(schema, bind.table, col).id),
      filters: toFilters(schema, bind.table, bind.filters),
      sort: (bind.sort ?? []).map(([col, dir]) => ({ fieldId: fieldOf(schema, bind.table, col).id, dir })),
      pageSize: bind.pageSize ?? 30,
    });
  }
  if (bind.mode === 'aggregate') {
    return JSON.stringify({
      mode: 'aggregate',
      entityId: entityOf(schema, bind.table).id,
      fn: bind.fn,
      ...(bind.field ? { fieldId: fieldOf(schema, bind.table, bind.field).id } : {}),
      filters: toFilters(schema, bind.table, bind.filters),
      compare: bind.compare ?? false,
      ...(bind.secondaryFilters ? { secondaryFilters: toFilters(schema, bind.table, bind.secondaryFilters) } : {}),
    });
  }
  return JSON.stringify({
    mode: 'group',
    entityId: entityOf(schema, bind.table).id,
    groupFieldId: fieldOf(schema, bind.table, bind.groupField).id,
    groupTransform: bind.groupTransform ?? 'none',
    fn: bind.fn ?? 'count',
    ...(bind.valueField ? { valueFieldId: fieldOf(schema, bind.table, bind.valueField).id } : {}),
    filters: toFilters(schema, bind.table, bind.filters),
    orderBy: bind.orderBy ?? 'value',
    limit: bind.limit ?? 20,
  });
}

export type CellFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'badge' | 'boolean';

/**
 * 칸의 타입만 보고 고를 수 있는 서식.
 *
 * 조회 결과는 저장 형태 그대로 온다 — BOOLEAN이 0/1로, 숫자가 서식 없이 나온다. 타입에서
 * 자연스럽게 정해지는 것은 여기서 정하고, 같은 타입이라도 달리 읽어야 하는 것(가격 등)은
 * 설계에서 `formats`로 덮는다.
 */
function defaultFormat(dataType: string): CellFormat {
  if (dataType === 'BOOLEAN') return 'boolean';
  if (dataType === 'INTEGER' || dataType === 'REAL') return 'number';
  if (dataType === 'DATETIME') return 'datetime';
  if (dataType === 'DATE') return 'date';
  if (dataType === 'ENUM') return 'badge';
  return 'text';
}

/** data-table은 열 머리글·서식을 props로 받는다 — 바인딩의 select 순서 그대로 만들어 준다. */
export function tableColumns(schema: Map<string, EntityInfo>, bind: BindPlan, headers?: string[], formats?: (CellFormat | null)[]) {
  if (bind.mode !== 'list') return [];
  return bind.select.map((col, index) => {
    const field = fieldOf(schema, bind.table, col);
    const format = formats?.[index] ?? defaultFormat(field.dataType);
    return {
      fieldId: field.id,
      header: headers?.[index] ?? field.name,
      align: format === 'number' || format === 'currency' ? 'right' : format === 'boolean' ? 'center' : 'left',
      format,
    };
  });
}

// ── 겹침 검사 ───────────────────────────────────────────────────────────────

/** 같은 페이지에서 두 컴포넌트가 같은 칸을 쓰면 화면에서 서로를 덮는다. 배포 전에 여기서 잡는다. */
export function assertNoOverlap(page: PagePlan): void {
  const boxes = page.nodes.map((n) => ({ n, x1: n.col, x2: n.col + n.span, y1: n.row, y2: n.row + n.rowSpan }));
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (a.x1 < 1 || a.x2 > 13) throw new Error(`[${page.slug}] 12칼럼을 벗어남: ${a.n.type} col=${a.n.col} span=${a.n.span}`);
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) {
        throw new Error(
          `[${page.slug}] 배치가 겹칩니다: ${a.n.type}(c${a.n.col} r${a.n.row}) ↔ ${b.n.type}(c${b.n.col} r${b.n.row})`
        );
      }
    }
  }
}
