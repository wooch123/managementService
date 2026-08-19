import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { toPlainExcerpt } from '@/lib/markdown';
import { FTS_MIN_LENGTH, hasSearchIndex, searchBoardPosts } from '@/lib/db/board-search';
import type { ApiResult } from '@/types/auth';

/**
 * 게시판 메시지 조회/작성 API — 운영 사이트(/home) 방문자가 그대로 쓰는 공개 엔드포인트다.
 *
 * 관리자 인증을 요구하지 않는 대신 (1) 입력 길이를 zod로 제한하고, (2) 조회는 반드시 boardKey로
 * 좁혀 다른 게시판 글이 섞이지 않게 한다. 저장 위치는 메타 DB의 BoardPost 하나뿐이다.
 *
 * 게시판이 채팅형으로 바뀌면서 조회는 **페이지 번호가 아니라 커서**로 한다. 대화는 계속 아래로
 * 자라기 때문에, 번호로 자르면 새 메시지가 들어올 때마다 경계가 밀려 같은 글을 두 번 보거나
 * 건너뛴다. 네 가지 모드가 있다.
 *
 *   (기본)      최신 `limit`건            — 처음 열 때
 *   `before=id` 그보다 **이전** `limit`건 — 위로 올려 더 읽을 때
 *   `after=id`  그보다 **이후** 전부(상한) — 폴링으로 새 메시지를 받을 때
 *   `around=id` 그 메시지를 가운데 둔 창   — 갤러리·검색 결과로 건너뛸 때
 *
 * 어느 모드든 응답은 **오래된 것 → 최신** 순서로 준다(화면에 그리는 순서 그대로).
 */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

const querySchema = z.object({
  boardKey: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  before: z.string().max(40).optional(),
  after: z.string().max(40).optional(),
  around: z.string().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
});

const createSchema = z
  .object({
    boardKey: z.string().min(1).max(64),
    /** 채팅형에서는 제목이 없다. 예전 글과 같은 표를 쓰므로 빈 문자열로 저장한다. */
    title: z.string().trim().max(120).default(''),
    content: z.string().trim().max(20000).default(''),
    author: z.string().trim().min(1).max(24),
    category: z.string().trim().max(40).optional().nullable(),
    /** 붙여넣어 먼저 올려 둔 이미지들 — 이 메시지에 연결한다. */
    attachmentIds: z.array(z.string().max(40)).max(10).default([]),
  })
  // 사진만 보내는 것도 대화에서는 자연스럽다 — 글과 이미지 둘 다 비어 있을 때만 막는다.
  .refine((v) => v.content.length > 0 || v.attachmentIds.length > 0, {
    message: '내용을 입력하거나 이미지를 첨부해 주세요.',
  });

type PostRow = {
  id: string;
  boardKey: string;
  title: string;
  content: string;
  author: string;
  category: string | null;
  createdAt: Date;
};

/** raw 조회는 날짜를 숫자(ms)나 문자열로 돌려줄 수 있어 한 곳에서 Date로 맞춘다. */
function toDate(value: number | string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(typeof value === 'number' ? value : String(value));
}

/**
 * 커서 기준 정렬 비교에 쓰는 값. `createdAt`만으로는 같은 밀리초에 들어온 두 메시지의 순서가
 * 흔들려 폴링이 같은 글을 반복해 가져올 수 있으므로, id를 두 번째 기준으로 함께 쓴다.
 */
async function cursorOf(id: string): Promise<{ createdAt: Date; id: string } | null> {
  const row = await prisma.boardPost.findUnique({ where: { id }, select: { id: true, createdAt: true } });
  return row ?? null;
}

const olderThan = (c: { createdAt: Date; id: string }) => ({
  OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
});
const newerThan = (c: { createdAt: Date; id: string }) => ({
  OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }],
});

