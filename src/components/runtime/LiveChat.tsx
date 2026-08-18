'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ChatMessage = { id: string; room: string; author: string; body: string; createdAt: string };

const NICK_KEY = 'webapp-v1-chat-nickname';

/** 표시용 닉네임. 설계 데이터가 아니라 방문자 로컬 UI 상태라 localStorage에 둔다(§4.2 예외). */
function loadNickname(): string {
  if (typeof window === 'undefined') return '';
  const saved = window.localStorage.getItem(NICK_KEY);
  if (saved) return saved;
  const generated = `방문자${Math.floor(1000 + Math.random() * 9000)}`;
  window.localStorage.setItem(NICK_KEY, generated);
  return generated;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 운영 사이트 방문자 간 실시간 채팅.
 *
 * 수신은 SSE(`/api/chat/stream`), 발신은 `POST /api/chat/messages`다 — 웹소켓 서버를 따로
 * 띄우지 않아도 `next start` 위에서 그대로 동작한다. 접속 시 최근 50개를 먼저 불러오고,
 * 이후 도착하는 메시지는 스트림으로 즉시 붙인다.
 */
export function LiveChat({ room, title, placeholder }: { room: string; title?: string; placeholder?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nickname, setNickname] = useState('');
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState(0);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNickname(loadNickname());
  }, []);

  // 최근 대화 이력 → 그 다음 스트림 구독. 순서를 지켜야 새로고침 직후 중복/누락이 없다.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/messages?room=${encodeURIComponent(room)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setMessages(j.data as ChatMessage[]);
      })
      .catch(() => undefined);

    const source = new EventSource(`/api/chat/stream?room=${encodeURIComponent(room)}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('message', (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as ChatMessage;
      // 같은 메시지를 이력과 스트림에서 두 번 받을 수 있어 id로 걸러낸다.
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    source.addEventListener('presence', (e) => {
      setPresence((JSON.parse((e as MessageEvent).data) as { count: number }).count);
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [room]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, author: nickname || '방문자', body }),
      });
      // 화면 반영은 스트림이 담당한다(보낸 사람도 같은 경로로 받아 순서가 어긋나지 않는다).
    } finally {
      setSending(false);
    }
  }, [draft, nickname, room, sending]);

  return (
    <div className="flex h-full min-h-[220px] flex-col gap-2">
      <div className="flex items-center gap-2">
        {title && <h3 className="text-sm font-medium">{title}</h3>}
        <span className={cn('size-2 shrink-0 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        <span className="text-xs text-muted-foreground">{connected ? '실시간 연결됨' : '연결 중…'}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {presence}명
        </span>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">아직 대화가 없습니다. 첫 메시지를 남겨보세요.</p>
        ) : (
          messages.map((m) => {
            const mine = m.author === nickname;
            return (
              <div key={m.id} className={cn('flex flex-col gap-0.5', mine && 'items-end')}>
                <span className="text-[11px] text-muted-foreground">
                  {m.author} · {timeOf(m.createdAt)}
                </span>
                <span
                  className={cn(
                    'max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm break-words',
                    mine ? 'bg-primary text-primary-foreground' : 'bg-background border'
                  )}
                >
                  {m.body}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            window.localStorage.setItem(NICK_KEY, e.target.value);
          }}
          className="w-28 shrink-0"
          aria-label="닉네임"
          maxLength={24}
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send();
          }}
          placeholder={placeholder ?? '메시지를 입력하고 Enter'}
          maxLength={500}
        />
        <Button type="button" size="icon" onClick={() => void send()} disabled={sending} aria-label="보내기">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** 빌더 캔버스·팔레트에서 쓰는 정적 미리보기 — 여기서 실제 SSE 연결을 열지 않는다. */
export function LiveChatPreview({ title }: { title?: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col gap-2">
      <div className="flex items-center gap-2">
        {title && <h3 className="text-sm font-medium">{title}</h3>}
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-muted-foreground">실시간 연결됨</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" />3명
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden rounded-md border bg-muted/30 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">방문자1234 · 09:12</span>
          <span className="max-w-[85%] rounded-lg border bg-background px-2.5 py-1.5 text-sm">FAR-26-1003 반출 일정 확인 부탁드립니다.</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] text-muted-foreground">방문자5678 · 09:13</span>
          <span className="max-w-[85%] rounded-lg bg-primary px-2.5 py-1.5 text-sm text-primary-foreground">내일 오전에 반출 예정입니다.</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input value="방문자1234" readOnly className="w-28 shrink-0" aria-label="닉네임" />
        <Input placeholder="메시지를 입력하고 Enter" readOnly />
        <Button type="button" size="icon" aria-label="보내기">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
