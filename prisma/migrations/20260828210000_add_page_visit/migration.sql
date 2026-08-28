-- 접속자 통계 — 운영 화면 방문 기록.
--
-- 손으로 적는다(다른 마이그레이션과 같은 이유): Prisma가 만드는 SQL은 필요 이상으로 표를
-- 다시 만들 때가 있는데, 새 표 하나를 더하는 일에는 그럴 이유가 없다.

CREATE TABLE "PageVisit" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "slug"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "day"       TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 페이지별 이용률: 하루 범위를 좁힌 뒤 화면별로 센다.
CREATE INDEX "PageVisit_day_slug_idx" ON "PageVisit"("day", "slug");
-- 일간 순 방문자: 하루 안에서 서로 다른 브라우저 수를 센다.
CREATE INDEX "PageVisit_day_visitorId_idx" ON "PageVisit"("day", "visitorId");
