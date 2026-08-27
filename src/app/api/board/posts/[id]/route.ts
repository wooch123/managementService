import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { deleteImage } from '@/lib/db/board-uploads';
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
  const exists = await prisma.boardPost.findUnique({ where: { id }, select: { id: true, parentId: true } });
  if (!exists) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'NOT_FOUND', message: '글을 찾을 수 없습니다.' } },
      { status: 404 }
    );
  }

  /**
   * 채널 메시지를 지우면 그 스레드의 답글도 함께 사라진다(FK `ON DELETE CASCADE`).
   *
   * 그런데 FK는 **디스크의 이미지 파일까지 치워 주지 않는다.** 스레드가 생기기 전에는 한 번에
   * 사라지는 메시지가 하나뿐이라 티가 나지 않았지만, 이제 답글 스무 개가 함께 지워질 수 있다 —
   * 그만큼의 그림이 아무도 참조하지 않는 채로 남는다. 그래서 사라질 메시지들의 파일명을 **먼저**
   * 모아 두고, 행을 지운 뒤에 파일을 지운다.
   */
  const replyIds = exists.parentId
    ? []
    : (await prisma.boardPost.findMany({ where: { parentId: id }, select: { id: true } })).map((r) => r.id);
  const doomed = [id, ...replyIds];
  const files = await prisma.boardAttachment.findMany({
    where: { postId: { in: doomed } },
    select: { fileName: true },
  });

  await prisma.boardPost.delete({ where: { id } });

  // 행을 지운 **뒤에** 파일을 지운다. 순서가 반대면 삭제가 중간에 실패했을 때 그림만 사라진
  // 메시지가 남는다 — 되돌릴 수 없는 쪽을 나중에 한다.
  for (const file of files) await deleteImage(file.fileName);

  const data = { id, deletedCount: doomed.length };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
