-- 게시판 검색용 전문 검색 인덱스(FTS5).
--
-- 왜: 검색이 LIKE '%키워드%' 전체 스캔이라 글이 늘수록 선형으로 느려진다(2,001건에서 8ms).
-- trigram 토크나이저를 쓰는 이유: 한국어는 띄어쓰기 없이 붙는 경우가 많아 기본 토크나이저로는
-- "상세분석" 안의 "분석"을 찾지 못한다. trigram은 부분 문자열 검색을 지원한다(SQLite 3.34+).
CREATE VIRTUAL TABLE "BoardPostFts" USING fts5(
  title,
  content,
  content='BoardPost',
  content_rowid='rowid',
  tokenize='trigram'
);

-- 기존 글을 색인에 넣는다.
INSERT INTO "BoardPostFts"(rowid, title, content)
  SELECT rowid, title, content FROM "BoardPost";

-- 본문이 바뀌면 색인도 따라 바뀌게 한다(외부 콘텐츠 FTS의 표준 트리거 구성).
CREATE TRIGGER "BoardPost_fts_insert" AFTER INSERT ON "BoardPost" BEGIN
  INSERT INTO "BoardPostFts"(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER "BoardPost_fts_delete" AFTER DELETE ON "BoardPost" BEGIN
  INSERT INTO "BoardPostFts"("BoardPostFts", rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER "BoardPost_fts_update" AFTER UPDATE ON "BoardPost" BEGIN
  INSERT INTO "BoardPostFts"("BoardPostFts", rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO "BoardPostFts"(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
