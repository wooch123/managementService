'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * 목록의 한 줄·카드·지표를 **누를 수 있게** 만든다.
 *
 * 청사진에서 목록은 읽을거리가 아니라 조치의 입구다 — "지연 우선 대응"의 한 줄은 그 Claim으로,
 * 지표 타일은 그 조건으로 좁힌 목록으로 이어진다. 눌러도 아무 일이 없으면 사용자는 그 다음
 * 행동을 화면 어디서 해야 하는지 다시 찾아야 한다.
 *
 * 두 가지로 움직인다.
 *   · `slug`가 있으면 **다른 화면**으로 간다(`/home/{slug}?param=value`).
 *   · 없으면 **지금 화면**에서 파라미터만 바꾼다 — 이때 기간·검색처럼 이미 걸어 둔 다른 조건은
 *     그대로 둔다. Link로 주소를 통째로 갈아끼우면 그것들이 조용히 사라진다.
 */
export function SelectLink({
  slug,
  param,
  value,
  className,
  activeClassName,
  children,
}: {
  slug?: string;
  param: string;
  value: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const active = !slug && (searchParams.get(param) ?? '') === value;

  function go() {
    if (slug) {
      const query = value === '' ? '' : `?${param}=${encodeURIComponent(value)}`;
      startTransition(() => router.push(`/home/${slug}${query}`));
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    // 같은 값을 다시 누르면 조건을 푼다 — 한 번 고른 뒤 전체로 돌아갈 방법이 있어야 한다.
    if (value === '' || next.get(param) === value) next.delete(param);
    else next.set(param, value);
    const query = next.toString();
    startTransition(() =>
      router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname, { scroll: false })
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      // 목록 한 줄을 통째로 누를 수 있게 하되, 글자 정렬은 원래대로 둔다.
      className={cn('w-full cursor-pointer text-left', pending && 'opacity-70', className, active && activeClassName)}
    >
      {children}
    </button>
  );
}
