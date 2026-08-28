import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { findPublishedEntity, findPublishedNode } from '@/lib/runtime/binding-query';
import type { ApiResult } from '@/types/auth';

/**
 * 단가표 저장 — Reball 의뢰서 화면의 '단가 수정'이 부른다.
 *
 * 왜 일반 액션(§9 UPDATE)이 아닌가: 단가표는 **행이 하나뿐인 설정 표**다. 액션의 UPDATE는 대상
 * 행을 가리킬 열쇠를 요구하는데, 여기에는 고를 목록도 열쇠도 없다("그 한 줄"이 전부다). 아직
 * 한 줄도 없으면 만들어야 한다는 점도 다르다.
 *
 * 어디까지 쓸 수 있는가 — 경계를 좁게 못 박는다:
 *   · 대상 표는 **그 노드의 바인딩**이 정한다(클라이언트가 표 이름을 보내지 않는다).
 *   · 노드 종류가 `reball-cost`가 아니면 거절한다.
 *   · 설계에 있는 **숫자 필드**만 쓸 수 있다(텍스트·날짜 칸은 이 길로 바뀌지 않는다).
 *   · 값은 유한한 0 이상의 수만 받는다.
 */
const COST_NODE_TYPE = 'reball-cost';
const MAX_COST = 100_000_000;

const bodySchema = z.object({
  nodeId: z.string().min(1).max(40),
  values: z.record(z.string().max(64), z.number().finite().min(0).max(MAX_COST)),
});

function fail(code: string, message: string, status: number) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', '입력값이 올바르지 않습니다.', 400);

  const spec = await getActiveSpec();
  if (!spec) return fail('NOT_DEPLOYED', '배포된 구성이 없습니다.', 404);

  const node = findPublishedNode(spec, parsed.data.nodeId);
  if (!node || node.type !== COST_NODE_TYPE) return fail('NOT_FOUND', '단가표를 수정할 수 있는 화면이 아닙니다.', 404);
  if (!node.binding || node.binding.mode !== 'list') return fail('NOT_FOUND', '단가표가 연결되어 있지 않습니다.', 404);

  const entity = findPublishedEntity(spec, node.binding.entityId);
  const numericColumns = new Map(
    entity.fields.filter((f) => f.dataType === 'REAL' || f.dataType === 'INTEGER').map((f) => [f.columnName, f])
  );

  const updates: [string, number][] = [];
  for (const [column, value] of Object.entries(parsed.data.values)) {
    if (!numericColumns.has(column)) return fail('INVALID_INPUT', `수정할 수 없는 항목입니다: ${column}`, 400);
    updates.push([column, value]);
  }
  if (updates.length === 0) return fail('INVALID_INPUT', '수정할 값이 없습니다.', 400);

  const db = getAppDb();
  const table = quoteIdent(entity.tableName);
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT "id" FROM ${table} ORDER BY "created_at" ASC LIMIT 1`).get() as
    | { id: string }
    | undefined;

  if (existing) {
    const setSql = [...updates.map(([c]) => `${quoteIdent(c)} = ?`), '"updated_at" = ?'].join(', ');
    db.prepare(`UPDATE ${table} SET ${setSql} WHERE "id" = ?`).run(...updates.map(([, v]) => v), now, existing.id);
  } else {
    const columns = ['id', 'created_at', 'updated_at', ...updates.map(([c]) => c)];
    db.prepare(
      `INSERT INTO ${table} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    ).run(nanoid(), now, now, ...updates.map(([, v]) => v));
  }

  return NextResponse.json<ApiResult<{ saved: number }>>({ ok: true, data: { saved: updates.length } });
}
