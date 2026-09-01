'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { TatSummary } from '@/lib/stats/tat';
import type { ApiResult } from '@/types/auth';

/**
 * TAT 분포 — 가로축 걸린 일수, 세로축 FAR 건수(사용자 지정, 2026-09-01).
 *
 * 기준(기본 14일)을 **넘는** 칸은 색을 달리해 초과건으로 보인다. 담당자별로 묶어 보던 예전
 * 차트와 달리, 여기서는 '얼마나 걸리고 있는가' 자체가 가로축이라 분포의 모양이 그대로 보인다.
 */

const chartConfig = {
  count: { label: 'FAR', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const OVER_COLOR = 'var(--destructive)';
const WITHIN_COLOR = 'var(--chart-1)';

function num(n: number): string {
  return n.toLocaleString('ko-KR');
}

function Tile({ label, value, unit, hint, tone }: { label: string; value: string; unit: string; hint?: string; tone?: 'over' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${tone === 'over' ? 'text-destructive' : ''}`}>
        {value}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

type TooltipPayload = { payload?: TatSummary['buckets'][number] }[];

/** 칸 하나를 가리켰을 때 — 며칠짜리인지, 몇 건인지, 초과인지. */
function TatTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const bucket = active ? payload?.[0]?.payload : undefined;
  if (!bucket) return null;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">
        {bucket.overflow ? `${bucket.label}일 (그 이상 전부)` : `${bucket.label}일`}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-[2px]"
          style={{ background: bucket.over ? OVER_COLOR : WITHIN_COLOR }}
        />
        <span className="tabular-nums">{num(bucket.count)}건</span>
        {bucket.over && <span className="text-destructive">초과</span>}
      </div>
    </div>
  );
}

export function TatHistogram({
  title,
  description,
  threshold,
  maxDays,
}: {
  title: string;
  description: string;
  threshold: number;
  maxDays: number;
}) {
  const [data, setData] = useState<TatSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetch(`/api/stats/tat?threshold=${threshold}&maxDays=${maxDays}`)
      .then((r) => r.json() as Promise<ApiResult<TatSummary>>)
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          setData(result.data);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, [threshold, maxDays]);

  const header = (title || description) && (
    <div className="shrink-0">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  if (state !== 'ready' || !data) {
    return (
      <div className="flex h-full flex-col gap-2">
        {header}
        <p className="text-sm text-muted-foreground">
          {state === 'error' ? 'TAT를 불러오지 못했습니다.' : 'TAT를 계산하는 중…'}
        </p>
      </div>
    );
  }

  const overRate = data.total > 0 ? (data.over / data.total) * 100 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {header}

      <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="전체" value={num(data.total)} unit="건" hint={`완료 ${num(data.done)} · 진행 중 ${num(data.running)}`} />
        <Tile label={`${data.threshold}일 이내`} value={num(data.within)} unit="건" hint={`${(100 - overRate).toFixed(1)}%`} />
        <Tile
          label={`${data.threshold}일 초과`}
          value={num(data.over)}
          unit="건"
          hint={`${overRate.toFixed(1)}%`}
          tone="over"
        />
        <Tile
          label="완료 건 중앙값"
          value={data.medianDone === null ? '—' : String(data.medianDone)}
          unit={data.medianDone === null ? '' : '일'}
          hint={data.medianDone === null ? '완료된 건이 없습니다' : '끝난 건만 셈'}
        />
      </div>

      <div className="flex min-h-[220px] flex-1 flex-col gap-1">
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: WITHIN_COLOR }} />
            {data.threshold}일 이내
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: OVER_COLOR }} />
            초과건
          </span>
        </span>

        <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[200px] w-full">
          {/* 위쪽 여백은 기준선 라벨('14일')이 들어갈 자리다. 8이면 라벨이 그림 밖으로 잘린다. */}
          <BarChart data={data.buckets} margin={{ left: 4, right: 8, top: 20, bottom: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              minTickGap={4}
              label={{ value: 'TAT (일)', position: 'insideBottomRight', offset: -2, fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<TatTooltip />} />
            {/*
              기준선은 '초과가 시작되는 자리'에 세운다. 칸 하나가 하루라서 threshold 칸과
              threshold+1 칸 **사이**가 경계인데, recharts는 칸 가운데에 선을 그으므로
              경계 왼쪽 칸(threshold)에 세우고 선 자체를 칸 오른쪽 끝으로 읽게 둔다.
            */}
            {data.threshold <= data.maxDays && (
              <ReferenceLine
                x={String(data.threshold)}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: `${data.threshold}일`, position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
            )}
            <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.buckets.map((bucket) => (
                <Cell key={bucket.days} fill={bucket.over ? OVER_COLOR : WITHIN_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {data.skipped > 0 && (
        <p className="shrink-0 rounded-r-md border-l-[3px] border-destructive bg-destructive/10 px-3 py-1.5 text-xs">
          접수일이나 완료 시각을 읽지 못해 {num(data.skipped)}건은 세지 않았습니다.
        </p>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기 — 편집 중에 집계가 무더기로 나가지 않게 한다. */
export function TatHistogramPreview({ title }: { title: string }) {
  const sample = [3, 8, 14, 22, 26, 19, 12, 7, 5, 9];
  const overFrom = 5;
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="flex flex-1 items-end gap-1">
        {sample.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{
              height: `${(v / 26) * 100}%`,
              background: i >= overFrom ? OVER_COLOR : WITHIN_COLOR,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">가로축 TAT(일) · 세로축 FAR 건수 · 기준 초과는 다른 색</p>
    </div>
  );
}
