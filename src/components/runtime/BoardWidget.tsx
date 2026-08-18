'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Code,
  Eye,
  Heading,
  Italic,
  Link2,
  List,
  Pencil,
  Quote,
  Search,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/runtime/Markdown';
import { cn } from '@/lib/utils';

type ListItem = {
  id: string;
  title: string;
  author: string;
  category: string | null;
  excerpt: string;
  viewCount: number;
  createdAt: string;
};

type PostDetail = ListItem & { content: string };

type ListResponse = { total: number; page: number; pageSize: number; items: ListItem[] };

const AUTHOR_KEY = 'webapp-v1-board-author';

/** 표시용 작성자명. 설계 데이터가 아니라 방문자 로컬 UI 상태라 localStorage에 둔다(CLAUDE.md §4.2 예외). */
function loadAuthor(): string {
  if (typeof window === 'undefined') return '';
  const saved = window.localStorage.getItem(AUTHOR_KEY);
  if (saved) return saved;
  const generated = `방문자${Math.floor(1000 + Math.random() * 9000)}`;
  window.localStorage.setItem(AUTHOR_KEY, generated);
  return generated;
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });

const dateTimeOf = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * 게시판 — 목록 / 조회 / 글쓰기가 한 컴포넌트 안에서 전환된다.
 *
 * 배치와 동시에 동작해야 하므로(사용자 요구) 별도의 DB 설계·액션 연결 없이 플랫폼이 제공하는
 * BoardPost 테이블을 쓴다. 어떤 게시판인지는 boardKey로 구분하고, 기본값은 배치된 노드 id다 —
 * 즉 캔버스에 하나 놓으면 그 순간 독립된 게시판이 하나 생긴다.
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
  pageSize: number;
  allowWrite: boolean;
  categories: string;
  searchable: boolean;
}) {
  const categoryList = useMemo(
    () =>
      categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    [categories]
  );

  const [view, setView] = useState<'list' | 'detail' | 'write'>('list');
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setAuthor(loadAuthor());
    // 삭제 버튼은 관리자로 로그인한 경우에만 보여준다(권한 자체는 서버가 다시 검사한다).
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((j) => setIsAdmin(Boolean(j?.ok && j.data?.authenticated)))
      .catch(() => undefined);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      boardKey,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (query) params.set('q', query);
    if (categoryFilter) params.set('category', categoryFilter);
    try {
      const res = await fetch(`/api/board/posts?${params.toString()}`);
      const json = (await res.json()) as { ok: boolean; data?: ListResponse; error?: { message: string } };
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? '목록을 불러오지 못했습니다.');
      setItems(json.data.items);
      setTotal(json.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [boardKey, page, pageSize, query, categoryFilter]);

  useEffect(() => {
    if (view === 'list') void loadList();
  }, [view, loadList]);

  async function openPost(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/board/posts/${id}`);
      const json = (await res.json()) as { ok: boolean; data?: PostDetail; error?: { message: string } };
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? '글을 불러오지 못했습니다.');
      setPost(json.data);
      setView('detail');
    } catch (e) {
      setError(e instanceof Error ? e.message : '글을 불러오지 못했습니다.');
    }
  }

  async function submitPost() {
    if (!draftTitle.trim() || !draftBody.trim() || !author.trim()) {
      setError('제목 · 작성자 · 내용을 모두 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/board/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardKey,
          title: draftTitle.trim(),
          content: draftBody.trim(),
          author: author.trim(),
          category: draftCategory || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? '등록하지 못했습니다.');
      window.localStorage.setItem(AUTHOR_KEY, author.trim());
      setDraftTitle('');
      setDraftBody('');
      setDraftCategory('');
      setPage(1);
      setView('list');
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function removePost(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/board/posts/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? '삭제하지 못했습니다.');
      setPost(null);
      setView('list');
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {view === 'list' && allowWrite ? (
          <Button size="sm" onClick={() => setView('write')}>
            <Pencil className="size-4" />
            글쓰기
          </Button>
        ) : null}
        {view !== 'list' ? (
          <Button size="sm" variant="outline" onClick={() => setView('list')}>
            <ArrowLeft className="size-4" />
            목록
          </Button>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : null}

      {view === 'list' ? (
        <>
          {(searchable || categoryList.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {categoryList.length > 0 && (
                <NativeSelect
                  className="h-8 w-auto text-xs"
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">전체 분류</option>
                  {categoryList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {searchable && (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setQuery(searchInput.trim());
                    setPage(1);
                  }}
                >
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="제목 · 내용 검색"
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    <Search className="size-4" />
                    검색
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="w-14 px-3 py-2 font-medium">번호</th>
                  {categoryList.length > 0 && <th className="w-24 px-2 py-2 font-medium">분류</th>}
                  <th className="px-2 py-2 font-medium">제목</th>
                  <th className="w-24 px-2 py-2 font-medium">작성자</th>
                  <th className="w-20 px-2 py-2 font-medium">작성일</th>
                  <th className="w-14 px-3 py-2 text-right font-medium">조회</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      불러오는 중…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {query || categoryFilter ? '조건에 맞는 글이 없습니다.' : '아직 등록된 글이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => void openPost(item.id)}
                      className="cursor-pointer border-t transition-colors hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {total - (page - 1) * pageSize - idx}
                      </td>
                      {categoryList.length > 0 && (
                        <td className="px-2 py-2">
                          {item.category ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {item.category}
                            </Badge>
                          ) : null}
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <span className="font-medium">{item.title}</span>
                        {item.excerpt ? (
                          <span className="ml-2 hidden text-muted-foreground sm:inline">
                            {item.excerpt}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{item.author}</td>
                      <td className="px-2 py-2 text-muted-foreground">{dateOf(item.createdAt)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.viewCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              전체 {total}건 · {page}/{totalPages} 쪽
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                이전
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                다음
              </Button>
            </div>
          </footer>
        </>
      ) : null}

      {view === 'detail' && post ? (
        <article className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-wrap items-center gap-2">
            {post.category ? <Badge variant="secondary">{post.category}</Badge> : null}
            <h4 className="text-base font-semibold">{post.title}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {post.author} · {dateTimeOf(post.createdAt)} · 조회 {post.viewCount}
          </p>
          <hr className="my-3 border-border" />
          <Markdown text={post.content} />
          {isAdmin ? (
            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => void removePost(post.id)}>
                <Trash2 className="size-4" />
                삭제
              </Button>
            </div>
          ) : null}
        </article>
      ) : null}

      {view === 'write' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-title" className="text-xs">
                제목
              </Label>
              <Input
                id="board-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={120}
                placeholder="제목을 입력하세요"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-author" className="text-xs">
                작성자
              </Label>
              <Input
                id="board-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={24}
              />
            </div>
          </div>

          {categoryList.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">분류</Label>
              <NativeSelect
                className="w-auto"
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
              >
                <option value="">선택 안 함</option>
                {categoryList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <PostEditor value={draftBody} onChange={setDraftBody} />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setView('list')}>
              취소
            </Button>
            <Button onClick={() => void submitPost()} disabled={saving}>
              등록
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 본문 편집기 — 선택 영역에 마크다운 기호를 넣어 주는 툴바 + 미리보기. */
function PostEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function surround(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || '텍스트';
    const next = `${value.slice(0, s)}${before}${selected}${after}${value.slice(e)}`;
    onChange(next);
    // 넣은 기호 안쪽을 다시 선택해 둬야 이어서 타이핑하기 편하다.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  function prefixLine(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s } = el;
    const lineStart = value.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  const tools = [
    { icon: Bold, label: '굵게', run: () => surround('**') },
    { icon: Italic, label: '기울임', run: () => surround('*') },
    { icon: Heading, label: '제목', run: () => prefixLine('## ') },
    { icon: List, label: '목록', run: () => prefixLine('- ') },
    { icon: Quote, label: '인용', run: () => prefixLine('> ') },
    { icon: Code, label: '코드', run: () => surround('`') },
    { icon: Link2, label: '링크', run: () => surround('[', '](https://)') },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            title={t.label}
            onClick={t.run}
          >
            <t.icon className="size-4" />
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={preview ? 'secondary' : 'ghost'}
          className="ml-auto h-8 px-2"
          onClick={() => setPreview((p) => !p)}
        >
          <Eye className="size-4" />
          미리보기
        </Button>
      </div>

      {preview ? (
        <div className="min-h-40 flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <p className="text-xs text-muted-foreground">미리볼 내용이 없습니다.</p>
          )}
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'내용을 입력하세요.\n\n**굵게**, *기울임*, `코드`, - 목록, > 인용, ``` 코드블록을 쓸 수 있습니다.'}
          className="min-h-40 flex-1 resize-none font-mono text-xs"
          maxLength={20000}
        />
      )}
    </div>
  );
}

