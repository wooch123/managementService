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
 * **슬랙 스레드 구조**: 한 메시지는 채널 메시지(`parentId = null`)이거나 어떤 채널 메시지에 달린
 * 답글이다. 답글은 채널 목록에 끼어들지 않고 스레드 안에만 쌓인다 — 슬랙과 같다. 깊이는 한 단계로
 * 고정한다(답글에 답글을 달아도 같은 스레드로 이어 붙는다). 채널이 답글로 덮이지 않는 것이
 * 스레드를 쓰는 이유이므로, 트리로 자라게 두면 그 이점이 사라진다.
 *
 * 조회는 **페이지 번호가 아니라 커서**로 한다. 대화는 계속 아래로 자라기 때문에, 번호로 자르면
 * 새 메시지가 들어올 때마다 경계가 밀려 같은 글을 두 번 보거나 건너뛴다. 모드는 다음과 같다.
 *
 *   (기본)        최신 `limit`건            — 처음 열 때
 *   `before=id`   그보다 **이전** `limit`건 — 위로 올려 더 읽을 때
 *   `after=id`    그보다 **이후** 전부(상한) — 폴링으로 새 메시지를 받을 때
 *   `around=id`   그 메시지를 가운데 둔 창   — 갤러리·검색 결과로 건너뛸 때
 *   `threadOf=id` 그 메시지의 스레드         — 답글 패널을 열 때(`after`와 함께 쓰면 새 답글만)
 *
 * 어느 모드든 응답은 **오래된 것 → 최신** 순서로 준다(화면에 그리는 순서 그대로).
 */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;
/** 한 스레드에서 한 번에 읽어 오는 답글 수의 상한. */
const THREAD_LIMIT = 200;
/** 채널의 스레드 요약에 보여줄 참여자 수. */
const PARTICIPANT_LIMIT = 3;

