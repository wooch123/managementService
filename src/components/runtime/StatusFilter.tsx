'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type StatusFilterOption = { label: string; value: string };

/**
 * 상태 세그먼트 필터 — 고른 값을 주소에 적어 페이지의 바인딩을 좁힌다.
 *
 * 기간 필터(`date-range-filter`)와 완전히 같은 방식이고, 다른 점은 값이 날짜가 아니라 **분류 값**
 * 이라는 것뿐이다. 청사진의 여러 화면이 목록 위에 "전체 / 미배정 / 분석중 / 완료" 같은 한 줄
 * 세그먼트를 둔다(REVIEW.md Claim 분석·의뢰 허브). 필터가 표 안의 클라이언트 검색이 아니라
 * 주소에 남아야 KPI·차트까지 같은 조건으로 함께 좁혀진다.
 *
 * 빈 값('')은 "전체"다 — 주소에서 파라미터를 지워 조건 자체를 걸지 않는다(빈 문자열을 그대로
 * 바인딩하면 아무 행도 맞지 않아 빈 화면이 된다, SYSTEM.md §4.6).
 */
export function StatusFilter({
  title,
  param,
  options,
}: {
  title: string;
  param: string;
  options: StatusFilterOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = searchParams.get(param) ?? '';

  function go(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === '') next.delete(param);
    else next.set(param, value);
    const query = next.toString();
    startTransition(() =>
      router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname, { scroll: false })
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {title && <span className="text-sm font-medium text-muted-foreground">{title}</span>}
      {/* 좁은 폭에서 한 덩어리가 칸을 넘지 않도록 접히게 둔다(320px에서 실측된 문제). */}
      <div
        className={cn(
          'flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5',
          pending && 'opacity-60'
        )}
        role="group"
        aria-label={title || '상태 필터'}
      >
        {options.map((option) => {
          const active = option.value === current;
          return (
            <button
              key={option.value || '__all__'}
              type="button"
              aria-pressed={active}
              onClick={() => go(option.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 빌더 캔버스/팔레트 미리보기 — 주소를 바꿀 수 없는 자리에서는 첫 항목이 켜진 모양만 보여준다. */
export function StatusFilterPreview({ title, options }: { title: string; options: StatusFilterOption[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {title && <span className="text-sm font-medium text-muted-foreground">{title}</span>}
      <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {options.map((option, index) => (
          <span
            key={option.value || `preview-${index}`}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap',
              index === 0 ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
            )}
          >
            {option.label}
          </span>
        ))}
      </div>
    </div>
  );
}
