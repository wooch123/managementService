import { NextRequest, NextResponse } from 'next/server';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { findPublishedNode, findPublishedEntity } from '@/lib/runtime/binding-query';
import { runListQuery } from '@/lib/data-engine/query';

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** §10.7 GET /api/runtime/export/:nodeId — list 바인딩 컴포넌트의 전체 결과를 CSV로 내려준다.
 * nodeId로 활성 스펙의 노드를 찾아 그 binding으로만 쿼리를 조립한다(§10.7 보안 원칙과 동일). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await params;
  const spec = await getActiveSpec();
  if (!spec) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_DEPLOYED', message: '배포된 구성이 없습니다.' } }, { status: 404 });
  }

  const node = findPublishedNode(spec, nodeId);
  if (!node?.binding || node.binding.mode !== 'list') {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: '내보낼 수 있는 목록 바인딩이 없습니다.' } }, { status: 404 });
  }

  const entity = findPublishedEntity(spec, node.binding.entityId);
  // 페이지네이션 없이 전체를 한 번에 내보낸다 — pageSize를 넉넉히 키운다.
  const { rows, columns } = await runListQuery({ ...node.binding, pageSize: 100000 }, 1, entity);

  const header = columns.map((c) => csvEscape(c.columnName)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.columnName])).join(',')).join('\n');
  const csv = `${header}\n${body}`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${entity.tableName}.csv"`,
    },
  });
}