const querySchema = z.object({
  boardKey: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  before: z.string().max(40).optional(),
  after: z.string().max(40).optional(),
  around: z.string().max(40).optional(),
  threadOf: z.string().max(40).optional(),
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
    /** 답글이면 부모 메시지 id. 없으면 채널에 바로 올라가는 메시지다. */
    parentId: z.string().max(40).optional().nullable(),
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
  parentId: string | null;
  createdAt: Date;
};

type Attachment = { id: string; url: string; name: string; width: number | null; height: number | null };
/** 채널 목록에 "N개의 답글"을 그리기 위한 최소 정보. */
type ThreadSummary = { replyCount: number; lastReplyAt: string; participants: string[] };

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

async function withAttachments(rows: { id: string }[]) {
  if (rows.length === 0) return new Map<string, Attachment[]>();
  const attachments = await prisma.boardAttachment.findMany({
    where: { postId: { in: rows.map((r) => r.id) } },
    // 보낸 사람이 붙여넣은 순서 그대로. 여러 장을 동시에 올리므로 업로드가 끝난 순서(createdAt)는
    // 그 순서와 다르다 — 같은 값이면(예전 데이터) 올라온 순서로 이어 붙인다.
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const byPost = new Map<string, Attachment[]>();
  for (const a of attachments) {
    if (!a.postId) continue;
    const list = byPost.get(a.postId) ?? [];
    list.push({ id: a.id, url: `/api/board/uploads/${a.id}`, name: a.origName, width: a.width, height: a.height });
    byPost.set(a.postId, list);
  }
  return byPost;
}

/**
 * 주어진 부모들의 스레드 요약(답글 수 · 마지막 답글 시각 · 참여자).
 *
 * 답글 행을 전부 읽지 않는다 — `groupBy`로 집계만 가져온다. 참여자도 `[parentId, author]`로 묶어
 * **서로 다른 작성자 수**만큼만 읽으므로, 답글이 수백 개인 스레드에서도 비용이 늘지 않는다.
 */
async function threadSummaries(parentIds: string[]): Promise<Map<string, ThreadSummary>> {
  const summaries = new Map<string, ThreadSummary>();
  if (parentIds.length === 0) return summaries;

  const [counts, authors] = await Promise.all([
    prisma.boardPost.groupBy({
      by: ['parentId'],
      where: { parentId: { in: parentIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.boardPost.groupBy({
      by: ['parentId', 'author'],
      where: { parentId: { in: parentIds } },
      _min: { createdAt: true },
    }),
  ]);

  // 먼저 답글을 단 사람이 앞에 오게 — 슬랙도 참여한 순서로 얼굴을 늘어놓는다.
  const byParent = new Map<string, { author: string; at: number }[]>();
  for (const row of authors) {
    if (!row.parentId) continue;
    const list = byParent.get(row.parentId) ?? [];
    list.push({ author: row.author, at: row._min.createdAt?.getTime() ?? 0 });
    byParent.set(row.parentId, list);
  }

  for (const row of counts) {
    if (!row.parentId) continue;
    const participants = (byParent.get(row.parentId) ?? [])
      .sort((a, b) => a.at - b.at)
      .slice(0, PARTICIPANT_LIMIT)
      .map((p) => p.author);
    summaries.set(row.parentId, {
      replyCount: row._count._all,
      lastReplyAt: (row._max.createdAt ?? new Date(0)).toISOString(),
      participants,
    });
  }
  return summaries;
}

function serialize(rows: PostRow[], byPost: Map<string, Attachment[]>, threads?: Map<string, ThreadSummary>) {
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    author: p.author,
    category: p.category,
    parentId: p.parentId,
    createdAt: p.createdAt.toISOString(),
    attachments: byPost.get(p.id) ?? [],
    thread: threads?.get(p.id) ?? null,
  }));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    boardKey: sp.get('boardKey') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    before: sp.get('before') ?? undefined,
    after: sp.get('after') ?? undefined,
    around: sp.get('around') ?? undefined,
    threadOf: sp.get('threadOf') ?? undefined,
    q: sp.get('q') ?? undefined,
    category: sp.get('category') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '게시판 조회 조건이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  const { boardKey, limit, before, after, around, threadOf, q, category } = parsed.data;
  /** 검색은 스레드 안까지 훑는다 — 답글에만 있는 말도 찾을 수 있어야 한다. */
  const searchBase = { boardKey, ...(category ? { category } : {}) };
  /** 채널 목록은 부모 메시지만 본다. 답글은 스레드 안에만 있다. */
  const base = { ...searchBase, parentId: null };

  // ── 검색: 결과는 대화 흐름이 아니라 "건너뛸 후보 목록"이다(최신순, 본문 미리보기).
  if (q) {
    const useIndex = q.length >= FTS_MIN_LENGTH && hasSearchIndex();
    let total: number;
    // 검색 결과는 "건너뛸 후보"라 대화 렌더에 필요한 필드(첨부·분류)까지 읽지 않는다.
    let rows: { id: string; title: string; content: string; author: string; parentId: string | null; createdAt: Date }[];
    if (useIndex) {
      const found = searchBoardPosts({ boardKey, q, category, page: 1, pageSize: limit });
      total = found.total;
      rows = found.rows.map((r) => ({ ...r, parentId: r.parentId ?? null, createdAt: toDate(r.createdAt) }));
    } else {
      const where = { ...searchBase, OR: [{ title: { contains: q } }, { content: { contains: q } }] };
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
        // 답글이 걸리면 그 스레드를 열어야 한다 — 채널 목록에는 없는 메시지이기 때문이다.
        parentId: p.parentId,
        createdAt: p.createdAt.toISOString(),
      })),
    };
    return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
  }

  // ── 스레드: 부모 한 건 + 그 답글들. `after`를 주면 그 뒤에 달린 답글만.
  if (threadOf) {
    const opened = await prisma.boardPost.findFirst({ where: { id: threadOf, boardKey } });
    // 답글의 id로 열어도 그 답글이 속한 스레드를 연다(검색 결과에서 바로 들어오는 경로).
    const root = opened?.parentId ? await prisma.boardPost.findUnique({ where: { id: opened.parentId } }) : opened;
    if (!root) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NOT_FOUND', message: '스레드를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    const cursor = after ? await cursorOf(after) : null;
    const replies = await prisma.boardPost.findMany({
      where: { parentId: root.id, ...(cursor ? newerThan(cursor) : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: THREAD_LIMIT,
    });
    const [byPost, replyCount] = await Promise.all([
      withAttachments([root, ...replies]),
      prisma.boardPost.count({ where: { parentId: root.id } }),
    ]);
    const data = {
      mode: 'thread' as const,
      // 새 답글만 받아 온 응답인지 — 화면이 이어 붙일지 통째로 갈아 끼울지 정하는 데 쓴다.
      incremental: Boolean(cursor),
      replyCount,
      parent: serialize([root], byPost)[0],
      items: serialize(replies, byPost),
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

  const [byPost, threads] = await Promise.all([withAttachments(rows), threadSummaries(rows.map((r) => r.id))]);

  /**
   * 폴링이 받아 가는 "이미 화면에 있는 부모의 스레드가 바뀌었다"는 소식.
   *
   * 답글은 채널 목록에 나타나지 않는다. 이것이 없으면 남이 단 답글은 새로고침 전까지
   * "N개의 답글"에 반영되지 않는다. 커서보다 뒤에 달린 답글이 있는 부모만 골라 요약을 다시 준다.
   */
  let threadUpdates: Record<string, ThreadSummary> = {};
  if (after) {
    const cursor = await cursorOf(after);
    if (cursor) {
      const changed = await prisma.boardPost.groupBy({
        by: ['parentId'],
        where: { boardKey, parentId: { not: null }, ...newerThan(cursor) },
      });
      const changedIds = changed.map((c) => c.parentId).filter((id): id is string => Boolean(id));
      threadUpdates = Object.fromEntries(await threadSummaries(changedIds));
    }
  }

  const data = {
    mode: (around ? 'around' : after ? 'after' : before ? 'before' : 'recent') as 'around' | 'after' | 'before' | 'recent',
    hasOlder,
    items: serialize(rows, byPost, threads),
    threadUpdates,
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
  const { attachmentIds, parentId, ...post } = parsed.data;

  /**
   * 답글이면 부모를 확인한다. **같은 게시판**이어야 하고, 부모가 이미 답글이면 그 부모의 부모에
   * 붙인다 — 스레드 깊이를 한 단계로 유지하기 위해서다(슬랙과 같다).
   */
  let resolvedParentId: string | null = null;
  if (parentId) {
    const parent = await prisma.boardPost.findFirst({
      where: { id: parentId, boardKey: post.boardKey },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code: 'NOT_FOUND', message: '답글을 달 메시지를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const saved = await prisma.$transaction(async (tx) => {
    const created = await tx.boardPost.create({
      data: { ...post, category: post.category || null, parentId: resolvedParentId },
    });
    // 아직 어느 메시지에도 붙지 않은, **같은 게시판의** 첨부만 연결한다 — 남의 게시판 이미지를
    // id만 알아내 끌어오는 경로를 막는다. 보낸 목록의 순서를 sortOrder에 그대로 적어,
    // 동시에 올라가 업로드 완료 순서가 뒤섞여도 화면에서는 붙여넣은 순서로 보이게 한다.
    for (const [index, attachmentId] of attachmentIds.entries()) {
      await tx.boardAttachment.updateMany({
        where: { id: attachmentId, boardKey: post.boardKey, postId: null },
        data: { postId: created.id, sortOrder: index },
      });
    }
    return created;
  });

  const data = { id: saved.id, parentId: saved.parentId, createdAt: saved.createdAt.toISOString() };
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data }, { status: 201 });
}
