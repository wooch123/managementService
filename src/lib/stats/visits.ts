import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * 접속자 통계 — 기록과 집계를 한 곳에 모은다.
 *
 * 무엇을 남기는가: **화면 방문 한 건**(어느 화면을, 어느 브라우저가, 며칠에). 그 이상은 남기지
 * 않는다 — IP도, 사용자 계정도, 다녀간 경로도 적지 않는다. "일간 접속자와 화면별 이용률"을
 * 세는 데 그 이상이 필요 없기 때문이다.
 *
 * 하루 경계는 **서버 로컬 시간대**로 끊는다. UTC로 끊으면 한국 시간 오전 9시에 날짜가 바뀌어
 * "어제 몇 명"이 실제 근무일과 어긋난다.
 */

/** 브라우저를 구분하는 익명 열쇠가 담기는 쿠키 이름. */
export const VISITOR_COOKIE = 'wv_vid';
/** 쿠키 수명(1년) — 재방문을 같은 사람으로 세기 위한 최소 기간. */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 서버 로컬 시간대 기준 'YYYY-MM-DD'. */
export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 오늘부터 거꾸로 `days`일치 날짜 배열(오래된 날 → 오늘). */
export function recentDays(days: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    out.push(localDay(d));
  }
  return out;
}

export type VisitInput = { slug: string; title: string; visitorId: string };

export async function recordVisit({ slug, title, visitorId }: VisitInput): Promise<void> {
  await prisma.pageVisit.create({
    data: { slug, title, visitorId, day: localDay() },
  });
}

export type DailyPoint = { day: string; visitors: number; views: number };
export type PageUsage = { slug: string; title: string; views: number; visitors: number; share: number };
export type VisitSummary = {
  days: number;
  from: string;
  to: string;
  today: { visitors: number; views: number };
  total: { visitors: number; views: number };
  daily: DailyPoint[];
  pages: PageUsage[];
};

/**
 * 기간 통계. 방문 한 건이 한 행이라 집계는 전부 DB가 한다.
 *
 * `$queryRaw`를 쓰는 자리는 `COUNT(DISTINCT …)` 두 곳뿐이다 — Prisma의 groupBy로는 한 번에
 * 표현되지 않는다. 값은 전부 파라미터로 바인딩되고 문자열을 이어 붙이지 않는다.
 */
export async function getVisitSummary(days: number): Promise<VisitSummary> {
  const window = recentDays(days);
  const from = window[0];
  const to = window[window.length - 1];

  const perDay = await prisma.$queryRaw<{ day: string; views: bigint | number; visitors: bigint | number }[]>`
    SELECT "day" AS day, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageVisit"
     WHERE "day" >= ${from} AND "day" <= ${to}
     GROUP BY "day"
     ORDER BY "day" ASC`;
  const byDay = new Map(perDay.map((r) => [r.day, { views: Number(r.views), visitors: Number(r.visitors) }]));

  const perPage = await prisma.$queryRaw<
    { slug: string; title: string; views: bigint | number; visitors: bigint | number }[]
  >`
    SELECT "slug" AS slug,
           MAX("title") AS title,
           COUNT(*) AS views,
           COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageVisit"
     WHERE "day" >= ${from} AND "day" <= ${to}
     GROUP BY "slug"
     ORDER BY views DESC`;

  const totalViews = perPage.reduce((sum, r) => sum + Number(r.views), 0);
  const uniqueRow = await prisma.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(DISTINCT "visitorId") AS n FROM "PageVisit" WHERE "day" >= ${from} AND "day" <= ${to}`;

  const today = localDay();
  return {
    days,
    from,
    to,
    today: byDay.get(today) ?? { views: 0, visitors: 0 },
    total: { views: totalViews, visitors: Number(uniqueRow[0]?.n ?? 0) },
    // 기록이 없는 날도 0으로 채운다 — 빠뜨리면 추이 선이 없는 날을 건너뛰어 이어져 사실과 달라진다.
    daily: window.map((day) => ({ day, ...(byDay.get(day) ?? { views: 0, visitors: 0 }) })),
    pages: perPage.map((r) => ({
      slug: r.slug,
      title: r.title,
      views: Number(r.views),
      visitors: Number(r.visitors),
      share: totalViews > 0 ? Number(r.views) / totalViews : 0,
    })),
  };
}
