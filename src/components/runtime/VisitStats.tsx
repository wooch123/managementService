'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { VisitSummary } from '@/lib/stats/visits';
import type { ApiResult } from '@/types/auth';

/**
 * 접속자 통계 — 일간 접속자 추이와 화면별 이용률.
 *
 * 조회는 전용 API 하나(`/api/stats/summary`)만 부른다. 설계에 바인딩을 물리지 않아도 배치하는
 * 즉시 동작한다(게시판·불량률 계산기와 같은 성격).
 *
 * '접속자'와 '조회수'를 나란히 둔다 — 한쪽만으로는 읽히지 않기 때문이다. 조회수만 보면 한 사람이
 * 새로고침을 많이 한 날이 성수기처럼 보이고, 접속자만 보면 얼마나 깊이 썼는지 알 수 없다.
 */

const chartConfig = {
  visitors: { label: '접속자', color: 'var(--chart-1)' },
  views: { label: '조회수', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function num(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** '2026-08-28' → '8/28' — 축에 연도까지 쓰면 30일치가 서로 겹친다. */
function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function Tile({ label, value, unit, hint }: { label: string; value: string; unit: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function VisitStats({ title, description, days }: { title: string; description: string; days: number }) {
  const [data, setData] = useState<VisitSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetch(`/api/stats/summary?days=${days}`)
      .then((r) => r.json() as Promise<ApiResult<VisitSummary>>)
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
  }, [days]);

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
          {state === 'error' ? '통계를 불러오지 못했습니다.' : '통계를 불러오는 중…'}
        </p>
      </div>
    );
  }

  const series = data.daily.map((p) => ({ ...p, label: shortDay(p.day) }));
  const busiest = data.daily.reduce((a, b) => (b.visitors > a.visitors ? b : a), data.daily[0]);
  const avgVisitors = data.daily.length > 0 ? data.daily.reduce((s, p) => s + p.visitors, 0) / data.daily.length : 0;
  const empty = data.total.views === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {header}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="오늘 접속자" value={num(data.today.visitors)} unit="명" hint={`조회 ${num(data.today.views)}회`} />
        <Tile label={`최근 ${data.days}일 접속자`} value={num(data.total.visitors)} unit="명" hint={`${data.from} ~ ${data.to}`} />
        <Tile label={`최근 ${data.days}일 조회수`} value={num(data.total.views)} unit="회" hint={`일평균 접속자 ${avgVisitors.toFixed(1)}명`} />
        <Tile
          label="가장 붐빈 날"
          value={busiest && busiest.visitors > 0 ? shortDay(busiest.day) : '—'}
          unit=""
          hint={busiest && busiest.visitors > 0 ? `${num(busiest.visitors)}명 · 조회 ${num(busiest.views)}회` : '아직 기록이 없습니다'}
        />
      </div>

      {empty ? (
        <p className="rounded-r-md border-l-[3px] border-primary bg-primary/10 px-3 py-2 text-sm">
          아직 기록된 방문이 없습니다. 운영 화면을 열면 그때부터 쌓입니다 — 화면을 연 순간 한 건씩
          기록되고, 같은 화면 안에서 목록을 눌러 보는 것은 새 방문으로 세지 않습니다.
        </p>
      ) : (
        <>
          <div className="flex min-h-[200px] flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">일간 접속자 추이</span>
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="visitors"
                  type="monotone"
                  fill="var(--color-visitors)"
                  fillOpacity={0.2}
                  stroke="var(--color-visitors)"
                  strokeWidth={2}
                />
                <Line dataKey="views" type="monotone" stroke="var(--color-views)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ChartContainer>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">화면별 이용률</span>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="pb-1 pr-3 text-left font-medium">
                      화면
                    </th>
                    <th scope="col" className="pb-1 pr-3 text-right font-medium">
                      조회수
                    </th>
                    <th scope="col" className="pb-1 pr-3 text-right font-medium">
                      접속자
                    </th>
                    <th scope="col" className="w-[38%] pb-1 text-left font-medium">
                      이용률
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((page) => (
                    <tr key={page.slug} className="border-t">
                      <th scope="row" className="max-w-[220px] truncate py-2 pr-3 text-left font-normal">
                        {page.title}
                        <span className="ml-1.5 text-xs text-muted-foreground">/{page.slug}</span>
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">{num(page.views)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{num(page.visitors)}</td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-[var(--chart-1)]"
                              style={{ width: `${Math.max(2, page.share * 100).toFixed(1)}%` }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {(page.share * 100).toFixed(1)}%
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기 — 편집 중에 통계 조회가 무더기로 나가지 않게 한다. */
export function VisitStatsPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="오늘 접속자" value="12" unit="명" />
        <Tile label="최근 30일 접속자" value="184" unit="명" />
        <Tile label="최근 30일 조회수" value="1,204" unit="회" />
      </div>
      <p className="text-xs text-muted-foreground">운영 화면에서 실제 방문 기록을 집계해 보여줍니다.</p>
    </div>
  );
}
