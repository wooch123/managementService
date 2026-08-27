import 'server-only';
import Database from 'better-sqlite3';
import { metaDbPath } from '@/lib/db/paths';

/**
 * 게시판 전문 검색 전용 읽기 연결.
 *
 * WHY 별도 연결인가: 같은 FTS 질의가 Prisma의 raw 실행으로는 21ms, better-sqlite3로는 0.32ms였다
 * (2026-08-19 실측 — Prisma raw는 호출마다 질의를 다시 준비하는 것으로 보이고, FTS5 가상 테이블은
 * 준비 비용이 특히 크다). 검색은 사용자가 체감하는 경로라 여기만 드라이버로 직접 읽는다.
 *
 * 쓰기는 여전히 Prisma가 전담한다. 읽기 전용 연결이고 meta.db는 WAL이라 쓰기를 막지 않는다.
 */
let connection: Database.Database | null = null;
const statements = new Map<string, Database.Statement>();

function getDb(): Database.Database {
  if (!connection) {
    connection = new Database(metaDbPath(), { readonly: true });
    connection.pragma('busy_timeout = 3000');
  }
  return connection;
}

function prepared(sql: string): Database.Statement {
  const cached = statements.get(sql);
  if (cached) return cached;
  const stmt = getDb().prepare(sql);
  statements.set(sql, stmt);
  return stmt;
}

export type BoardSearchRow = {
  id: string;
  title: string;
  content: string;
  author: string;
  category: string | null;
  viewCount: number;
  /** 답글이면 부모 메시지 id — 검색 결과에서 그 스레드를 열어야 한다. */
  parentId: string | null;
  createdAt: string | number;
  total: number;
};

/** trigram 토크나이저는 3글자 이상만 색인한다 — 짧은 검색어는 호출 측에서 LIKE로 처리한다. */
export const FTS_MIN_LENGTH = 3;

/**
 * 색인으로 글을 찾는다. 목록과 전체 건수를 한 번에 돌려준다(COUNT(*) OVER()).
 * 검색어는 구문(phrase)으로 감싸 FTS 문법으로 해석되지 않게 한다.
 */
export function searchBoardPosts(params: {
  boardKey: string;
  q: string;
  category?: string;
  page: number;
  pageSize: number;
}): { rows: BoardSearchRow[]; total: number } {
  const match = `"${params.q.replace(/"/g, '""')}"`;
  const categorySql = params.category ? 'AND p."category" = ?' : '';
  const sql = `SELECT p."id", p."title", p."content", p."author", p."category", p."viewCount", p."parentId", p."createdAt",
                      COUNT(*) OVER () AS total
                 FROM "BoardPost" p
                 JOIN "BoardPostFts" f ON f.rowid = p.rowid
                WHERE f."BoardPostFts" MATCH ? AND p."boardKey" = ? ${categorySql}
                ORDER BY p."createdAt" DESC
                LIMIT ? OFFSET ?`;

  const args: unknown[] = params.category
    ? [match, params.boardKey, params.category, params.pageSize, (params.page - 1) * params.pageSize]
    : [match, params.boardKey, params.pageSize, (params.page - 1) * params.pageSize];

  const rows = prepared(sql).all(...args) as BoardSearchRow[];
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

/** 색인 테이블이 없는 환경(마이그레이션 전)에서도 앱이 죽지 않도록 확인해 둔다. */
export function hasSearchIndex(): boolean {
  try {
    const row = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'BoardPostFts'`)
      .get();
    return Boolean(row);
  } catch {
    return false;
  }
}
