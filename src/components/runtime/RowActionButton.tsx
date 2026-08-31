'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * 표의 마지막 칸에 붙는 **줄 단추** — 그 줄의 값을 주소에 실어 다른 화면으로 보낸다.
 *
 * 행 전체를 누르게 하는 길(`selectSlug`)이 이미 있는데 단추를 따로 두는 이유가 있다(사용자 지정,
 * 2026-08-31). 행 클릭은 **그 화면 안에서 고르는 동작**과 같은 몸짓이라, 같은 표에서 둘을 함께
 * 쓰면 "고르려고 눌렀는데 화면이 넘어가는" 일이 생긴다. 넘어가는 것은 눈에 보이는 단추로,
 * 고르는 것은 행으로 갈라 둔다.
 *
 * 누른 줄이 무엇이었는지는 주소에 남으므로, 넘어간 화면은 그 값을 읽어 스스로 채우면 된다
 * (Tech Report 작성이 `far_no`를 읽어 그 FAR을 불러오는 것이 이 자리의 본보기다).
 */
export function RowActionButton({
  label,
  slug,
  param,
  value,
}: {
  label: string;
  slug: string;
  param: string;
  /** 주소에 실을 값(대개 FAR No 같은 업무 키). 비어 있으면 단추를 내지 않는다. */
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 값이 없는 줄에 단추를 두면 눌렀을 때 빈 주소로 넘어간다 — 그 줄은 비워 둔다.
  if (value === '') return <span className="block text-center text-muted-foreground">—</span>;

  return (
    <span className="flex justify-center">
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap hover:bg-muted/60 disabled:opacity-60"
        disabled={pending}
        // 행 클릭(고르기)까지 함께 일어나지 않게 막는다 — 단추는 단추의 일만 한다.
        onClick={(e) => {
          e.stopPropagation();
          startTransition(() => router.push(`/home/${slug}?${param}=${encodeURIComponent(value)}`));
        }}
        title={`${value} · ${label}`}
      >
        {pending && <Loader2 className="size-3 animate-spin" />}
        {label}
      </button>
    </span>
  );
}
