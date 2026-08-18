import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getActiveSpec } from '@/lib/runtime/spec-cache';

/** §10.7 GET /api/runtime/spec — 활성 리비전 스펙, ETag 캐시. 스펙 자체가 배포 시점에만
 * 바뀌는 불변 스냅샷이라 컨텐츠 해시를 ETag로 그대로 쓸 수 있다. */
export async function GET(request: NextRequest) {
  const spec = await getActiveSpec();
  if (!spec) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_DEPLOYED', message: '배포된 구성이 없습니다.' } }, { status: 404 });
  }

  const body = JSON.stringify(spec);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return new NextResponse(body, { headers: { 'Content-Type': 'application/json', ETag: etag } });
}
