'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIOD_PRESETS, isIsoDate, periodSearchString, type PeriodPresetKey, type PeriodRange } from '@/lib/period';

/**
 * 기간 필터 — 화면 전체의 조회 기간을 정한다.
 *
 * 고른 기간은 주소(`?preset=3m` 또는 `?from=&to=`)에 남고, 서버가 그 주소를 읽어 페이지의 모든
 * 바인딩을 그 기간으로 좁혀 다시 조회한다. 그래서 이 컴포넌트는 스스로 데이터를 거르지 않는다 —
 * 주소만 바꾸고, 나머지는 서버 렌더가 한다. 기간이 주소에 있으니 링크를 그대로 공유해도 같은
 * 화면이 열린다.
 *
 * 지금 적용된 기간(`resolved`)은 **서버가 계산해서 내려준다**. 클라이언트가 다시 계산하면
 * 서버와 시계가 어긋나는 순간(자정 근처) 하이드레이션이 어긋나므로 여기서는 계산하지 않는다.
 */
export function PeriodFilter({
  title,
  resolved,
  showPresets,
  showCustom,
}: {
  title: string;
  resolved: PeriodRange | null;
  showPresets: boolean;
  showCustom: boolean;
}) {
  // 주소가 바뀌면(=기간이 바뀌면) 입력칸도 새 기간으로 다시 시작해야 한다.
  return (
    <PeriodFilterBar
      key={`${resolved?.preset}|${resolved?.from}|${resolved?.to}`}
      title={title}
      resolved={resolved}
      showPresets={showPresets}
      showCustom={showCustom}
    />
  );
}

function PeriodFilterBar({
  title,
  resolved,
  showPresets,
  showCustom,
}: {
  title: string;
  resolved: PeriodRange | null;
  showPresets: boolean;
  showCustom: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(resolved?.from ?? '');
  const [to, setTo] = useState(resolved?.to ?? '');

  function go(next: { preset: PeriodPresetKey } | { from: string; to: string }) {
    // 클릭 시점에 주소를 읽는다 — 렌더 중에 읽지 않으므로 서버 렌더와 어긋날 일이 없고,
    // 기간 외의 다른 파라미터(예: 페이지 번호)는 그대로 둔다.
    const base = new URLSearchParams(window.location.search);
    const query = periodSearchString(base, next);
    startTransition(() => router.push(`${window.location.pathname}?${query}`, { scroll: false }));
  }

  /**
   * 날짜를 고르는 즉시 반영한다. 두 칸이 모두 올바른 날짜일 때만 움직이고, 한쪽만 바꾸는 도중에는
   * 기다린다 — 시작일을 바꾸는 순간 종료일이 아직 옛 값이어도 곧바로 조회가 나가면 화면이 두 번 튄다.
   */
  const applyCustom = useCallback(
    (nextFrom: string, nextTo: string) => {
      setFrom(nextFrom);
      setTo(nextTo);
      if (!isIsoDate(nextFrom) || !isIsoDate(nextTo)) return;
      if (nextFrom === resolved?.from && nextTo === resolved?.to) return;
      go({ from: nextFrom, to: nextTo });
    },
    // go는 렌더마다 새로 만들어지지만 하는 일이 같아(주소 이동) 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved?.from, resolved?.to]
  );

  const activePreset = resolved?.preset ?? null;

  return (
    // 폭이 좁아지면 줄바꿈으로 흘러내린다. 바깥 칸(runtime-cell)이 내용만큼 늘어나므로
    // 줄이 늘어도 아래 컴포넌트를 덮지 않는다(globals.css의 좁은 폭 규칙).
    <div className="flex h-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
        <CalendarRange className="size-4 text-muted-foreground" />
        {title}
      </div>

      {/* 프리셋은 **한 덩어리(세그먼트)** 로 묶는다 — 낱개 버튼 다섯 개가 날짜 입력·적용과 나란히
          늘어서 있으면 컨트롤이 여덟 개처럼 보인다(디자인 리뷰 ⑩). */}
      {showPresets && (
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={activePreset === 'custom' ? '' : (activePreset ?? '')}
          onValueChange={(v) => v && go({ preset: v as PeriodPresetKey })}
          disabled={pending}
          aria-label="조회 기간 프리셋"
        >
          {PERIOD_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.key} value={preset.key} className="px-2.5">
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {/* 한 줄에 다 들어가는 넓이에서만 구분선을 둔다 — 줄바꿈이 일어나면 선만 덩그러니 남는다. */}
      {showPresets && showCustom && <Separator orientation="vertical" className="hidden h-6 lg:block" />}

      {showCustom && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* 폭이 모자라면 날짜 칸이 먼저 줄어들되(min-w) 읽을 수 있는 선은 지킨다.
              날짜를 고르면 **바로 반영**한다 — 따로 누를 '적용'이 없어 컨트롤이 하나 줄어든다. */}
          <Input
            type="date"
            aria-label="시작일"
            className="h-8 w-[148px] min-w-[130px] flex-1"
            value={from}
            max={to || undefined}
            onChange={(e) => applyCustom(e.target.value, to)}
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            aria-label="종료일"
            className="h-8 w-[148px] min-w-[130px] flex-1"
            value={to}
            min={from || undefined}
            onChange={(e) => applyCustom(from, e.target.value)}
          />
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

/**
 * 빌더 캔버스·팔레트용 정적 미리보기. 실제로 주소를 바꾸면 편집 중인 관리자 화면이 이동해버리므로
 * 캔버스에서는 모양만 보여준다(게시판·실시간 채팅과 같은 처리).
 */
export function PeriodFilterPreview({ title, defaultPreset }: { title: string; defaultPreset: PeriodPresetKey }) {
  return (
    <div className="flex h-full flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarRange className="size-4 text-muted-foreground" />
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {PERIOD_PRESETS.map((preset) => (
          <Button key={preset.key} size="sm" variant={preset.key === defaultPreset ? 'default' : 'outline'} type="button">
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="ml-auto text-xs text-muted-foreground">
        기본값 {PERIOD_PRESETS.find((p) => p.key === defaultPreset)?.label ?? defaultPreset}
      </div>
    </div>
  );
}
