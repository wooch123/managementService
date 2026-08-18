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
  const where = {
    boardKey,
    ...(category ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.boardPost.count({ where }),
    prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

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
