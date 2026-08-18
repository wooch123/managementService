import 'server-only';

/**
 * 실시간 채팅 브로드캐스트 허브.
 *
 * 새 라이브러리(ws 등)를 들이지 않고 표준 SSE(Server-Sent Events)로 구현한다 — `next start`
 * 프로세스 안에서 그대로 동작하고, 프록시(Cloudflare Tunnel)도 별도 설정 없이 통과한다.
 * 구독자는 방(room)별로 메모리에 들고 있다가, 메시지가 저장되면 같은 방 구독자에게만 밀어준다.
 *
 * 한계: 브로드캐스트가 **프로세스 메모리** 기반이라 앱을 여러 인스턴스로 띄우면 인스턴스 간에는
 * 전파되지 않는다(현재 배포는 pm2 단일 프로세스라 문제 없음). 다중 인스턴스로 갈 때는 이 허브를
 * Redis pub/sub 같은 외부 채널로 바꾸면 되고, API·컴포넌트는 그대로 쓸 수 있다.
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

export function subscribe(room: string, fn: Subscriber): () => void {
  const set = rooms.get(room) ?? new Set<Subscriber>();
  set.add(fn);
  rooms.set(room, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) rooms.delete(room);
  };
}

export function publish(message: ChatMessagePayload): void {
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

/** 지금 접속 중인 인원 수(같은 방 기준) — 컴포넌트 상단에 표시한다. */
export function subscriberCount(room: string): number {
  return rooms.get(room)?.size ?? 0;
}
