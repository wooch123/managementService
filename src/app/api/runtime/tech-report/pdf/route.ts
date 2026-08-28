import { NextRequest, NextResponse } from 'next/server';
import { loadTechReport } from '@/lib/far/tech-report';
import { BrowserUnavailable, renderTechReportPdf } from '@/lib/far/tech-report-pdf';

/**
 * Tech Report를 PDF 파일로 내려준다.
 *
 * 브라우저 인쇄가 아니라 **서버가 그린 파일 하나**를 준다(사용자 요구) — 받는 사람의 테마·글꼴·
 * 인쇄 설정과 무관하게 누가 받아도 같은 문서이고, 인쇄 창을 거치지 않는다.
 * 모양은 tech-report-html.ts 한 곳에서만 정해진다.
 */
export const runtime = 'nodejs';
/** 그림이 많으면 그리는 데 몇 초가 걸린다. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const farNo = (request.nextUrl.searchParams.get('far_no') ?? '').trim();
  if (!farNo || farNo.length > 64) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: 'FAR No를 입력하세요.' } },
      { status: 400 }
    );
  }

  try {
    const doc = loadTechReport(farNo);
    const pdf = await renderTechReportPdf(doc);
    // 파일 이름에 한글이 섞일 수 있어 filename*(RFC 5987)로 함께 적는다.
    const name = `Tech Report ${farNo}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `attachment; filename="techreport-${encodeURIComponent(farNo)}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 내용이 계속 바뀌는 문서다 — 눌렀을 때 방금 저장한 값이 나와야 한다.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof BrowserUnavailable) {
      return NextResponse.json({ ok: false, error: { code: 'NO_BROWSER', message: err.message } }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: { code: 'RENDER_FAILED', message: err instanceof Error ? err.message : 'PDF를 만들지 못했습니다.' } },
      { status: 500 }
    );
  }
}
