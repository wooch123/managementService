import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import { isDescendantOrSelf, serializeNode } from '@/lib/db/nodes';
import { deleteGraphArtifactsFor } from '@/lib/db/graph';
import { nodeUpdateSchema } from '@/types/node';
import type { ApiResult } from '@/types/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.componentNode.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '컴포넌트를 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = nodeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() },
      },
      { status: 400 }
    );
  }

  const def = nodeMeta[existing.type];
  if (!def) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'UNKNOWN_TYPE', message: '카탈로그에 없는 컴포넌트 타입입니다.' } },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};

  // 참고: propsSchema(zod)는 UI 컴포넌트를 import하는 catalog.ts에만 있고, 그 모듈은
  // Route Handler("app-route") 번들에서 React.createContext를 쓸 수 없어 import할 수 없다
  // (node-meta.generated.ts 상단 주석 참고). 따라서 props는 여기서 병합만 하고 zod 재검증은
  // 생략한다 — 클라이언트(PropertyForm)가 이미 같은 스키마로 위젯을 제한해서 입력받는다.
  if (data.props) {
    const merged = { ...(JSON.parse(existing.propsJson) as Record<string, unknown>), ...data.props };
    updateData.propsJson = JSON.stringify(merged);
  }

  if (data.region) updateData.region = data.region;

  if (data.grid) {
    if (data.grid.col !== undefined) updateData.gridCol = data.grid.col;
    if (data.grid.span !== undefined) updateData.gridSpan = data.grid.span;
    if (data.grid.row !== undefined) updateData.gridRow = data.grid.row;
    if (data.grid.rowSpan !== undefined) updateData.gridRowSpan = data.grid.rowSpan;
  }

  if (data.parentNodeId !== undefined) {
    if (data.parentNodeId !== null) {
      if (await isDescendantOrSelf(id, data.parentNodeId)) {
        return NextResponse.json<ApiResult<never>>(
          { ok: false, error: { code: 'CYCLE', message: '자기 자신 또는 자손을 부모로 지정할 수 없습니다.' } },
          { status: 400 }
        );
      }
      const parent = await prisma.componentNode.findUnique({ where: { id: data.parentNodeId } });
      if (!parent || parent.pageId !== existing.pageId) {
        return NextResponse.json<ApiResult<never>>(
          { ok: false, error: { code: 'PARENT_NOT_FOUND', message: '부모 노드를 찾을 수 없습니다.' } },
          { status: 400 }
        );
      }
      const parentDef = nodeMeta[parent.type];
      if (!parentDef?.isContainer) {
        return NextResponse.json<ApiResult<never>>(
          { ok: false, error: { code: 'NOT_CONTAINER', message: '대상은 자식을 담을 수 없는 컴포넌트입니다.' } },
          { status: 400 }
        );
      }
    }
    updateData.parentNodeId = data.parentNodeId;
  }

  if (data.bindingJson !== undefined) updateData.bindingJson = data.bindingJson;
  if (data.events) updateData.eventsJson = JSON.stringify(data.events);
  if (data.label !== undefined) updateData.label = data.label;

  const node = await prisma.componentNode.update({ where: { id }, data: updateData });
  return NextResponse.json<ApiResult<ReturnType<typeof serializeNode>>>({ ok: true, data: serializeNode(node) });
}

/** 자기 자신 + 모든 자손 id를 재귀적으로 수집한다 (schema.prisma의 자기참조 관계에는
 * onDelete: Cascade가 없어 SQLite가 기본적으로 자식의 parentNodeId를 null로 바꾸기 때문에,
 * §10.3 "자손 함께 삭제"를 만족시키려면 애플리케이션에서 직접 처리해야 한다). */
async function collectSubtreeIds(id: string): Promise<string[]> {
  const children = await prisma.componentNode.findMany({
    where: { parentNodeId: id },
    select: { id: true },
  });
  const descendantIds = await Promise.all(children.map((c) => collectSubtreeIds(c.id)));
  return [id, ...descendantIds.flat()];
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ids = await collectSubtreeIds(id);
  for (const nodeId of ids) await deleteGraphArtifactsFor('COMPONENT', nodeId);
  await prisma.componentNode.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json<ApiResult<null>>({ ok: true, data: null });
}