/**
 * 빌더 캔버스/팔레트용 정적 미리보기.
 *
 * 편집 중에는 실제 API를 부르지 않는다 — 캔버스에 여러 개를 올려두면 편집할 때마다 목록 조회가
 * 무더기로 나가기 때문이다(실시간 채팅 컴포넌트와 같은 방침).
 */
export function BoardPreview({ title, rows = 4 }: { title: string; rows?: number }) {
  const sample = ['공지 · 사용 안내', '자주 묻는 질문', '작업 표준 변경 안내', '설비 점검 일정'];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <span className="rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground">글쓰기</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2 font-medium">번호</th>
              <th className="px-2 py-2 font-medium">제목</th>
              <th className="w-20 px-2 py-2 font-medium">작성자</th>
              <th className="w-16 px-3 py-2 text-right font-medium">조회</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className={cn('border-t', i % 2 === 1 && 'bg-muted/20')}>
                <td className="px-3 py-2 text-muted-foreground">{rows - i}</td>
                <td className="px-2 py-2">{sample[i % sample.length]}</td>
                <td className="px-2 py-2 text-muted-foreground">관리자</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{12 + i * 7}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        배치하면 목록 · 조회 · 글쓰기가 바로 동작합니다(별도 DB 설계 불필요).
      </p>
    </div>
  );
}
