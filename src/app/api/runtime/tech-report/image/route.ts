import { NextRequest, NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES } from '@/lib/db/board-uploads';
import { readReportImage, storeReportImage } from '@/lib/far/report-uploads';
import type { ApiResult } from '@/types/auth';

/**
 * Tech Report의 그림 올리기·내려주기.
 *
 *   POST  multipart(file)   → { file: "YYYY-MM/uuid.png" }  보고서 행의 그림 칸에 담을 이름
 *   GET   ?f=…              → 그 그림
 *
 * 형식은 클라이언트가 말한 것을 믿지 않고 **파일 내용의 첫 바이트로 판별**하고, 저장 이름은
 * 서버가 만든다. 읽을 때는 저장소 밖을 가리키는 이름을 거부한다(report-uploads.ts).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '이미지 파일이 필요합니다.' } },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'TOO_LARGE', message: `이미지가 너무 큽니다(최대 ${MAX_IMAGE_BYTES / 1024 / 1024}MB).` } },
      { status: 413 }
    );
  }

  try {
    const stored = await storeReportImage(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json<ApiResult<typeof stored>>({ ok: true, data: stored });
  } catch (err) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_IMAGE', message: err instanceof Error ? err.message : '이미지를 저장하지 못했습니다.' } },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('f') ?? '';
  if (!file || file.length > 200) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: '파일 이름이 필요합니다.' } }, { status: 400 });
  }
  const found = await readReportImage(file);
  if (!found) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: '이미지를 찾을 수 없습니다.' } }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      'Content-Type': found.mimeType,
      'Content-Length': String(found.bytes.byteLength),
      // 같은 이름이면 같은 바이트다(이름이 무작위 UUID라 덮어쓰이지 않는다).
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
