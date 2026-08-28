import 'server-only';
import type { Browser } from 'playwright';
import { renderTechReportHtml } from '@/lib/far/tech-report-html';
import type { TechReportDoc } from '@/lib/far/tech-report-fields';

/**
 * Tech Report를 **서버에서** PDF로 그린다.
 *
 * 왜 서버인가(사용자 요구): 브라우저 인쇄로 내면 받는 사람의 테마·확대율·인쇄 설정·글꼴에 따라
 * 결과가 달라지고, 인쇄 창을 한 번 더 거쳐야 한다. 서버가 한 번 그려서 그 파일을 나눠 주면
 * **누가 받아도 같은 문서**이고 누르는 즉시 내려받아진다.
 *
 * 그리는 도구는 headless Chromium(Playwright)이다. 이 저장소는 이미 E2E로 Playwright를 쓰고
 * 있어 새로 들이는 것은 실행용 패키지 하나뿐이다. PDF 라이브러리로 직접 그리는 길도 있었지만,
 * 표 19줄·격자·그림 아홉 칸의 배치를 좌표로 다시 쓰는 일이 되고 한글 글꼴 파일까지 저장소에
 * 담아야 한다 — 같은 그림을 두 번 그리는 셈이라 택하지 않았다.
 *
 * 브라우저는 **한 번 띄워 두고 다시 쓴다**. 요청마다 띄우면 매번 1초 남짓이 그냥 나간다.
 */

/**
 * 한동안 안 쓰면 브라우저를 닫는다.
 *
 * 운영은 워커 4개짜리 클러스터라, 각 워커가 Chromium을 하나씩 띄워 놓고 있으면 발행을 한 번씩만
 * 해도 수백 MB가 계속 잡혀 있는다. Tech Report 발행은 몰아서 몇 번 하고 한참 안 하는 일이라,
 * 쓸 때만 띄우고 쉬면 반납하는 편이 맞다. 다음 발행은 다시 띄우느라 1초 남짓 더 걸린다.
 */
const IDLE_CLOSE_MS = 5 * 60 * 1000;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const closing = browserPromise;
    browserPromise = null;
    idleTimer = null;
    void closing?.then((b) => b.close()).catch(() => {});
  }, IDLE_CLOSE_MS);
  // 이 타이머 때문에 프로세스가 종료되지 못하는 일이 없게 한다.
  idleTimer.unref?.();
}

async function getBrowser(): Promise<Browser> {
  const existing = await browserPromise?.catch(() => null);
  if (existing?.isConnected()) return existing;

  // 지난 시도가 실패했거나 브라우저가 끊겼으면 다시 띄운다.
  browserPromise = (async () => {
    const { chromium } = await import('playwright');
    return chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  })();
  return browserPromise;
}

/**
 * 브라우저를 못 띄웠을 때.
 *
 * 대개는 정말 안 받아진 것이라 설치 명령을 안내한다. 다만 한 번 이런 일도 있었다 — 파일은
 * 멀쩡히 있는데 **pm2로 띄운 프로세스에서만** 그 폴더가 통째로 안 보였다(같은 사용자, 같은
 * 환경변수, ACL도 정상). pm2 데몬이 시작될 때의 파일 시야를 자식이 그대로 물려받기 때문으로,
 * 데몬을 정상 환경에서 다시 띄우니(`pm2 save && pm2 kill && pm2 resurrect`) 바로 풀렸다.
 * 설치가 되어 있는데도 이 오류가 나면 그쪽을 의심할 것.
 */
export class BrowserUnavailable extends Error {
  constructor(cause: unknown) {
    super(
      'PDF를 그릴 브라우저를 찾지 못했습니다. 서버에서 `npx playwright install chromium`을 한 번 실행하세요. ' +
        '이미 설치되어 있다면 서비스를 띄운 프로세스가 그 폴더를 볼 수 있는지 확인하세요. ' +
        (cause instanceof Error ? cause.message.split('\n')[0] : '')
    );
    this.name = 'BrowserUnavailable';
  }
}

export async function renderTechReportPdf(doc: TechReportDoc): Promise<Buffer> {
  const html = await renderTechReportHtml(doc);

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    browserPromise = null;
    throw new BrowserUnavailable(err);
  }

  // 문서마다 새 컨텍스트를 쓴다 — 앞 요청의 상태가 남지 않고, 하나가 죽어도 브라우저는 산다.
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // 바깥으로 나가는 요청이 없다(그림은 data URI로 심어 두었다) — 그래도 네트워크를 기다리게
    // 두면 느린 DNS 한 번에 발행이 멈춘다. 문서가 그려지는 시점까지만 기다린다.
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#6b7280;text-align:center;padding:0 12mm;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await context.close().catch(() => {});
    scheduleIdleClose();
  }
}
