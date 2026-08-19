-- 게시판 메시지에 붙는 이미지의 메타데이터.
--
-- 파일 자체는 data/uploads/board/ 아래에 두고 여기에는 메타만 둔다 — 이미지 바이트를 SQLite에
-- 넣으면 DB가 급격히 커지고 WAL·일별 백업이 함께 무거워진다.
--
-- 이 파일은 손으로 작성했다: `prisma migrate dev`는 스키마에 없는 FTS5 가상 테이블
-- (BoardPostFts*, 20260819010000_board_post_fts)을 "표류"로 보고 **전부 지우려 든다**.
-- 게시판 검색 색인 2,001건이 통째로 날아가므로 변경분만 적어 `migrate deploy`로 적용한다.
CREATE TABLE "BoardAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT,
    "boardKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "origName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BoardPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 갤러리는 게시판 단위로 최신순으로 훑는다.
CREATE INDEX "BoardAttachment_boardKey_createdAt_idx" ON "BoardAttachment"("boardKey", "createdAt");
-- 메시지를 그릴 때 첨부를 함께 읽는다.
CREATE INDEX "BoardAttachment_postId_idx" ON "BoardAttachment"("postId");
