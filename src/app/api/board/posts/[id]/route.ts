import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdminSession } from '@/lib/auth/require-session';
import type { ApiResult } from '@/types/auth';

/**
 * 글 조회/삭제.
 *
 * 조회는 공개다(방문자가 읽는다). 조회수는 읽을 때 1 올린다 — 별도 요청을 만들지 않고
 * update의 반환값을 그대로 쓴다. 삭제는 관리자 세션이 있어야 한다(방문자는 글을 지울 수 없다).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const exists = await prisma.boardPost.findUnique({ where: { id } });
  if (!exists) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '글을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  const post = await prisma.boardPost.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  const data = {
    id: post.id,
    boardKey: post.boardKey,
    title: post.title,
    content: post.content,
    author: post.author,
    category: post.category,
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
  };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const exists = await prisma.boardPost.findUnique({ where: { id } });
  if (!exists) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '글을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  await prisma.boardPost.delete({ where: { id } });
  return NextResponse.json<ApiResult<{ id: string }>>({ ok: true, data: { id } });
}
