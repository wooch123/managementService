import { NextRequest, NextResponse } from 'next/server';
import { buildExternalApiGuide } from '@/lib/api/external-guide';
import { decideExternalAccess } from '@/lib/api/external-auth';
import { requestBaseUrl } from '@/lib/api/internal-network';

/**
 * 외부 연동 API 가이드를 md 파일로 내려 준다(사용자 지정, 2026-09-01).
 *
 *   GET /api/docs/external-api            브라우저에서 그대로 읽기
 *   GET /api/docs/external-api?download=1 .md 파일로 저장
 *
 * `/api/external/…` 아래가 아니라 따로 둔 이유: 그 아래는 `[table]` 동적 구간이라, 거기에
 * `guide`를 두면 "guide라는 이름의 표"와 자리를 다투게 된다. 지금은 정적 구간이 이겨서 잘
 * 돌겠지만, 나중에 표 이름을 정할 때 피해야 할 이름이 생기는 셈이라 아예 갈라 두었다.
 *
 * 문서는 **부를 때마다 설계에서 새로 만든다**. 칸 목록을 파일에 베껴 두면 다음 설계 변경부터
 * 틀린 문서가 되고, 연동하는 쪽은 틀린 줄 모른 채 맞춘다.
 */

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const access = await decideExternalAccess(request);
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.',
        },
      },
      { status: 401 }
    );
  }

  // 문서에 적히는 주소는 **부른 사람이 실제로 쓴 주소**여야 한다. 사내에서 받은 문서에
  // 공개 주소가 적혀 있으면 그대로 복사해 붙였을 때 토큰을 요구받는다.
  //
  // nextUrl.origin은 쓰지 않는다 — `next start` 서버에서는 서버 자신의 주소(localhost:3000)가
  // 나와서, LAN으로 부르든 터널로 부르든 문서에 localhost가 적힌다(실제로 그렇게 나왔다).
  const baseUrl = requestBaseUrl(request.headers, request.nextUrl.origin);
  const markdown = await buildExternalApiGuide({ baseUrl });

  const download = request.nextUrl.searchParams.get('download') === '1';
  const filename = `external-api-guide-${new Date().toISOString().slice(0, 10)}.md`;

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      // 설계가 바뀌면 내용도 바뀌어야 하므로 캐시에 남기지 않는다.
      'Cache-Control': 'no-store',
    },
  });
}
