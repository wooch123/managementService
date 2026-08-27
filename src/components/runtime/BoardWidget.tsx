'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Images,
  Loader2,
  MessageSquare,
  MessageSquareReply,
  Paperclip,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/runtime/Markdown';
import { cn } from '@/lib/utils';

type Attachment = { id: string; url: string; name: string; width: number | null; height: number | null };
/** 채널 목록에 "N개의 답글"을 그리기 위한 요약 — 답글 본문은 스레드를 열 때 가져온다. */
type ThreadSummary = { replyCount: number; lastReplyAt: string; participants: string[] };
type Message = {
  id: string;
  title: string;
  content: string;
  author: string;
  category: string | null;
  /** null이면 채널 메시지, 값이 있으면 그 메시지의 답글. */
  parentId: string | null;
  createdAt: string;
  attachments: Attachment[];
  thread: ThreadSummary | null;
  /**
   * 화면에만 먼저 올린 메시지. 보내기를 누르면 서버 응답을 기다리지 않고 바로 대화에 붙이고,
   * 저장이 끝나면 진짜 id로 바꿔 단다 — 누르고 나서 잠깐 아무 일도 없는 것처럼 보이던 문제 때문이다.
   * 'sending'은 저장 중, 'failed'는 실패(다시 보내기 가능).
   */
  local?: 'sending' | 'failed';
};
type SearchHit = { id: string; author: string; title: string; excerpt: string; parentId: string | null; createdAt: string };
type GalleryItem = { id: string; url: string; name: string; postId: string | null; author: string; createdAt: string };

const AUTHOR_KEY = 'webapp-v1-board-author';
/** 폴링 주기 — 화면이 맨 아래에 붙어 있을 때만 돈다. */
const POLL_MS = 3000;
/** "맨 아래에 있다"고 볼 여유. 1~2px 차이로 붙었다 떨어졌다 하지 않게 넉넉히 둔다. */
const BOTTOM_SLACK = 48;
/** 위로 이만큼 남았을 때 이전 메시지를 미리 불러온다. */
const TOP_TRIGGER = 120;
/** 한 메시지에 붙일 수 있는 이미지 수 — 서버(POST /api/board/posts)의 상한과 같은 값이다. */
const MAX_ATTACHMENTS = 10;

/** 대화 안에서 그림이 차지할 최대 크기(원본은 눌러서 본다). */
const THUMB_MAX_W = 240;
const THUMB_MAX_H = 160;

/**
 * 대화에 그릴 크기를 **픽셀로 직접 계산**한다.
 *
 * WHY: CSS 상한(`max-width: min(15rem, 100%)`)으로 줄이면 퍼센트가 섞여, 감싼 상자의 폭을
 * 내용에 맞춰 정하는 계산과 순환이 생긴다. 브라우저는 이때 그림의 **고유 폭**으로 물러나
 * 1,448px짜리 그림 하나가 말풍선을 704px까지 밀어냈다(238px 그림 옆에 452px 빈자리).
 * 고정 픽셀로 주면 순환이 없고 비율도 정확하다. 좁은 화면 대응은 `max-w-full`이 맡는데,
 * 폭이 이미 확정돼 있어 상자 크기 계산에는 영향을 주지 않는다.
 */
function thumbSize(a: Attachment): { width: number; height: number } | null {
  if (!a.width || !a.height) return null;
  const scale = Math.min(1, THUMB_MAX_W / a.width, THUMB_MAX_H / a.height);
  return { width: Math.round(a.width * scale), height: Math.round(a.height * scale) };
}

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
/** 오늘 것은 시각만, 지난 것은 날짜까지 — 스레드 요약처럼 한 줄에 들어가야 하는 자리에 쓴다. */
const whenOf = (iso: string) =>
  dayKey(iso) === dayKey(new Date().toISOString())
    ? timeOf(iso)
    : new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/**
 * 이름에서 아바타 색을 만든다.
 *
 * 팔레트를 고정해 두지 않고 이름으로 색상환 위치를 정한다 — 참여자가 몇 명이 될지 모르는
 * 게시판이라 목록이 짧으면 서로 다른 사람이 같은 색을 갖는다. 채도·명도는 고정해서 밝은 테마와
 * 어두운 테마 어디서든 흰 글자가 읽히게 한다.
 */
