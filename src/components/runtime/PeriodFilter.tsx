'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
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

  const customReady = isIsoDate(from) && isIsoDate(to);
  const activePreset = resolved?.preset ?? null;

  return (
    <div className="flex h-full flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarRange className="size-4 text-muted-foreground" />
        {title}
      </div>

      {showPresets && (
        <div className="flex flex-wrap items-center gap-1">
          {PERIOD_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="sm"
              variant={activePreset === preset.key ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => go({ preset: preset.key })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {showPresets && showCustom && <Separator orientation="vertical" className="hidden h-6 sm:block" />}

      {showCustom && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            type="date"
            aria-label="시작일"
            className="h-8 w-[150px]"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            aria-label="종료일"
            className="h-8 w-[150px]"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            size="sm"
            variant={activePreset === 'custom' ? 'default' : 'secondary'}
            disabled={!customReady || pending}
            onClick={() => go({ from, to })}
          >
            적용
          </Button>
        </div>
      )}

      <div className={cn('ml-auto text-xs text-muted-foreground tabular-nums', pending && 'opacity-50')}>
        {resolved ? (resolved.from || resolved.to ? `${resolved.from ?? '처음'} ~ ${resolved.to ?? '오늘'}` : '전체 기간') : null}
      </div>
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
