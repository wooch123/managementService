import { NextRequest } from 'next/server';
import { subscribe, subscriberCount, type ChatMessagePayload } from '@/lib/chat/hub';

/** SSE는 스트리밍 응답이라 정적화/캐시 대상이 되면 안 된다. */
export const dynamic = 'force-dynamic';

/**
 * 방(room)별 실시간 스트림. 브라우저의 표준 EventSource가 붙는다.
 * - `message` 이벤트: 새 채팅 메시지
 * - `presence` 이벤트: 현재 접속자 수
 * - 25초마다 주석(`:ping`)을 보내 프록시가 유휴 연결을 끊지 않게 한다(터널·리버스 프록시 대응).
 */
export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room') ?? 'default';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribe(room, (message: ChatMessagePayload) => send('message', message));
      send('presence', { room, count: subscriberCount(room) });

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
          send('presence', { room, count: subscriberCount(room) });
        } catch {
          closed = true;
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 이미 닫힌 스트림 — 무시
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx 계열 프록시가 버퍼링해서 스트림이 막히는 것을 방지
      'X-Accel-Buffering': 'no',
    },
  });
}
