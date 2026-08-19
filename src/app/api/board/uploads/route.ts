import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { MAX_IMAGE_BYTES, storeImage } from '@/lib/db/board-uploads';
import type { ApiResult } from '@/types/auth';

/**
 * 게시판 이미지 업로드(POST)와 갤러리 목록(GET).
 *
 * 운영 사이트 방문자가 그대로 쓰는 공개 엔드포인트다. 관리자 인증을 요구하지 않는 대신
 * (1) 형식을 파일 내용으로 직접 판별하고, (2) 크기 상한을 두고, (3) 저장 이름을 서버가 만들며,
 * (4) 조회는 반드시 boardKey로 좁힌다.
 *
 * 붙여넣는 즉시 업로드하고 보낼 때 메시지에 연결하므로, 업로드 직후에는 `postId`가 비어 있다.
 * 끝내 연결되지 않은 것(글을 쓰다 만 경우)은 다음 업로드 때 함께 청소한다.
 */

const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GALLERY_PAGE_SIZE = 60;

/** 보내지 않고 남겨진 첨부를 치운다. 실패해도 업로드 자체를 막지 않는다. */
async function sweepOrphans(boardKey: string) {
  try {
    await prisma.boardAttachment.deleteMany({
      where: { boardKey, postId: null, createdAt: { lt: new Date(Date.now() - ORPHAN_MAX_AGE_MS) } },
    });
    // 파일은 남지만 참조가 사라진다 — 용량 회수는 별도 정리 작업의 몫으로 두고,
    // 여기서 파일까지 지우다 실패해 업로드가 막히는 일이 없게 한다.
  } catch {
    /* 청소는 부가 작업이다 */
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const boardKey = String(form?.get('boardKey') ?? '').trim();

  if (!boardKey || boardKey.length > 64 || !(file instanceof File)) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '게시판과 이미지 파일이 필요합니다.' } },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'TOO_LARGE', message: `이미지가 너무 큽니다(최대 ${MAX_IMAGE_BYTES / 1024 / 1024}MB).` } },
      { status: 413 }
    );
  }

  let stored;
  try {
    stored = await storeImage(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_IMAGE', message: e instanceof Error ? e.message : '이미지를 저장하지 못했습니다.' } },
      { status: 400 }
    );
  }

  const saved = await prisma.boardAttachment.create({
    data: {
      boardKey,
      fileName: stored.fileName,
      origName: file.name.slice(0, 200) || '이미지',
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
      width: stored.width,
      height: stored.height,
    },
  });
  void sweepOrphans(boardKey);

  const data = {
    id: saved.id,
    url: `/api/board/uploads/${saved.id}`,
    name: saved.origName,
    width: saved.width,
    height: saved.height,
    byteSize: saved.byteSize,
  };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data }, { status: 201 });
}

/** 갤러리 — 이 게시판의 이미지를 최신순으로. 각 항목이 어느 메시지에 붙었는지(postId) 함께 준다. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const boardKey = (sp.get('boardKey') ?? '').trim();
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  if (!boardKey || boardKey.length > 64) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '게시판을 지정해 주세요.' } },
      { status: 400 }
    );
  }

  const where = { boardKey, postId: { not: null } };
  const [total, rows] = await Promise.all([
    prisma.boardAttachment.count({ where }),
    prisma.boardAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * GALLERY_PAGE_SIZE,
      take: GALLERY_PAGE_SIZE,
      include: { post: { select: { author: true, createdAt: true } } },
    }),
  ]);

  const data = {
    total,
    page,
    pageSize: GALLERY_PAGE_SIZE,
    items: rows.map((a) => ({
      id: a.id,
      url: `/api/board/uploads/${a.id}`,
      name: a.origName,
      width: a.width,
      height: a.height,
      postId: a.postId,
      author: a.post?.author ?? '',
      createdAt: (a.post?.createdAt ?? a.createdAt).toISOString(),
    })),
  };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}
