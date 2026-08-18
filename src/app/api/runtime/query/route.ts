import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { filterSchema, sortSchema } from '@/types/binding';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { findPublishedNode, findPublishedEntity } from '@/lib/runtime/binding-query';
import { runListQuery, runAggregateQuery } from '@/lib/data-engine/query';
import type { ApiResult } from '@/types/auth';

const bodySchema = z.object({
  nodeId: z.string(),
  page: z.number().int().min(1).optional(),
  sort: z.array(sortSchema).optional(),
  filters: z.array(filterSchema).optional(),
});

/**
 * §10.7 — 페이지네이션·정렬·필터 변경 등 초기 렌더 이후의 재조회. "활성 스펙의 바인딩
 * 정의만 사용"한다: nodeId로 찾은 노드의 binding(엔티티/필드는 전부 서버 쪽 id)에 클라이언트가
 * 보낸 sort/filters/page만 얹어 재실행한다 — 클라이언트는 테이블명·컬럼명 문자열을 전혀
 * 보내지 않고, fieldId(불투명 id)로만 필터·정렬 대상을 지정한다.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const spec = await getActiveSpec();
  if (!spec) {
    return NextResponse.json<ApiResult<never>>({ ok: false, error: { code: 'NOT_DEPLOYED', message: '배포된 구성이 없습니다.' } }, { status: 404 });
  }

  const node = findPublishedNode(spec, parsed.data.nodeId);
  if (!node?.binding || node.binding.mode === 'static' || node.binding.mode === 'field') {
    return NextResponse.json<ApiResult<never>>({ ok: false, error: { code: 'NOT_FOUND', message: '조회 가능한 바인딩이 없습니다.' } }, { status: 404 });
  }

  try {
    if (node.binding.mode === 'list') {
      const entity = findPublishedEntity(spec, node.binding.entityId);
      const merged = { ...node.binding, filters: parsed.data.filters ?? node.binding.filters, sort: parsed.data.sort ?? node.binding.sort };
      const result = await runListQuery(merged, parsed.data.page ?? 1, entity);
      return NextResponse.json<ApiResult<typeof result>>({ ok: true, data: result });
    }
    if (node.binding.mode === 'aggregate') {
      const entity = findPublishedEntity(spec, node.binding.entityId);
      const merged = { ...node.binding, filters: parsed.data.filters ?? node.binding.filters };
      const value = await runAggregateQuery(merged, entity);
      return NextResponse.json<ApiResult<{ value: number }>>({ ok: true, data: { value } });
    }
    // single: route/selection 키소스는 §12.2가 이미 초기 렌더에서 서버가 프리페치하므로
    // (RuntimeRenderer가 다시 조회할 필요가 없다) 이 재조회 엔드포인트에서는 fixed만 다룬다.
    return NextResponse.json<ApiResult<never>>({ ok: false, error: { code: 'UNSUPPORTED', message: '이 바인딩 모드는 재조회를 지원하지 않습니다.' } }, { status: 400 });
  } catch {
    return NextResponse.json<ApiResult<never>>({ ok: false, error: { code: 'QUERY_FAILED', message: '조회 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