function avatarTone(name: string): { backgroundColor: string } {
  let hue = 0;
  for (let i = 0; i < name.length; i += 1) hue = (hue * 31 + name.charCodeAt(i)) % 360;
  return { backgroundColor: `hsl(${hue} 46% 42%)` };
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'sm' | 'xs' }) {
  return (
    <span
      style={avatarTone(name)}
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-md font-semibold text-white',
        size === 'md' && 'size-9 text-sm',
        size === 'sm' && 'size-6 text-[11px]',
        size === 'xs' && 'size-5 text-[10px] ring-2 ring-background'
      )}
    >
      {name.trim().slice(0, 1) || '?'}
    </span>
  );
}

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

/** 답글이 하나 늘었을 때 채널 쪽 요약을 그 자리에서 고친다(폴링을 기다리지 않는다). */
function bumpSummary(summary: ThreadSummary | null, author: string, at: string): ThreadSummary {
  const participants = summary?.participants ?? [];
  return {
    replyCount: (summary?.replyCount ?? 0) + 1,
    lastReplyAt: at,
    participants: participants.includes(author) ? participants : [...participants, author].slice(0, 3),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 메시지 한 줄
// ────────────────────────────────────────────────────────────────────────────

/**
 * 슬랙식 메시지 줄.
 *
 * 말풍선을 쓰지 않는다 — 왼쪽에 아바타를 두고 본문은 폭을 그대로 쓰는 평평한 줄이다. 내가 쓴 글을
 * 오른쪽으로 보내지도 않는다. 여러 사람이 길게 이야기하는 화면에서는 좌우로 갈라진 말풍선보다
 * 한 줄로 흐르는 편이 읽기 쉽고, 스레드 답글까지 들여쓰면 더 그렇다.
 */
function MessageRow({
  message,
  head,
  isAdmin,
  allowWrite,
  showThreadFooter,
  highlighted,
  onReply,
  onOpenThread,
  onDelete,
  onRetry,
  onImage,
  onImageLoad,
}: {
  message: Message;
  head: boolean;
  isAdmin: boolean;
  allowWrite: boolean;
  /** 스레드 패널 안에서는 답글 요약을 다시 보여주지 않는다(이미 그 스레드 안이다). */
  showThreadFooter: boolean;
  highlighted: boolean;
  onReply: (message: Message) => void;
  onOpenThread: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (message: Message) => void;
  onImage: (a: Attachment) => void;
  onImageLoad: () => void;
}) {
  const summary = message.thread;
  return (
    <div
      id={`board-msg-${message.id}`}
      className={cn(
        'group/msg relative flex scroll-mt-6 gap-2 rounded-md px-2 transition-colors hover:bg-accent/40',
        head ? 'mt-2 pt-1 pb-0.5' : 'py-0.5',
        highlighted && 'bg-primary/10 ring-1 ring-primary/40',
        message.local === 'sending' && 'opacity-60',
        message.local === 'failed' && 'opacity-70'
      )}
    >
      {/* 왼쪽 기둥: 머리글이 있는 줄은 아바타, 이어지는 줄은 가리키면 시각이 뜬다. */}
      <div className="w-9 shrink-0 pt-0.5">
        {head ? (
          <Avatar name={message.author} />
        ) : (
          <span className="hidden pt-0.5 text-right text-[10px] leading-5 text-muted-foreground group-hover/msg:block">
            {timeOf(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 pb-0.5">
        {head && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{message.author}</span>
            <span className="text-[11px] text-muted-foreground">{timeOf(message.createdAt)}</span>
            {message.category && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                {message.category}
              </Badge>
            )}
            {/* 저장이 끝나기 전에도 줄은 이미 떠 있다 — 지금 어떤 상태인지 여기서 알린다. */}
            {message.local === 'sending' && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> 보내는 중
              </span>
            )}
            {message.local === 'failed' && (
              <span className="flex items-center gap-1 text-[11px] text-destructive">
                보내지 못함
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 px-1 text-[11px] text-destructive"
                  onClick={() => onRetry(message)}
                >
                  다시 보내기
                </Button>
              </span>
            )}
          </div>
        )}

        {/* 예전 게시글은 제목을 갖고 있다 — 대화에서는 첫 줄로 살린다. */}
        {message.title && <p className="text-sm font-semibold">{message.title}</p>}
        {message.content && <Markdown text={message.content} className="space-y-2 text-sm" />}

        {/* items-start: 한 줄에 놓인 그림들이 가장 큰 것 높이로 늘어나(flex 기본값 stretch)
            작은 그림 아래에 빈 칸이 생기던 것을 막는다. */}
        {message.attachments.length > 0 && (
          <div className={cn('flex flex-wrap items-start gap-2', (message.content || message.title) && 'mt-1.5')}>
            {message.attachments.map((a) => {
              const box = thumbSize(a);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onImage(a)}
                  className="max-w-full shrink-0 overflow-hidden rounded-md border bg-background"
                  title={`${a.name}${a.width && a.height ? ` (${a.width}×${a.height})` : ''}`}
                >
                  {/* 업로드된 사용자 이미지라 next/image 최적화 대상이 아니다(런타임 생성 경로).
                      잘라내지 않는다 — 표시 크기를 픽셀로 직접 계산해(thumbSize) 비율이 정확하고,
                      상자 폭 계산과 순환이 생기지 않는다. 화면이 더 좁으면 max-w-full이 마저 줄인다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.name}
                    width={box?.width ?? a.width ?? undefined}
                    height={box?.height ?? a.height ?? undefined}
                    loading="lazy"
                    onLoad={onImageLoad}
                    className="h-auto max-w-full"
                    style={box ? { width: box.width, aspectRatio: `${a.width} / ${a.height}` } : { maxHeight: THUMB_MAX_H, maxWidth: THUMB_MAX_W }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* 스레드 요약 — 슬랙에서 채널이 답글로 덮이지 않게 해 주는 바로 그 줄이다. */}
        {showThreadFooter && summary && summary.replyCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenThread(message.id)}
            className="mt-1 flex w-fit max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-accent"
          >
            <span className="flex -space-x-1">
              {summary.participants.map((p) => (
                <Avatar key={p} name={p} size="xs" />
              ))}
            </span>
            <span className="font-medium text-primary">{summary.replyCount}개의 답글</span>
            <span className="truncate text-muted-foreground">마지막 답글 {whenOf(summary.lastReplyAt)}</span>
          </button>
        )}
      </div>

      {/* 가리키면 나오는 도구 — 슬랙처럼 줄 오른쪽 위에 떠 있다(자리를 차지하지 않는다). */}
      {!message.local && (
        <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm group-hover/msg:flex">
          {allowWrite && (
            <Button variant="ghost" size="icon-sm" className="size-6" onClick={() => onReply(message)} title="스레드로 답글">
              <MessageSquareReply className="size-3.5" />
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="메시지 삭제"
              className="size-6 text-destructive"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 입력창
// ────────────────────────────────────────────────────────────────────────────

/**
 * 채널과 스레드가 함께 쓰는 입력창.
 *
 * 초안·첨부·업로드 상태를 **각자 갖는다**. 하나로 공유하면 스레드에 붙여넣은 그림이 채널 입력창에
 * 붙는다 — 두 입력창이 동시에 열려 있는 화면이라 반드시 갈라야 한다.
 */
function Composer({
  boardKey,
  author,
  onAuthorChange,
  categoryList,
  category,
  onCategoryChange,
  ariaLabel,
  sending,
  onSend,
  autoFocus,
}: {
  boardKey: string;
  author: string;
  onAuthorChange: (value: string) => void;
  /** 스레드 답글은 부모의 분류를 따르므로 선택 상자를 주지 않는다(빈 배열). */
  categoryList: string[];
  category: string;
  onCategoryChange: (value: string) => void;
  /**
   * 입력창에 안내 문구를 띄우지 않는다(사용자 요구) — 늘 같은 말이 회색으로 깔려 있으면
   * 글을 쓸 때마다 눈에 걸린다. 대신 화면 낭독기가 읽을 이름은 여기로 준다.
   */
  ariaLabel: string;
  sending: boolean;
  onSend: (content: string, attachments: Attachment[]) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  /** 올리는 중인 것까지 포함한 첨부 수 — 여러 장을 동시에 올릴 때 상한을 정확히 세기 위해 즉시 갱신한다. */
  const pendingRef = useRef(0);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;

      const room = MAX_ATTACHMENTS - pendingRef.current;
      if (room <= 0) {
        setNotice(`한 번에 보낼 수 있는 이미지는 ${MAX_ATTACHMENTS}장까지입니다.`);
        return;
      }
      const batch = images.slice(0, room);
      if (batch.length < images.length) {
        setNotice(`이미지는 한 번에 ${MAX_ATTACHMENTS}장까지만 올라갑니다(${images.length - batch.length}장 제외).`);
      }
      pendingRef.current += batch.length;
      setUploading((n) => n + batch.length);

      // 여러 장을 **한꺼번에** 올린다 — 한 장씩 차례로 기다리면 붙여넣은 장수만큼 시간이 곱해진다.
      const results = await Promise.all(
        batch.map(async (file) => {
          const form = new FormData();
          form.append('file', file);
          form.append('boardKey', boardKey);
          const data = await api<Attachment>('/api/board/uploads', { method: 'POST', body: form });
          setUploading((n) => n - 1);
          return data;
        })
      );

      // 붙여넣은 순서를 그대로 유지한다(먼저 끝난 순서가 아니라).
      const uploaded = results.filter((r): r is Attachment => Boolean(r));
      pendingRef.current -= batch.length - uploaded.length;
      if (uploaded.length > 0) setPending((prev) => [...prev, ...uploaded]);
      if (uploaded.length < batch.length) {
        setNotice(`${batch.length - uploaded.length}장을 올리지 못했습니다(형식 · 크기를 확인해 주세요).`);
      }
    },
    [boardKey]
  );

  const submit = () => {
    const content = draft.trim();
    if (!content && pending.length === 0) return;
    setDraft('');
    setPending([]);
    pendingRef.current = 0;
    setNotice(null);
    onSend(content, pending);
  };

  return (
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
                onClick={() => {
                  pendingRef.current = Math.max(0, pendingRef.current - 1);
                  setPending((prev) => prev.filter((x) => x.id !== p.id));
                }}
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
          onChange={(e) => onAuthorChange(e.target.value)}
          className="h-9 w-24 shrink-0"
          aria-label="작성자"
          maxLength={24}
        />
        {categoryList.length > 0 && (
          <NativeSelect
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
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
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // 클립보드에 이미지가 있으면 그대로 첨부한다 — 화면 캡처를 붙여넣는 것이 가장 흔한 쓰임이다.
          // 여러 장을 한 번에 붙여넣는 경우(탐색기에서 파일 여러 개 복사)도 그대로 받는다.
          onPaste={(e) => {
            // `files`와 `items`는 **같은 그림을 양쪽에서** 준다(files가 items에서 파생된다).
            // 둘을 합쳐서 이름·크기로 걸러 봤더니, 붙여넣은 화면 캡처는 이름이 매번
            // "image.png"로 같고 `getAsFile()`이 만들어 주는 File의 시각이 달라 같은 그림이
            // 서로 다른 것으로 보였다 — 한 장이 두 장으로 올라갔다.
            // 그래서 합치지 않는다: `files`가 있으면 그것만 쓰고, 비었을 때만 `items`에서 꺼낸다.
            const fromFiles = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
            const images =
              fromFiles.length > 0
                ? fromFiles
                : [...e.clipboardData.items]
                    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                    .map((it) => it.getAsFile())
                    .filter((f): f is File => Boolean(f));
            if (images.length > 0) {
              e.preventDefault();
              void uploadFiles(images);
            }
          }}
          onKeyDown={(e) => {
            // Enter로 보내고, Shift+Enter로 줄바꿈. 한글 조합 중의 Enter는 확정이므로 무시한다.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label={ariaLabel}
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
        <Button size="icon" onClick={submit} disabled={sending || uploading > 0} aria-label="보내기">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>

      {notice && <p className="text-xs text-destructive">{notice}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 게시판
// ────────────────────────────────────────────────────────────────────────────

/**
 * 게시판 — **슬랙 스레드 화면**.
 *
 * 채널에는 부모 메시지만 흐르고, 답글은 그 메시지의 스레드 안에만 쌓인다. 채널 줄 아래에는
 * "N개의 답글"이 붙어 스레드가 있다는 것만 알린다 — 길게 이어지는 이야기가 채널을 덮지 않게
 * 하는 것이 스레드를 쓰는 이유다. 스레드는 넓은 화면에서는 오른쪽에 나란히, 좁으면 채널을 덮는
 * 패널로 열린다.
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
  const [draftCategory, setDraftCategory] = useState('');
  const [sending, setSending] = useState(false);

  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  // ── 스레드 ──
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSending, setThreadSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const threadListRef = useRef<HTMLDivElement>(null);
  /** 최신 메시지 id — 폴링 커서. 렌더와 무관하게 최신 값을 읽어야 해 ref로 둔다. */
  const newestRef = useRef<string | null>(null);
  const threadCursorRef = useRef<string | null>(null);
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
    // 아직 저장 중인(화면에만 있는) 메시지는 커서가 될 수 없다 — 서버가 모르는 id다.
    const confirmed = messages.filter((m) => !m.local);
    newestRef.current = confirmed.length > 0 ? confirmed[confirmed.length - 1].id : null;
  }, [messages]);

  useEffect(() => {
    const confirmed = replies.filter((m) => !m.local);
    // 답글이 아직 없으면 부모가 커서다 — 부모보다 뒤에 달린 것이 곧 이 스레드의 답글이다.
    threadCursorRef.current = confirmed.length > 0 ? confirmed[confirmed.length - 1].id : threadRootId;
  }, [replies, threadRootId]);

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

  // 스레드는 짧다 — 답글이 늘면 그냥 맨 아래를 보여준다.
  useLayoutEffect(() => {
    const el = threadListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies, threadParent]);

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
      const data = await api<{ items: Message[]; threadUpdates: Record<string, ThreadSummary> }>(
        `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&after=${encodeURIComponent(cursor)}`
      );
      if (stopped || !data) return;

      const updates = data.threadUpdates ?? {};
      const hasUpdates = Object.keys(updates).length > 0;
      if (data.items.length === 0 && !hasUpdates) return;

      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = data.items.filter((m) => !known.has(m.id));
        // 남이 단 답글은 채널에 새 줄로 나타나지 않는다 — 요약만 바뀐다.
        const merged = hasUpdates ? prev.map((m) => (updates[m.id] ? { ...m, thread: updates[m.id] } : m)) : prev;
        if (fresh.length === 0) return merged;
        // 맨 아래에 붙어 있는 동안에만 도는 폴링이라 여기서는 따라 내려가는 게 맞다.
        scrollActionRef.current = { type: 'bottom', smooth: true };
        return [...merged, ...fresh];
      });
    };

    void poll(); // 맨 아래로 돌아온 순간 밀린 것을 바로 받는다
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [atBottom, loading, boardKey]);

  // ── 열려 있는 스레드 폴링 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!threadRootId || threadLoading) return;
    let stopped = false;

    const poll = async () => {
      const cursor = threadCursorRef.current;
      if (!cursor || stopped) return;
      const data = await api<{ items: Message[]; replyCount: number }>(
        `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&threadOf=${encodeURIComponent(threadRootId)}&after=${encodeURIComponent(cursor)}`
      );
      if (stopped || !data || data.items.length === 0) return;
      setReplies((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = data.items.filter((m) => !known.has(m.id));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
    };

    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [boardKey, threadRootId, threadLoading]);

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

  // ── 스레드 열고 닫기 ──────────────────────────────────────────────────────
  const openThread = useCallback(
    async (id: string, highlightReplyId?: string) => {
      setThreadRootId(id);
      setThreadLoading(true);
      setReplies([]);
      setThreadParent(null);
      const data = await api<{ parent: Message; items: Message[]; replyCount: number }>(
        `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&threadOf=${encodeURIComponent(id)}`
      );
      if (data) {
        setThreadRootId(data.parent.id);
        setThreadParent(data.parent);
        setReplies(data.items);
        // 채널 쪽 요약도 방금 읽은 값으로 맞춘다 — 폴링을 기다릴 이유가 없다.
        setMessages((prev) =>
          prev.map((m) =>
            m.id !== data.parent.id
              ? m
              : {
                  ...m,
                  thread:
                    data.replyCount === 0
                      ? null
                      : {
                          replyCount: data.replyCount,
                          lastReplyAt: data.items.at(-1)?.createdAt ?? m.createdAt,
                          participants: [...new Set(data.items.map((r) => r.author))].slice(0, 3),
                        },
                }
          )
        );
        if (highlightReplyId) {
          setHighlightId(highlightReplyId);
          window.setTimeout(() => setHighlightId((cur) => (cur === highlightReplyId ? null : cur)), 2400);
        }
      } else {
        setError('스레드를 불러오지 못했습니다.');
        setThreadRootId(null);
      }
      setThreadLoading(false);
    },
    [boardKey]
  );

  const closeThread = useCallback(() => {
    setThreadRootId(null);
    setThreadParent(null);
    setReplies([]);
  }, []);

  /**
   * 답글 단추와 "N개의 답글"은 **토글**이다 — 이미 열려 있는 스레드를 다시 누르면 닫힌다.
   *
   * 같은 것을 다시 열어 봐야 달라지는 게 없고, 넓은 화면에서는 스레드가 채널의 절반을 가져가므로
   * 되돌릴 길이 눌렀던 그 자리에 있는 편이 자연스럽다. 검색·갤러리에서 들어오는 경로는 토글하지
   * 않는다(그쪽은 "이 메시지를 보여 달라"는 요청이지 여닫기가 아니다).
   */
  const toggleThread = useCallback(
    (id: string) => {
      if (threadRootId === id) closeThread();
      else void openThread(id);
    },
    [closeThread, openThread, threadRootId]
  );

  // ── 특정 메시지로 이동(갤러리·검색) ───────────────────────────────────────
  const jumpTo = useCallback(
    async (postId: string, parentId?: string | null) => {
      setGalleryOpen(false);
      setHits(null);
      // 답글은 채널에 없다 — 그 스레드를 열어서 보여준다.
      if (parentId) {
        await openThread(parentId, postId);
        return;
      }
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
    [boardKey, limit, messages, openThread]
  );

  /**
   * 갤러리에서 고른 그림이 답글에 붙어 있을 수도 있다. 채널에 없으면 그 메시지의 부모를 물어보고
   * 스레드를 연다 — 갤러리는 부모가 누구인지 모른 채 postId만 갖고 있기 때문이다.
   */
  const jumpToUnknown = useCallback(
    async (postId: string) => {
      if (messages.some((m) => m.id === postId)) {
        await jumpTo(postId);
        return;
      }
      const data = await api<{ parent: Message; items: Message[] }>(
        `/api/board/posts?boardKey=${encodeURIComponent(boardKey)}&threadOf=${encodeURIComponent(postId)}`
      );
      // threadOf는 답글 id로도 그 스레드를 돌려준다. 돌아온 부모가 자기 자신이면 채널 메시지다.
      if (data && data.parent.id !== postId) await jumpTo(postId, data.parent.id);
      else await jumpTo(postId);
    },
    [boardKey, jumpTo, messages]
  );

  /**
   * 보내기 — **먼저 화면에 올리고** 저장한다.
   *
   * 예전에는 저장이 끝난 뒤에야 폴링이 그 메시지를 물어 왔다. 누르고 나서 최대 3초 동안 아무 일도
   * 일어나지 않는 것처럼 보여서, 사용자가 다시 누르게 된다. 이제 곧바로 줄이 뜨고 그 옆에
   * "보내는 중"이 붙었다가, 저장이 끝나면 진짜 메시지로 바뀐다(실패하면 다시 보내기가 나온다).
   */
  const send = useCallback(
    async (input: { content: string; attachments: Attachment[]; parentId: string | null; retry?: Message }) => {
      const { retry } = input;
      const content = retry ? retry.content : input.content;
      const attachments = retry ? retry.attachments : input.attachments;
      const parentId = retry ? retry.parentId : input.parentId;
      if ((!content && attachments.length === 0) || !allowWrite) return;

      const isReply = Boolean(parentId);
      const localId = retry?.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: Message = {
        id: localId,
        title: '',
        content,
        author: (retry?.author || author || '방문자').trim(),
        // 답글은 부모의 분류를 따른다 — 검색·분류 필터에서 스레드가 통째로 같이 걸리도록.
        category: retry ? retry.category : isReply ? (threadParent?.category ?? null) : draftCategory || null,
        parentId: parentId ?? null,
        createdAt: retry?.createdAt ?? new Date().toISOString(),
        attachments,
        thread: null,
        local: 'sending',
      };

      const place = (list: Message[]) =>
        retry ? list.map((m) => (m.id === localId ? optimistic : m)) : [...list, optimistic];

      if (isReply) {
        setReplies(place);
        setThreadSending(true);
      } else {
        if (!retry) scrollActionRef.current = { type: 'bottom', smooth: true };
        setMessages(place);
        setSending(true);
      }
      setError(null);

      const saved = await api<{ id: string; parentId: string | null; createdAt: string }>('/api/board/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardKey,
          title: '',
          content,
          author: optimistic.author,
          category: optimistic.category,
          parentId: parentId ?? undefined,
          attachmentIds: attachments.map((p) => p.id),
        }),
      });
      if (isReply) setThreadSending(false);
      else setSending(false);

      const settle = (list: Message[]) =>
        list.map((m) =>
          m.id !== localId
            ? m
            : saved
              ? // 진짜 id로 바꿔 달아야 폴링이 같은 메시지를 한 번 더 붙이지 않는다.
                { ...m, id: saved.id, createdAt: saved.createdAt, local: undefined }
              : { ...m, local: 'failed' as const }
        );

      if (isReply) {
        setReplies(settle);
        // 채널의 "N개의 답글"을 그 자리에서 올린다 — 내가 단 답글이 3초 뒤에야 세어지면 이상하다.
        if (saved && parentId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === parentId ? { ...m, thread: bumpSummary(m.thread, optimistic.author, saved.createdAt) } : m
            )
          );
        }
      } else {
        setMessages(settle);
      }
      if (!saved) setError('메시지를 보내지 못했습니다. 다시 보내기를 눌러 주세요.');
    },
    [allowWrite, author, boardKey, draftCategory, threadParent]
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/board/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setReplies((prev) => {
        if (!prev.some((m) => m.id === id)) return prev;
        // 답글이 하나 사라졌으니 채널 요약도 함께 줄인다.
        setMessages((channel) =>
          channel.map((m) =>
            m.id !== threadRootId || !m.thread
              ? m
              : { ...m, thread: m.thread.replyCount <= 1 ? null : { ...m.thread, replyCount: m.thread.replyCount - 1 } }
          )
        );
        return prev.filter((m) => m.id !== id);
      });
      // 스레드의 뿌리를 지웠으면 패널을 닫는다 — 답글도 함께 사라졌다.
      if (id === threadRootId) closeThread();
    },
    [closeThread, threadRootId]
  );

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

  const changeAuthor = useCallback((value: string) => {
    setAuthor(value);
    window.localStorage.setItem(AUTHOR_KEY, value);
  }, []);

  const onImageLoad = useCallback(() => {
    // 그림이 늦게 자리를 차지하면 높이가 바뀐다 — 맨 아래를 보고 있었다면 따라 내려간다.
    if (atBottomRef.current) scrollToBottom();
  }, [scrollToBottom]);

  const threadOpen = Boolean(threadRootId);

  return (
    // max-h: 배치된 칸이 높이를 정해 주지 못하는 상황(칸이 내용에 맞춰 늘어나는 배치)에서도 대화가
    // 무한정 길어지지 않고 **자기 안에서** 스크롤하도록 스스로 상한을 갖는다.
    <div className="board-root flex h-full max-h-[78vh] min-h-[280px] flex-col gap-2" data-thread={threadOpen ? 'open' : 'closed'}>
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
                  onClick={() => void jumpTo(h.id, h.parentId)}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span className="font-medium">{h.author}</span>{' '}
                  <span className="text-muted-foreground">{timeOf(h.createdAt)}</span>
                  {/* 답글이 걸렸다는 것을 미리 알려 준다 — 눌렀을 때 스레드가 열리는 이유가 된다. */}
                  {h.parentId && (
                    <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                      스레드
                    </Badge>
                  )}
                  <span className="block truncate text-muted-foreground">{h.title || h.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 채널 + 스레드 ── */}
      <div className="relative flex min-h-0 flex-1 gap-2">
        {/* 좁은 칸에서 스레드가 열리면 채널이 숨는다 — 둘 다 밀어 넣으면 어느 쪽도 못 읽는다.
            판정은 **CSS 컨테이너 쿼리**가 한다(globals.css의 `.board-root` 규칙). 자바스크립트로
            폭을 재면 첫 페인트 뒤에야 값이 와서 레이아웃이 한 번 튀고, 화면이 그려지지 않는
            상황에서는 아예 오지 않는다(실측: 683px 칸인데 나란히 배치로 남았다). */}
        <div className="board-channel flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="relative min-h-0 flex-1">
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto rounded-md border bg-muted/20 py-2"
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
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="my-3 flex items-center gap-2 px-2">
                            <span className="h-px flex-1 bg-border" />
                            <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                              {dayOf(m.createdAt)}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <MessageRow
                          message={m}
                          head={newDay || startsGroup(m, prev)}
                          isAdmin={isAdmin}
                          allowWrite={allowWrite}
                          showThreadFooter
                          highlighted={highlightId === m.id}
                          onReply={(msg) => toggleThread(msg.id)}
                          onOpenThread={(id) => toggleThread(id)}
                          onDelete={(id) => void remove(id)}
                          onRetry={(msg) => void send({ content: '', attachments: [], parentId: null, retry: msg })}
                          onImage={setLightbox}
                          onImageLoad={onImageLoad}
                        />
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

          {allowWrite && (
            <Composer
              boardKey={boardKey}
              author={author}
              onAuthorChange={changeAuthor}
              categoryList={categoryList}
              category={draftCategory}
              onCategoryChange={setDraftCategory}
              ariaLabel="메시지 입력"
              sending={sending}
              onSend={(content, attachments) => void send({ content, attachments, parentId: null })}
            />
          )}
        </div>

        {/* ── 스레드 패널 ── */}
        {threadOpen && (
          <div className="board-thread flex min-h-0 flex-col gap-2 rounded-md border bg-background">
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">스레드</span>
              <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={closeThread} aria-label="스레드 닫기">
                <X className="size-4" />
              </Button>
            </div>

            <div ref={threadListRef} className="min-h-0 flex-1 overflow-y-auto pb-2">
              {threadLoading || !threadParent ? (
                <p className="py-8 text-center text-xs text-muted-foreground">불러오는 중…</p>
              ) : (
                <>
                  <MessageRow
                    message={threadParent}
                    head
                    isAdmin={isAdmin}
                    allowWrite={false}
                    showThreadFooter={false}
                    highlighted={highlightId === threadParent.id}
                    onReply={() => undefined}
                    onOpenThread={() => undefined}
                    onDelete={(id) => void remove(id)}
                    onRetry={() => undefined}
                    onImage={setLightbox}
                    onImageLoad={() => undefined}
                  />

                  <div className="my-2 flex items-center gap-2 px-3">
                    <span className="text-[11px] text-muted-foreground">
                      {replies.length === 0 ? '아직 답글이 없습니다' : `${replies.length}개의 답글`}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  {replies.map((r, i) => (
                    <MessageRow
                      key={r.id}
                      message={r}
                      head={startsGroup(r, replies[i - 1])}
                      isAdmin={isAdmin}
                      allowWrite={false}
                      showThreadFooter={false}
                      highlighted={highlightId === r.id}
                      onReply={() => undefined}
                      onOpenThread={() => undefined}
                      onDelete={(id) => void remove(id)}
                      onRetry={(msg) => void send({ content: '', attachments: [], parentId: threadRootId, retry: msg })}
                      onImage={setLightbox}
                      onImageLoad={() => undefined}
                    />
                  ))}
                </>
              )}
            </div>

            {allowWrite && threadParent && (
              <div className="px-2 pb-2">
                <Composer
                  boardKey={boardKey}
                  author={author}
                  onAuthorChange={changeAuthor}
                  categoryList={[]}
                  category=""
                  onCategoryChange={() => undefined}
                  ariaLabel="스레드 답글 입력"
                  sending={threadSending}
                  autoFocus
                  onSend={(content, attachments) => void send({ content, attachments, parentId: threadRootId })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="shrink-0 text-xs text-destructive">{error}</p>}

      <GalleryDialog open={galleryOpen} onOpenChange={setGalleryOpen} boardKey={boardKey} onJump={(id) => void jumpToUnknown(id)} />

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
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    void api<{ items: GalleryItem[] }>(`/api/board/uploads?boardKey=${encodeURIComponent(boardKey)}&limit=200`).then(
      (data) => {
        if (!cancelled) setItems(data?.items ?? []);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, boardKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            갤러리
            {items && <span className="ml-2 font-normal text-muted-foreground">{items.length}장</span>}
          </DialogTitle>
        </DialogHeader>
        {!items ? (
          <p className="py-8 text-center text-xs text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">아직 올라온 이미지가 없습니다.</p>
        ) : (
          <div className="grid max-h-[70vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.postId}
                onClick={() => item.postId && onJump(item.postId)}
                className="group/gal overflow-hidden rounded-md border bg-muted/30 text-left disabled:opacity-60"
                title={`${item.author} · ${item.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.name}
                  loading="lazy"
                  className="h-28 w-full bg-background object-contain transition-transform group-hover/gal:scale-105"
                />
                <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">
                  {item.author} · {timeOf(item.createdAt)}
                </span>
              </button>
            ))}
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
      <h3 className="shrink-0 truncate text-sm font-medium">{title}</h3>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden rounded-md border bg-muted/20 p-3">
        {[
          { author: '방문자1234', body: '설비 점검 결과 공유합니다.', replies: 3 },
          { author: '이담당', body: '확인했습니다. 스레드에서 이어가죠.', replies: 0 },
        ].map((row) => (
          <div key={row.author} className="flex gap-2">
            <Avatar name={row.author} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{row.author}</span>
                <span className="text-[11px] text-muted-foreground">오전 09:12</span>
              </div>
              <p className="text-sm">{row.body}</p>
              {row.replies > 0 && (
                <span className="mt-1 flex items-center gap-1.5 text-xs">
                  <MessageSquare className="size-3 text-muted-foreground" />
                  <span className="font-medium text-primary">{row.replies}개의 답글</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-md border bg-background p-2">
        <Input value="방문자1234" readOnly className="h-9 w-24 shrink-0" aria-label="작성자" />
        <div className="h-9 flex-1 rounded-md border bg-muted/30" />
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
