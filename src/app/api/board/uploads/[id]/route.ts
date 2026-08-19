import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { etagFor, readImage } from '@/lib/db/board-uploads';

/**
 * 업로드된 이미지를 내려준다.
 *
 * 디스크 경로를 URL에 노출하지 않고 id로만 접근하게 한다 — 경로가 그대로 주소가 되면 저장소
 * 구조가 새어 나가고, 경로 조작 시도를 라우터가 아니라 파일 시스템이 받아내게 된다.
 * 내용이 절대 바뀌지 않는 파일이라(같은 id = 같은 바이트) 오래 캐시해도 안전하다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await prisma.boardAttachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: '이미지를 찾을 수 없습니다.' } }, { status: 404 });
  }

  const etag = etagFor(attachment.id, attachment.byteSize);
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const bytes = await readImage(attachment.fileName);
  if (!bytes) {
    return NextResponse.json({ ok: false, error: { code: 'GONE', message: '이미지 파일이 없습니다.' } }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.byteSize),
      ETag: etag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // 이미지로만 쓰이게 못 박는다 — 브라우저가 내용을 다시 추측해 실행 가능한 형식으로
      // 해석하는 일(MIME 스니핑)을 막는다.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.origName)}`,
    },
  });
}
