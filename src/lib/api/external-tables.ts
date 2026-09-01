import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * 바깥(써드파티)에서 읽고 쓸 수 있는 표의 **명단**.
 *
 * 주소에 적힌 이름을 그대로 표 이름으로 쓰지 않는다. 여기 적힌 것만 통과시키고, 통과한 뒤에도
 * 설계(메타 DB)에서 그 표를 찾아 칸 이름까지 확인한다 — 주소 문자열이 SQL에 닿는 길이 없다
 * (CLAUDE.md §4.1 "식별자 화이트리스트").
 *
 * **일부러 뺀 것들**
 *   · `far_analysis_log` — 분석 이력. 여기로 직접 넣으면 회차(rev)와 원장 갱신이 짝을 잃는다.
 *     그 표는 전용 창구가 따로 있다: `POST /api/far/analysis`(이력 추가 + 원장 갱신을 한
 *     트랜잭션으로 처리하고, 그 표는 고쳐 쓰거나 지울 수 없다).
 *   · 설계 DB(prisma/meta.db)의 표 전부 — 화면·컴포넌트·리비전은 업무 데이터가 아니다.
 */
export const EXTERNAL_TABLES = [
  'far_table',
  'dram_lf_table',
  'issue_page',
  'issue_row',
  'pkg_stack',
  'reball_table',
  'reball_cost_table',
  'tech_report',
  'tech_report_sample',
] as const;

export type ExternalTable = (typeof EXTERNAL_TABLES)[number];

/** 전용 창구가 따로 있는 표 — 이름을 물어보면 그쪽을 알려 준다. */
export const DEDICATED_ENDPOINT: Record<string, string> = {
  far_analysis_log: 'POST /api/far/analysis',
};

export function isExternalTable(name: string): name is ExternalTable {
  return (EXTERNAL_TABLES as readonly string[]).includes(name);
}

export type TableField = {
  /** 설계상의 id. 조회 조건(filters)이 이것을 열쇠로 쓴다 — 바깥에는 내보이지 않는다. */
  id: string;
  column: string;
  label: string;
  type: string;
  required: boolean;
};

export type TableInfo = {
  entityId: string;
  tableName: string;
  label: string;
  fields: TableField[];
};

/**
 * 표 하나의 설계 정보. 칸 이름·타입을 여기서 가져오므로, 바깥에서 보낸 칸 이름이 설계에 없으면
 * 쓰기가 그 자리에서 거절된다(crud.ts의 validateAndMap).
 */
export async function tableInfo(tableName: ExternalTable): Promise<TableInfo | null> {
  const entity = await prisma.entity.findFirst({
    where: { tableName },
    include: { fields: { orderBy: { order: 'asc' } } },
  });
  if (!entity) return null;
  return {
    entityId: entity.id,
    tableName: entity.tableName,
    label: entity.name,
    fields: entity.fields.map((f) => ({
      id: f.id,
      column: f.columnName,
      label: f.name,
      type: f.dataType,
      required: f.isRequired,
    })),
  };
}

/** 칸 이름 → 설계 정보. 바깥에서 온 이름은 반드시 이걸 거쳐야 한다. */
export function fieldsByColumn(info: TableInfo): Map<string, TableField> {
  return new Map(info.fields.map((f) => [f.column, f]));
}

export async function allTableInfo(): Promise<TableInfo[]> {
  const out: TableInfo[] = [];
  for (const name of EXTERNAL_TABLES) {
    const info = await tableInfo(name);
    if (info) out.push(info);
  }
  return out;
}
