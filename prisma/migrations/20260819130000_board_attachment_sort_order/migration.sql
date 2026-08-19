-- 한 메시지에 붙은 이미지의 표시 순서.
--
-- 여러 장을 동시에 올리므로 업로드가 끝난 순서(createdAt)는 사용자가 붙여넣은 순서와 다르다.
-- 보낼 때 받은 목록 순서를 이 값에 적어 그대로 보여준다.
--
-- 손으로 작성했다: `prisma migrate dev`는 스키마에 없는 FTS5 가상 테이블을 표류로 보고
-- 검색 색인을 통째로 지우려 든다(20260819120000_add_board_attachment 주석 참고).
ALTER TABLE "BoardAttachment" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
