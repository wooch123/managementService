import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import { relationCreateSchema, isRelationAllowed, type RefType } from '@/types/graph';
import type { ApiResult } from '@/types/auth';

const TYPE_LABEL: Record<RefType, string> = {
  PAGE: '페이지',
  COMPONENT: '컴포넌트',
  ENTITY: '엔티티',
  ACTION: '액션',
};

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = relationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const { fromType, fromId, toType, toId, kind, cardinality, labelText, eventName } = parsed.data;

  if (!isRelationAllowed(kind, fromType, toType)) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'COMBINATION_NOT_ALLOWED',
          message: `${TYPE_LABEL[fromType]}는 ${TYPE_LABEL[toType]}에 ${kind}로 연결할 수 없습니다.`,
        },
      },
      { status: 400 }
    );
  }

  try {
    const relation = await prisma.relation.create({
      data: { fromType, fromId, toType, toId, kind, cardinality: cardinality ?? null, labelText: labelText ?? null },
    });

    // TRIGGERS 양방향 동기화 — §8.4.3: 관계도에서 만들면 컴포넌트의 eventsJson에도 반영
    if (kind === 'TRIGGERS' && eventName) {
      const node = await prisma.componentNode.findUnique({ where: { id: fromId } });
      if (node) {
        const events = JSON.parse(node.eventsJson) as Record<string, string>;
        events[eventName] = toId;
        await prisma.componentNode.update({ where: { id: fromId }, data: { eventsJson: JSON.stringify(events) } });
      }
    }

    return NextResponse.json<ApiResult<typeof relation>>({ ok: true, data: relation });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'DUPLICATE', message: '이미 같은 연결이 존재합니다.' } },
        { status: 409 }
      );
    }
    throw err;
  }
}