async function withAttachments(rows: PostRow[]) {
  if (rows.length === 0) return new Map<string, { id: string; url: string; name: string; width: number | null; height: number | null }[]>();
  const attachments = await prisma.boardAttachment.findMany({
    where: { postId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: 'asc' },
  });
  const byPost = new Map<string, { id: string; url: string; name: string; width: number | null; height: number | null }[]>();
  for (const a of attachments) {
    if (!a.postId) continue;
    const list = byPost.get(a.postId) ?? [];
    list.push({ id: a.id, url: `/api/board/uploads/${a.id}`, name: a.origName, width: a.width, height: a.height });
    byPost.set(a.postId, list);
  }
  return byPost;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    boardKey: sp.get('boardKey') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    before: sp.get('before') ?? undefined,
    after: sp.get('after') ?? undefined,
    around: sp.get('around') ?? undefined,
    q: sp.get('q') ?? undefined,
    category: sp.get('category') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '게시판 조회 조건이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const { boardKey, limit, before, after, around, q, category } = parsed.data;
  const base = { boardKey, ...(category ? { category } : {}) };

  // ── 검색: 결과는 대화 흐름이 아니라 "건너뛸 후보 목록"이다(최신순, 본문 미리보기).
  if (q) {
    const useIndex = q.length >= FTS_MIN_LENGTH && hasSearchIndex();
    let total: number;
    // 검색 결과는 "건너뛸 후보"라 대화 렌더에 필요한 필드(첨부·분류)까지 읽지 않는다.
    let rows: { id: string; title: string; content: string; author: string; createdAt: Date }[];
    if (useIndex) {
      const found = searchBoardPosts({ boardKey, q, category, page: 1, pageSize: limit });
      total = found.total;
      rows = found.rows.map((r) => ({ ...r, createdAt: toDate(r.createdAt) }));
    } else {
      const where = { ...base, OR: [{ title: { contains: q } }, { content: { contains: q } }] };
      [total, rows] = await Promise.all([
        prisma.boardPost.count({ where }),
        prisma.boardPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      ]);
    }
    const data = {
      mode: 'search' as const,
      total,
      items: rows.map((p) => ({
        id: p.id,
        author: p.author,
        title: p.title,
        excerpt: toPlainExcerpt(p.content) || '(이미지)',
        createdAt: p.createdAt.toISOString(),
      })),
    };
    return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
  }

  let rows: PostRow[];
  let hasOlder = false;

  if (around) {
    const cursor = await cursorOf(around);
    if (!cursor) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NOT_FOUND', message: '해당 메시지를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }
    const half = Math.floor(limit / 2);
    const [older, newer] = await Promise.all([
      prisma.boardPost.findMany({ where: { ...base, ...olderThan(cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: half }),
      prisma.boardPost.findMany({
        where: { ...base, OR: [{ id: around }, newerThan(cursor)] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit - half,
      }),
    ]);
    rows = [...older.reverse(), ...newer];
    hasOlder = older.length === half;
  } else if (after) {
    const cursor = await cursorOf(after);
    // 커서가 사라졌다면(삭제된 메시지) 새로 받을 것이 없다고 답한다 — 전체를 다시 밀어주면
    // 화면이 통째로 뛴다.
    rows = cursor
      ? await prisma.boardPost.findMany({
          where: { ...base, ...newerThan(cursor) },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: MAX_LIMIT,
        })
      : [];
  } else if (before) {
    const cursor = await cursorOf(before);
    const older = cursor
      ? await prisma.boardPost.findMany({
          where: { ...base, ...olderThan(cursor) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
        })
      : [];
    rows = older.reverse();
    hasOlder = older.length === limit;
  } else {
    const latest = await prisma.boardPost.findMany({
      where: base,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    rows = latest.reverse();
    hasOlder = latest.length === limit;
  }

  const byPost = await withAttachments(rows);
  const data = {
    mode: (around ? 'around' : after ? 'after' : before ? 'before' : 'recent') as 'around' | 'after' | 'before' | 'recent',
    hasOlder,
    items: rows.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author: p.author,
      category: p.category,
      createdAt: p.createdAt.toISOString(),
      attachments: byPost.get(p.id) ?? [],
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
        error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' },
      },
      { status: 400 }
    );
  }
  const { attachmentIds, ...post } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const created = await tx.boardPost.create({
      data: { ...post, category: post.category || null },
    });
    if (attachmentIds.length > 0) {
      // 아직 어느 메시지에도 붙지 않은, **같은 게시판의** 첨부만 연결한다 — 남의 게시판 이미지를
      // id만 알아내 끌어오는 경로를 막는다.
      await tx.boardAttachment.updateMany({
        where: { id: { in: attachmentIds }, boardKey: post.boardKey, postId: null },
        data: { postId: created.id },
      });
    }
    return created;
  });

  const data = { id: saved.id, createdAt: saved.createdAt.toISOString() };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data }, { status: 201 });
}
