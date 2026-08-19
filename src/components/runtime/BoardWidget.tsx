'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ImageIcon, Images, Loader2, Paperclip, Search, Send, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/runtime/Markdown';
import { cn } from '@/lib/utils';

type Attachment = { id: string; url: string; name: string; width: number | null; height: number | null };
type Message = {
  id: string;
  title: string;
  content: string;
  author: string;
  category: string | null;
  createdAt: string;
  attachments: Attachment[];
};
type SearchHit = { id: string; author: string; title: string; excerpt: string; createdAt: string };
type GalleryItem = { id: string; url: string; name: string; postId: string | null; author: string; createdAt: string };

const AUTHOR_KEY = 'webapp-v1-board-author';
/** 폴링 주기 — 화면이 맨 아래에 붙어 있을 때만 돈다. */
const POLL_MS = 3000;
/** "맨 아래에 있다"고 볼 여유. 1~2px 차이로 붙었다 떨어졌다 하지 않게 넉넉히 둔다. */
const BOTTOM_SLACK = 48;
/** 위로 이만큼 남았을 때 이전 메시지를 미리 불러온다. */
const TOP_TRIGGER = 120;

/** 표시용 작성자명. 설계 데이터가 아니라 방문자 로컬 UI 상태라 localStorage에 둔다(CLAUDE.md §4.2 예외). */
function loadAuthor(): string {
  if (typeof window === 'undefined') return '';
  const saved = window.localStorage.getItem(AUTHOR_KEY);
  if (saved) return saved;
  const generated = `방문자${Math.floor(1000 + Math.random() * 9000)}`;
  window.localStorage.setItem(AUTHOR_KEY, generated);
  return generated;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const dayKey = (iso: string) => iso.slice(0, 10);

/** 같은 사람이 5분 안에 이어서 보낸 메시지는 머리글(이름·시간)을 반복하지 않는다. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
function startsGroup(current: Message, previous: Message | undefined): boolean {
  if (!previous) return true;
  if (previous.author !== current.author) return true;
  if (dayKey(previous.createdAt) !== dayKey(current.createdAt)) return true;
  return new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

async function api<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json()) as { ok: boolean; data?: T };
    return json.ok ? (json.data as T) : null;
  } catch {
    return null;
  }
}

/**
 * 게시판 — 대화(채팅) 화면.
 *
 * 원래는 목록 → 글 열기 → 글쓰기로 넘어가는 게시판이었는데, 실제 쓰임이 "짧은 이야기를 계속
 * 주고받는" 쪽이라 대화 화면으로 바꿨다. 예전 글 2,001건은 그대로 남아 말풍선으로 보이고,
 * 제목이 있던 글은 첫 줄에 굵게 나온다 — 기록을 버리지 않기 위한 선택이다.
 *
 * 배치와 동시에 동작해야 하므로(사용자 요구) 별도의 DB 설계·액션 연결 없이 플랫폼이 제공하는
 * BoardPost/BoardAttachment 표를 쓴다. 어떤 게시판인지는 boardKey로 구분한다.
 *
 * 스크롤 규칙(요구사항): **화면이 맨 아래에 붙어 있을 때만** 새 메시지를 폴링해 따라 내려간다.
 * 위쪽을 읽는 중에는 폴링도 자동 스크롤도 멈춘다 — 읽던 자리가 밀리지 않게 하기 위해서다.
 */
export function Board({
  boardKey,
  title,
  description,
  pageSize,
  allowWrite,
  categories,
  searchable,
}: {
  boardKey: string;
  title: string;
  description?: string;
  /** 한 번에 불러오는 메시지 수(위로 올릴 때도 같은 크기로 이어 붙인다). */
  pageSize: number;
  allowWrite: boolean;
  categories: string;
  searchable: boolean;
}) {
  const categoryList = useMemo(
    () => categories.split(',').map((c) => c.trim()).filter(Boolean),
    [categories]
  );
  const limit = Math.min(100, Math.max(10, pageSize * 3));

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [author, setAuthor] = useState('');
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);

  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 최신 메시지 id — 폴링 커서. 렌더와 무관하게 최신 값을 읽어야 해 ref로 둔다. */
  const newestRef = useRef<string | null>(null);
  const atBottomRef = useRef(true);
  /**
   * 목록이 다시 그려진 **직후** 스크롤을 어떻게 할지. 화면에 실제로 붙기 전에는 높이를 알 수 없어
   * (setState 직후의 scrollHeight는 예전 값이다) 명령만 남겨 두고 레이아웃 단계에서 실행한다.
   * 처음에는 맨 아래로 — 대화는 가장 최근이 보여야 한다.
   */
  const scrollActionRef = useRef<
    { type: 'none' } | { type: 'bottom'; smooth?: boolean } | { type: 'anchor'; height: number; top: number } | { type: 'element'; id: string }
  >({ type: 'bottom' });

  useEffect(() => {
    newestRef.current = messages.length > 0 ? messages[messages.length - 1].id : null;
  }, [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  /**
   * 목록이 바뀔 때마다 (1) 예약된 스크롤을 실행하고 (2) **실제 위치로 상태를 맞춘다**.
   *
   * WHY (2): 예전에는 스크롤 이벤트가 올 때만 상태를 갱신했다. 그런데 처음 열 때는 이벤트가 한 번도
   * 나지 않으므로, 화면은 맨 위에 있는데 코드는 "맨 아래에 붙어 있다"고 믿고 폴링을 계속 돌렸다
   * (실측: 첫 로드 scrollTop 0인데 atBottom=true, '맨 아래로' 버튼도 안 나왔다).
   */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const action = scrollActionRef.current;
    scrollActionRef.current = { type: 'none' };

    if (action.type === 'bottom') {
      el.scrollTo({ top: el.scrollHeight, behavior: action.smooth ? 'smooth' : 'auto' });
    } else if (action.type === 'anchor') {
      // 위에 붙인 만큼 아래로 내려 읽던 자리를 그대로 유지한다.
      el.scrollTop = el.scrollHeight - action.height + action.top;
    } else if (action.type === 'element') {
      document.getElementById(`board-msg-${action.id}`)?.scrollIntoView({ block: 'center' });
    }

    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  }, [messages]);

  // ── 최초 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setAuthor(loadAuthor());
    // 삭제 버튼은 관리자로 로그인한 경우에만 보여준다(권한 자체는 서버가 다시 검사한다).
    void api<{ authenticated: boolean }>('/api/auth/session').then((d) => setIsAdmin(Boolean(d?.authenticated)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<{ items: Message[]; hasOlder: boolean }>(
      `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&limit=${limit}`
    ).then((data) => {
      if (cancelled) return;
      if (!data) {
        setError('대화를 불러오지 못했습니다.');
      } else {
        // 처음 열면 가장 최근 대화가 보여야 한다(실제 이동은 레이아웃 단계에서).
        scrollActionRef.current = { type: 'bottom' };
        setMessages(data.items);
        setHasOlder(data.hasOlder);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [boardKey, limit]);

  // ── 폴링: 맨 아래에 붙어 있을 때만 ────────────────────────────────────────
  useEffect(() => {
    if (!atBottom || loading) return;
    let stopped = false;

    const poll = async () => {
      const cursor = newestRef.current;
      if (!cursor || stopped) return;
      const data = await api<{ items: Message[] }>(
        `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&after=${encodeURIComponent(cursor)}`
      );
      if (stopped || !data || data.items.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = data.items.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        // 맨 아래에 붙어 있는 동안에만 도는 폴링이라 여기서는 따라 내려가는 게 맞다.
        scrollActionRef.current = { type: 'bottom', smooth: true };
        return [...prev, ...fresh];
      });
    };

    void poll(); // 맨 아래로 돌아온 순간 밀린 것을 바로 받는다
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [atBottom, loading, boardKey, scrollToBottom]);

  // ── 스크롤 상태 추적 + 위로 올리면 이전 메시지 ────────────────────────────
  const loadOlder = useCallback(async () => {
    const el = listRef.current;
    if (!el || loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const anchorHeight = el.scrollHeight;
    const anchorTop = el.scrollTop;
    const data = await api<{ items: Message[]; hasOlder: boolean }>(
      `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&before=${encodeURIComponent(messages[0].id)}&limit=${limit}`
    );
    if (data) {
      // 앞에 붙인 만큼 아래로 내려 **읽던 자리를 그대로** 유지한다.
      scrollActionRef.current = { type: 'anchor', height: anchorHeight, top: anchorTop };
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...data.items.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasOlder(data.hasOlder);
    }
    setLoadingOlder(false);
  }, [boardKey, hasOlder, limit, loadingOlder, messages]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (el.scrollTop <= TOP_TRIGGER) void loadOlder();
  }, [loadOlder]);

  // ── 특정 메시지로 이동(갤러리·검색) ───────────────────────────────────────
  const jumpTo = useCallback(
    async (postId: string) => {
      setGalleryOpen(false);
      setHits(null);
      const present = messages.some((m) => m.id === postId);
      if (!present) {
        const data = await api<{ items: Message[]; hasOlder: boolean }>(
          `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&around=${encodeURIComponent(postId)}&limit=${limit}`
        );
        if (!data) return;
        setMessages(data.items);
        setHasOlder(data.hasOlder);
      }
      setHighlightId(postId);
      // 목록이 새로 그려진 뒤에야 대상 요소가 존재한다.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.getElementById(`board-msg-${postId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        })
      );
      window.setTimeout(() => setHighlightId((id) => (id === postId ? null : id)), 2400);
    },
    [boardKey, limit, messages]
  );

  // ── 이미지 업로드(붙여넣기 · 끌어놓기 · 고르기) ───────────────────────────
  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      setUploading((n) => n + images.length);
      for (const file of images) {
        const form = new FormData();
        form.append('file', file);
        form.append('boardKey', boardKey);
        const data = await api<Attachment>('/api/board/uploads', { method: 'POST', body: form });
        if (data) setPending((prev) => [...prev, data]);
        else setError('이미지를 올리지 못했습니다(형식 · 크기를 확인해 주세요).');
        setUploading((n) => n - 1);
      }
    },
    [boardKey]
  );

  const send = useCallback(async () => {
    const content = draft.trim();
    if ((!content && pending.length === 0) || sending || !allowWrite) return;
    setSending(true);
    const saved = await api<{ id: string }>('/api/board/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardKey,
        title: '',
        content,
        author: author || '방문자',
        category: draftCategory || null,
        attachmentIds: pending.map((p) => p.id),
      }),
    });
    setSending(false);
    if (!saved) {
      setError('메시지를 보내지 못했습니다.');
      return;
    }
    setDraft('');
    setPending([]);
    setError(null);
    // 보낸 사람은 항상 맨 아래로 — 방금 보낸 것이 보여야 한다.
    atBottomRef.current = true;
    setAtBottom(true);
    scrollToBottom('smooth');
  }, [allowWrite, author, boardKey, draft, draftCategory, pending, scrollToBottom, sending]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/board/posts/${id}`, { method: 'DELETE' });
    if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const data = await api<{ items: SearchHit[]; total: number }>(
      `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&q=${encodeURIComponent(q)}&limit=30`
    );
    setHits(data?.items ?? []);
  }, [boardKey, query]);

  return (
    // max-h: 배치된 칸이 높이를 정해 주지 못하는 상황(칸이 내용에 맞춰 늘어나는 배치)에서도 대화가
    // 무한정 길어지지 않고 **자기 안에서** 스크롤하도록 스스로 상한을 갖는다.
    <div className="flex h-full max-h-[78vh] min-h-[280px] flex-col gap-2">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {searchable && (
            <div className="flex items-center gap-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void runSearch();
                  if (e.key === 'Escape') {
                    setQuery('');
                    setHits(null);
                  }
                }}
                placeholder="대화 검색"
                className="h-8 w-[140px]"
                aria-label="대화 검색"
              />
              <Button variant="ghost" size="icon-sm" onClick={() => void runSearch()} aria-label="검색">
                <Search className="size-4" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)}>
            <Images className="size-4" /> 갤러리
          </Button>
        </div>
      </header>

      {hits && (
        <div className="shrink-0 rounded-md border bg-muted/30 p-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            검색 결과 {hits.length}건 — 누르면 그 대화 위치로 이동합니다
            <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setHits(null)} aria-label="검색 결과 닫기">
              <X className="size-3.5" />
            </Button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {hits.length === 0 && <li className="py-2 text-center text-xs text-muted-foreground">일치하는 대화가 없습니다.</li>}
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void jumpTo(h.id)}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span className="font-medium">{h.author}</span>{' '}
                  <span className="text-muted-foreground">{timeOf(h.createdAt)}</span>
                  <span className="block truncate text-muted-foreground">{h.title || h.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 대화 ── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-3"
        >
          {loading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">불러오는 중…</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">아직 대화가 없습니다. 첫 메시지를 남겨보세요.</p>
          ) : (
            <>
              {hasOlder && (
                <div className="pb-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                    {loadingOlder ? <Loader2 className="size-3.5 animate-spin" /> : null} 이전 대화 더 보기
                  </Button>
                </div>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                const head = startsGroup(m, prev);
                const mine = m.author === author;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[11px] text-muted-foreground">{dayOf(m.createdAt)}</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div
                      id={`board-msg-${m.id}`}
                      className={cn(
                        'group/msg flex scroll-mt-6 flex-col gap-1 rounded-md px-1 py-0.5 transition-colors',
                        mine && 'items-end',
                        highlightId === m.id && 'bg-primary/10 ring-1 ring-primary/40'
                      )}
                    >
                      {head && (
                        <div className={cn('flex items-center gap-1.5 text-[11px] text-muted-foreground', mine && 'flex-row-reverse')}>
                          <span className="font-medium text-foreground/80">{m.author}</span>
                          <span>{timeOf(m.createdAt)}</span>
                          {m.category && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              {m.category}
                            </Badge>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="메시지 삭제"
                              className="size-5 opacity-0 transition-opacity group-hover/msg:opacity-100"
                              onClick={() => void remove(m.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      )}

                      <div
                        className={cn(
                          'max-w-[min(85%,44rem)] min-w-0 rounded-lg px-3 py-2',
                          mine ? 'bg-primary text-primary-foreground' : 'border bg-background'
                        )}
                      >
                        {/* 예전 게시글은 제목을 갖고 있다 — 대화에서는 첫 줄로 살린다. */}
                        {m.title && <p className="mb-1 text-sm font-semibold">{m.title}</p>}
                        {m.content && (
                          <Markdown
                            text={m.content}
                            className={cn('space-y-2', mine && '[&_a]:text-primary-foreground [&_a]:underline')}
                          />
                        )}
                        {m.attachments.length > 0 && (
                          <div className={cn('flex flex-wrap gap-2', (m.content || m.title) && 'mt-2')}>
                            {m.attachments.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => setLightbox(a)}
                                className="max-w-full overflow-hidden rounded-md border bg-background"
                                title={`${a.name}${a.width && a.height ? ` (${a.width}×${a.height})` : ''}`}
                              >
                                {/* 업로드된 사용자 이미지라 next/image 최적화 대상이 아니다(런타임 생성 경로).
                                    잘라내지 않는다 — 원본 비율 그대로 보이고, 폭이 모자랄 때만 비율을 지키며 줄어든다.
                                    aspect-ratio를 미리 주면 이미지가 도착하기 전에도 자리를 잡아 화면이 덜 흔들린다. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={a.url}
                                  alt={a.name}
                                  width={a.width ?? undefined}
                                  height={a.height ?? undefined}
                                  loading="lazy"
                                  onLoad={() => {
                                    // 이미지가 늦게 자리를 차지하면 높이가 바뀐다 — 맨 아래를 보고 있었다면 따라 내려간다.
                                    if (atBottomRef.current) scrollToBottom();
                                  }}
                                  // 원본 크기 그대로 — **폭이 모자랄 때만** 비율을 지키며 줄어든다.
                                  // 높이 상한은 두지 않는다(세로로 긴 그림도 잘리거나 눌리지 않게).
                                  className="h-auto w-auto max-w-full"
                                  style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 위쪽을 읽는 중에는 따라 내려가지 않는다 — 대신 돌아갈 길을 띄운다. */}
        {!atBottom && !loading && (
          <Button
            size="sm"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg"
            onClick={() => {
              atBottomRef.current = true;
              setAtBottom(true);
              scrollToBottom('smooth');
            }}
          >
            <ArrowDown className="size-4" /> 맨 아래로
          </Button>
        )}
      </div>

      {error && <p className="shrink-0 text-xs text-destructive">{error}</p>}

      {/* ── 입력 ── */}
      {allowWrite && (
        <div
          className="shrink-0 space-y-2 rounded-md border bg-background p-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void uploadFiles([...e.dataTransfer.files]);
          }}
        >
          {(pending.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {pending.map((p) => (
                <div key={p.id} className="relative">
                  {/* 보내기 전 미리보기도 잘라내지 않는다 — 붙여넣은 그림이 실제로 어떤 비율인지
                      여기서 바로 보여야 잘못 붙여넣은 것을 알아챈다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name}
                    title={`${p.name}${p.width && p.height ? ` (${p.width}×${p.height})` : ''}`}
                    className="h-16 w-auto max-w-32 rounded border bg-muted/30 object-contain"
                  />
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={`${p.name} 첨부 취소`}
                    className="absolute -right-1.5 -top-1.5 size-5 rounded-full"
                    onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              {uploading > 0 && (
                <span className="flex size-16 items-center justify-center rounded border text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Input
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value);
                window.localStorage.setItem(AUTHOR_KEY, e.target.value);
              }}
              className="h-9 w-24 shrink-0"
              aria-label="작성자"
              maxLength={24}
            />
            {categoryList.length > 0 && (
              <NativeSelect
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                className="h-9 w-24 shrink-0"
                aria-label="분류"
              >
                <option value="">분류 없음</option>
                {categoryList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            )}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // 클립보드에 이미지가 있으면 그대로 첨부한다 — 화면 캡처를 붙여넣는 것이 가장 흔한 쓰임이다.
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (files.some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault();
                  void uploadFiles(files);
                }
              }}
              onKeyDown={(e) => {
                // Enter로 보내고, Shift+Enter로 줄바꿈. 한글 조합 중의 Enter는 확정이므로 무시한다.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="메시지를 입력하세요. 이미지는 붙여넣기(Ctrl+V)로 첨부됩니다. Shift+Enter 줄바꿈"
              rows={2}
              maxLength={20000}
              className="min-h-9 flex-1 resize-none"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                void uploadFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="이미지 첨부">
              <Paperclip className="size-4" />
            </Button>
            <Button size="icon" onClick={() => void send()} disabled={sending || uploading > 0} aria-label="보내기">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      )}

      <GalleryDialog open={galleryOpen} onOpenChange={setGalleryOpen} boardKey={boardKey} onJump={(id) => void jumpTo(id)} />

      {/* 눌러서 크게 보기 — **원본 크기 그대로**. 다만 화면 폭을 넘지는 않게 하고(넘으면 비율을
          지키며 줄인다), 세로로 긴 그림은 줄이지 않고 안에서 스크롤한다. */}
      <Dialog open={Boolean(lightbox)} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent
          className="w-auto max-w-[96vw] p-3 sm:max-w-[96vw]"
          // 상자를 **그림 크기에 맞춘다**. 폭을 지정하지 않으면 어떤 그림이든 늘 최대 폭(96vw)으로
          // 열려, 작은 그림이 커다란 빈 상자 한가운데 놓인다. 안쪽 여백(p-3, 좌우 합 1.5rem)을
          // 더한 값으로 잡고 화면 폭에서 멈춘다 — 넘치는 그림은 비율을 지키며 줄어든다.
          style={lightbox?.width ? { width: `min(calc(${lightbox.width}px + 1.5rem), 96vw)` } : undefined}
        >
          <DialogHeader>
            <DialogTitle className="truncate text-sm">
              {lightbox?.name}
              {lightbox?.width && lightbox?.height && (
                <span className="ml-2 font-normal text-muted-foreground">
                  원본 {lightbox.width} × {lightbox.height}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {lightbox && (
            <div className="max-h-[80vh] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={lightbox.name}
                width={lightbox.width ?? undefined}
                height={lightbox.height ?? undefined}
                className="h-auto w-auto max-w-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 이 게시판에 올라온 이미지 모음. 고르면 그 이미지가 붙은 대화 위치로 이동한다. */
function GalleryDialog({
  open,
  onOpenChange,
  boardKey,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardKey: string;
  onJump: (postId: string) => void;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api<{ items: GalleryItem[]; total: number; pageSize: number }>(
      `/api/board/uploads?boardKey=${encodeURIComponent(boardKey)}&page=${page}`
    ).then((data) => {
      setItems(data?.items ?? []);
      setTotal(data?.total ?? 0);
      setLoading(false);
    });
  }, [open, boardKey, page]);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const pages = Math.max(1, Math.ceil(total / 60));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,72rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ImageIcon className="size-4" /> 갤러리
            <span className="font-normal text-muted-foreground">{total}장 — 누르면 그 대화 위치로 이동합니다</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">아직 올라온 이미지가 없습니다.</p>
        ) : (
          <div className="grid max-h-[62vh] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => it.postId && onJump(it.postId)}
                className="group/gal relative overflow-hidden rounded-md border hover:ring-2 hover:ring-primary"
                title={`${it.author} · ${new Date(it.createdAt).toLocaleString('ko-KR')}`}
              >
                {/* 격자는 칸 크기를 맞추되 그림은 잘라내지 않는다 — 비율이 보여야 어떤 그림인지 안다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.name} loading="lazy" className="aspect-square w-full bg-muted/40 object-contain" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1 py-0.5 text-left text-[10px] text-muted-foreground">
                  {it.author}
                </span>
              </button>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 text-xs">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span className="text-muted-foreground">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 빌더 캔버스·팔레트에서 쓰는 정적 미리보기 — 여기서 실제 조회를 하지 않는다. */
export function BoardPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <Button variant="outline" size="sm" className="ml-auto">
          <Images className="size-4" /> 갤러리
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden rounded-md border bg-muted/20 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">방문자1234</span> 09:12
          </span>
          <span className="max-w-[85%] rounded-lg border bg-background px-3 py-2 text-sm">
            FAR-26-1003 반출 일정 확인 부탁드립니다.
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] text-muted-foreground">
            09:13 <span className="font-medium text-foreground/80">방문자5678</span>
          </span>
          <span className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            내일 오전 반출 예정입니다. 캡처 첨부드립니다.
          </span>
          <span className="size-16 rounded border bg-background" />
        </div>
      </div>
      <div className="flex shrink-0 items-end gap-2 rounded-md border bg-background p-2">
        <Input value="방문자1234" readOnly className="h-9 w-24 shrink-0" aria-label="작성자" />
        <Textarea readOnly rows={2} placeholder="메시지를 입력하세요. 이미지는 붙여넣기(Ctrl+V)로 첨부됩니다." className="min-h-9 flex-1 resize-none" />
        <Button variant="ghost" size="icon" aria-label="이미지 첨부">
          <Paperclip className="size-4" />
        </Button>
        <Button size="icon" aria-label="보내기">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
