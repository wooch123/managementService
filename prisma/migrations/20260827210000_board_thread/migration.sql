-- 게시판을 슬랙 스레드 형태로 — 메시지가 다른 메시지의 답글이 될 수 있게 한다.
--
-- Prisma가 생성하는 SQL을 쓰지 않고 손으로 적는다. Prisma는 SQLite에서 컬럼을 더할 때
-- **표를 다시 만드는 방식**(새 표 생성 → 복사 → 교체)을 택하는데, 그러면 BoardPost에 붙어 있는
-- FTS 트리거 3개가 표와 함께 사라지고 외부 콘텐츠 색인(BoardPostFts)이 본체와 어긋난다.
-- 실제로 `migrate dev --create-only`가 "BoardPostFts(30행)를 지우려 한다"고 경고했다.
-- 컬럼 하나를 더하자고 표를 갈아엎을 이유가 없다.
--
-- SQLite는 ADD COLUMN에 REFERENCES를 허용한다 — 기본값이 NULL인 경우에 한해서다(여기가 그렇다).

ALTER TABLE "BoardPost" ADD COLUMN "parentId" TEXT
  REFERENCES "BoardPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 채널 목록은 부모 메시지(parentId IS NULL)만 시간순으로 읽는다.
CREATE INDEX "BoardPost_boardKey_parentId_createdAt_idx"
  ON "BoardPost"("boardKey", "parentId", "createdAt");

-- 스레드를 펼칠 때는 한 부모의 답글만 시간순으로 읽는다.
CREATE INDEX "BoardPost_parentId_createdAt_idx"
  ON "BoardPost"("parentId", "createdAt");
