import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { toPlainExcerpt } from '@/lib/markdown';
import type { ApiResult } from '@/types/auth';

/**
 * 게시판 목록/작성 API — 운영 사이트(/home) 방문자가 그대로 쓰는 공개 엔드포인트다.
 *
 * 관리자 인증을 요구하지 않는 대신 (1) 입력 길이를 zod로 제한하고, (2) 조회는 반드시 boardKey로
 * 좁혀 다른 게시판 글이 섞이지 않게 하며, (3) 목록 응답에는 본문 전체 대신 미리보기 문구만 담는다.
 * 저장 위치는 메타 DB의 BoardPost 하나뿐이다(실시간 채팅과 같은 방식 — SPEC 동적 DDL 경로가 아님).
 */
const MAX_PAGE_SIZE = 50;

const listQuerySchema = z.object({
  boardKey: z.string().min(1).max(64),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
});

const createSchema = z.object({
  boardKey: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20000),
  author: z.string().trim().min(1).max(24),
  category: z.string().trim().max(40).optional().nullable(),
});

/**
 * 검색어를 FTS5(trigram) 질의로 바꾼다. 큰따옴표로 감싸 구문(phrase)으로 넘겨야
 * 검색어 안의 공백·기호가 FTS 문법으로 해석되지 않는다.
 */
function toMatchQuery(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

/** trigram 토크나이저는 3글자 이상만 색인한다 — 짧은 검색어는 예전처럼 LIKE로 찾는다. */
const FTS_MIN_LENGTH = 3;

/**
 * 검색 결과 id를 FTS 색인으로 찾아온다(정렬·페이지 처리까지 SQL에서 끝낸다).
 *
 * WHY: LIKE '%키워드%'는 글이 늘어난 만큼 전부 훑는다. 색인을 쓰면 2,000건에서 0.17ms,
 * 그리고 글이 몇 만 건이 돼도 같은 수준을 유지한다.
 */
type RawPost = {
  id: string;
  title: string;
  content: string;
  author: string;
  category: string | null;
  viewCount: number;
  createdAt: number | string | Date;
};

async function searchByIndex(
  boardKey: string,
  q: string,
  category: string | undefined,
  page: number,
  pageSize: number
): Promise<{ rows: RawPost[]; total: number }> {
  const match = toMatchQuery(q);
  const categorySql = category ? 'AND p."category" = ?' : '';
  const params: unknown[] = category ? [match, boardKey, category] : [match, boardKey];

  // 한 번의 질의로 끝낸다 — 목록과 전체 건수를 함께 받는다(COUNT(*) OVER()).
  // WHY: SQL 자체는 0.2ms인데 Prisma raw 호출 한 번마다 15~20ms가 붙는다(실측). 왕복 수가
  // 곧 응답 시간이라, 개수를 따로 세지 않고 같은 결과 집합에서 뽑는다.
  const rows = await prisma.$queryRawUnsafe<(RawPost & { total: bigint | number })[]>(
    `SELECT p."id", p."title", p."content", p."author", p."category", p."viewCount", p."createdAt",
            COUNT(*) OVER () AS total
       FROM "BoardPost" p
       JOIN "BoardPostFts" f ON f.rowid = p.rowid
      WHERE f."BoardPostFts" MATCH ? AND p."boardKey" = ? ${categorySql}
      ORDER BY p."createdAt" DESC
      LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize
  );
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

/** raw 조회는 날짜를 숫자(ms)나 문자열로 돌려줄 수 있어 한 곳에서 Date로 맞춘다. */
function toDate(value: number | string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(typeof value === 'number' ? value : String(value));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = listQuerySchema.safeParse({
    boardKey: sp.get('boardKey') ?? undefined,
    page: sp.get('page') ?? undefined,
    pageSize: sp.get('pageSize') ?? undefined,
    q: sp.get('q') ?? undefined,
    category: sp.get('category') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '게시판 조회 조건이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const { boardKey, page, pageSize, q, category } = parsed.data;
  const useIndex = Boolean(q && q.length >= FTS_MIN_LENGTH);

  let total: number;
  let rows: { id: string; title: string; content: string; author: string; category: string | null; viewCount: number; createdAt: Date }[];

  if (useIndex && q) {
    const found = await searchByIndex(boardKey, q, category, page, pageSize);
    total = found.total;
    rows = found.rows.map((r) => ({ ...r, viewCount: Number(r.viewCount), createdAt: toDate(r.createdAt) }));
  } else {
    const where = {
      boardKey,
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }] } : {}),
    };
    [total, rows] = await Promise.all([
      prisma.boardPost.count({ where }),
      prisma.boardPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
  }

  const data = {
    total,
    page,
    pageSize,
    items: rows.map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      category: p.category,
      excerpt: toPlainExcerpt(p.content),
      viewCount: p.viewCount,
      createdAt: p.createdAt.toISOString(),
    })),
  };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: '제목(1~120자) · 작성자(1~24자) · 내용(1~20000자)을 확인해 주세요.',
        },
      },
      { status: 400 }
    );
  }

  const saved = await prisma.boardPost.create({
    data: { ...parsed.data, category: parsed.data.category || null },
  });
  const data = { id: saved.id, createdAt: saved.createdAt.toISOString() };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data }, { status: 201 });
}
