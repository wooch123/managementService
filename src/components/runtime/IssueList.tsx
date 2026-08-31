'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 주요 Issue — **하위 화면 목록과 바로가기**, 그리고 제목만 받아 새로 만드는 자리(사용자 지정).
 *
 * 하위 '화면'을 진짜 Page로 만들지 않는 이유가 하나 있다. 구성 적용(apply-site)은 배포 때마다
 * 화면을 전부 지우고 다시 만든다 — 런타임에 만든 Page는 다음 배포에 사라진다. 그래서 Issue는
 * **줄**로 남기고, 그 줄의 id를 주소에 실어(`/home/issue-detail?issue=…`) 같은 화면을 연다.
 * 쓰는 사람 눈에는 하위 화면이 하나씩 생기는 것과 같고, 배포와 무관하게 남으며 링크로 나눌 수도
 * 있다. 사이드바가 이슈 수만큼 길어지지도 않는다.
 */

type IssueItem = { id: string; title: string; note: string; created_on: string };

function toItems(data: unknown): IssueItem[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      title: String(row.title ?? ''),
      note: String(row.note ?? ''),
      created_on: String(row.created_on ?? ''),
    };
  });
}

/** 만든 날짜만 — 이슈 목록에서 시각까지는 필요 없다. */
function dayOf(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : iso.slice(0, 10);
}

export function IssueList({
  title,
  description,
  detailSlug,
  data,
  onSubmit,
}: {
  title: string;
  description: string;
  /** 하위 화면의 주소 — 이슈 id를 `?issue=`로 실어 보낸다. */
  detailSlug: string;
  data?: unknown;
  onSubmit?: (row: Record<string, unknown>) => Promise<boolean>;
}) {
  const items = useMemo(() => toItems(data), [data]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    const value = draft.trim();
    if (value === '') {
      toast.error('제목을 적어 주세요.');
      return;
    }
    setSaving(true);
    const ok = await onSubmit?.({ title: value, note: '' });
    setSaving(false);
    if (ok) {
      toast.success(`'${value}' 화면을 만들었습니다.`);
      setDraft('');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-w-0">
        {title && <h3 className="chart-title">{title}</h3>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {/* 만들기 — 제목 하나만 받는다. 나머지는 만들어진 화면 안에서 적는다. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="새 Issue 제목 (예: 25W34 Read Fail 급증)"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void create();
            }
          }}
          aria-label="새 Issue 제목"
        />
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={() => void create()}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Issue 만들기
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
            <TriangleAlert className="size-5" />
            아직 만든 Issue가 없습니다. 위에 제목을 적고 만들어 보세요.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.id}>
                {/* 줄 전체가 링크다 — 목록에서 하는 일이 '들어가기' 하나뿐이라 누를 자리를 좁힐 이유가 없다. */}
                <Link
                  href={`/home/${detailSlug}?issue=${encodeURIComponent(item.id)}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
                    'hover:border-primary/40 hover:bg-accent/40'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  {item.created_on && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayOf(item.created_on)}</span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기. */
export function IssueListPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <span className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        <Plus className="size-4" /> Issue 만들기
      </span>
      <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">25W34 Read Fail 급증</div>
    </div>
  );
}
