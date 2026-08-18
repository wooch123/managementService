import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { publish } from '@/lib/chat/hub';
import type { ApiResult } from '@/types/auth';

/**
 * 실시간 채팅 메시지 — 운영 사이트(/home) 방문자가 쓰는 공개 API다. 관리자 인증을 요구하지
 * 않는 대신 입력 길이를 제한하고, 저장은 메타 DB의 ChatMessage 하나만 건드린다.
 */
const HISTORY_LIMIT = 50;

const sendSchema = z.object({
  room: z.string().min(1).max(64),
  author: z.string().trim().min(1).max(24),
  body: z.string().trim().min(1).max(500),
});

export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room') ?? 'default';
  const rows = await prisma.chatMessage.findMany({
    where: { room },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  const data = rows
    .reverse()
    .map((m) => ({ id: m.id, room: m.room, author: m.author, body: m.body, createdAt: m.createdAt.toISOString() }));
  return NextResponse.json<ApiResult<typeof data>>({ ok: true, data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: { code: 'INVALID_INPUT', message: '메시지 형식이 올바르지 않습니다(최대 500자).' } },
      { status: 400 }
    );
  }

  const saved = await prisma.chatMessage.create({ data: parsed.data });
  const payload = {
    id: saved.id,
    room: saved.room,
    author: saved.author,
    body: saved.body,
    createdAt: saved.createdAt.toISOString(),
  };
  // 저장이 끝난 뒤에 전파한다 — 새로고침해도 같은 순서로 보이도록 DB를 진실 공급원으로 둔다.
  publish(payload);

  return NextResponse.json<ApiResult<typeof payload>>({ ok: true, data: payload });
}
