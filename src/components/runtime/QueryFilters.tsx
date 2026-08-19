'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 주소에 남는 검색·선택 필터.
 *
 * 왜 표 안의 검색이 아니라 주소인가: 표의 검색칸은 **이미 받아 온 한 페이지 안에서만** 찾는다.
 * 5,000건 중 30건을 받아 놓고 검색하면 나머지 4,970건은 처음부터 대상이 아니다 — 찾는 사람은
 * "없다"고 읽는다. 주소에 적으면 서버가 전체를 대상으로 다시 조회하고, 같은 조건이 그 페이지의
 * 지표·차트에도 함께 걸린다(청사진의 툴바가 하려던 일이 바로 이것이다).
 */

function useQueryParam(param: string) {
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

  return { current, go, pending };
}

export function SearchFilter({ label, placeholder, param }: { label: string; placeholder: string; param: string }) {
  const { current, go, pending } = useQueryParam(param);
  const [text, setText] = useState(current);

  // 뒤로 가기나 다른 필터 조작으로 주소가 바뀌면 입력칸도 따라간다.
  useEffect(() => setText(current), [current]);

  // 글자마다 서버를 다시 부르면 다섯 글자에 다섯 번 조회한다 — 잠깐 멈출 때만 보낸다.
  useEffect(() => {
    if (text === current) return;
    const timer = setTimeout(() => go(text.trim()), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={`search-${param}`}>
        {label}
      </label>
      <div className={cn('relative', pending && 'opacity-70')}>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id={`search-${param}`}
          type="search"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(text.trim());
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

export function SearchFilterPreview({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <span className="flex h-9 w-full items-center rounded-md border border-input pr-3 pl-8 text-sm text-muted-foreground">
          {placeholder}
        </span>
      </div>
    </div>
  );
}

export function SelectFilter({
  label,
  param,
  allLabel,
  options,
}: {
  label: string;
  param: string;
  allLabel: string;
  options: string[];
}) {
  const { current, go, pending } = useQueryParam(param);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={`select-${param}`}>
        {label}
      </label>
      <select
        id={`select-${param}`}
        value={current}
        onChange={(e) => go(e.target.value)}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          pending && 'opacity-70'
        )}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SelectFilterPreview({ label, allLabel, options }: { label: string; allLabel: string; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex h-9 w-full items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
        {options[0] ?? allLabel}
      </span>
    </div>
  );
}
