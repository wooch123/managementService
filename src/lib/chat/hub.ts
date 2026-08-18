import 'server-only';

/**
 * 실시간 채팅 브로드캐스트 허브.
 *
 * 새 라이브러리(ws 등)를 들이지 않고 표준 SSE(Server-Sent Events)로 구현한다 — `next start`
 * 프로세스 안에서 그대로 동작하고, 프록시(Cloudflare Tunnel)도 별도 설정 없이 통과한다.
 * 구독자는 방(room)별로 메모리에 들고 있다가, 메시지가 저장되면 같은 방 구독자에게만 밀어준다.
 *
 * 여러 워커로 띄우면(pm2 cluster) 메모리 전파만으로는 다른 워커에 붙은 사람에게 닿지 않는다.
 * 그래서 **DB를 전파 통로로** 쓴다 — 저장된 메시지를 각 워커가 짧은 주기로 확인해 자기 구독자에게
 * 밀어준다. 새 미들웨어(Redis 등)를 들이지 않고 다중 워커를 지원하기 위한 선택이고, 대신 다른
 * 워커의 메시지는 최대 폴링 주기(0.7초)만큼 늦게 도착한다.
 */

export type ChatMessagePayload = {
  id: string;
  room: string;
  author: string;
  body: string;
  createdAt: string;
};

type Subscriber = (message: ChatMessagePayload) => void;

// dev 모드 Fast Refresh로 모듈이 다시 평가돼도 구독자를 잃지 않도록 globalThis에 보관한다.
const globalForChat = globalThis as unknown as { chatRooms?: Map<string, Set<Subscriber>> };
const rooms: Map<string, Set<Subscriber>> = (globalForChat.chatRooms ??= new Map());

/** 다른 워커에서 온 메시지를 확인하는 주기. 짧을수록 즉시성이 좋지만 조회가 잦아진다. */
const POLL_MS = 700;

type BridgeState = { timer?: NodeJS.Timeout; since: Date; delivered: Set<string> };
const globalForBridge = globalThis as unknown as { chatBridge?: BridgeState };
const bridge: BridgeState = (globalForBridge.chatBridge ??= { since: new Date(), delivered: new Set() });

/** 같은 메시지를 두 번 밀지 않도록 최근 전달분을 기억한다(무한정 쌓이지 않게 잘라낸다). */
function markDelivered(id: string): boolean {
  if (bridge.delivered.has(id)) return false;
  bridge.delivered.add(id);
  if (bridge.delivered.size > 500) {
    for (const old of [...bridge.delivered].slice(0, 200)) bridge.delivered.delete(old);
  }
  return true;
}

function fanOut(message: ChatMessagePayload): void {
  const set = rooms.get(message.room);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(message);
    } catch {
      // 끊긴 연결 하나가 다른 구독자 전파를 막지 않게 삼킨다(정리는 구독 해제 쪽에서 한다).
    }
  }
}

/** DB에 새로 쌓인 메시지(=다른 워커가 저장한 것)를 가져와 이 워커의 구독자에게 전달한다. */
async function pollOnce(): Promise<void> {
  if (rooms.size === 0) return;
  const { prisma } = await import('@/lib/db/prisma');
  const rows = await prisma.chatMessage.findMany({
    where: { room: { in: [...rooms.keys()] }, createdAt: { gte: bridge.since } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const m of rows) {
    if (!markDelivered(m.id)) continue;
    fanOut({ id: m.id, room: m.room, author: m.author, body: m.body, createdAt: m.createdAt.toISOString() });
  }
  if (rows.length > 0) bridge.since = rows[rows.length - 1].createdAt;
}

function ensureBridge(): void {
  if (bridge.timer) return;
  bridge.since = new Date();
  bridge.timer = setInterval(() => void pollOnce().catch(() => undefined), POLL_MS);
  // 이 타이머 때문에 프로세스가 종료되지 못하는 일이 없게 한다.
  bridge.timer.unref?.();
}

function stopBridgeIfIdle(): void {
  if (rooms.size > 0 || !bridge.timer) return;
  clearInterval(bridge.timer);
  bridge.timer = undefined;
}

export function subscribe(room: string, fn: Subscriber): () => void {
  const set = rooms.get(room) ?? new Set<Subscriber>();
  set.add(fn);
  rooms.set(room, set);
  ensureBridge();
  return () => {
    set.delete(fn);
    if (set.size === 0) rooms.delete(room);
    stopBridgeIfIdle();
  };
}

export function publish(message: ChatMessagePayload): void {
  // 같은 워커의 구독자에게는 즉시 전달하고, 폴링이 같은 메시지를 다시 밀지 않도록 표시해 둔다.
  markDelivered(message.id);
  fanOut(message);
}

/** 지금 접속 중인 인원 수(같은 방 기준) — 컴포넌트 상단에 표시한다. */
export function subscriberCount(room: string): number {
  return rooms.get(room)?.size ?? 0;
}
