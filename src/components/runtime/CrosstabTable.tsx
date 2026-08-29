'use client';

import { useMemo } from 'react';
import { toMatrixSeries } from '@/lib/chart-series';
import { cn } from '@/lib/utils';

/**
 * 교차 집계 표 — 세로에 기간, 가로에 사람(또는 다른 분류)을 놓고 칸마다 건수를 적는다.
 *
 * 같은 값을 히트맵(`stat-crosstab`)으로도 그릴 수 있지만, 여기서 보려는 것은 **정확한 숫자**다.
 * "이번 달 누가 몇 건을 맡았나"는 색의 짙기로 읽는 값이 아니라 세어 보는 값이라, 표로 둔다.
 *
 * 맨 아래 줄은 **누적**이다(사용자 지정) — 위에서부터 그 줄까지를 더한 값이 아니라, 조회한
 * 기간 전체를 사람마다 합한 수다. 달마다 몇 건인지와 기간 전체로 몇 건인지는 서로 다른 질문이고,
 * 표를 눈으로 더하게 두면 그 답을 매번 손으로 구해야 한다.
 */
export function CrosstabTable({
  title,
  description,
  rowLabel,
  data,
  maxColumns,
}: {
  title: string;
  description: string;
  /** 왼쪽 위 모서리에 적을 세로축 이름 — 무엇으로 나눈 줄인지 밝힌다. */
  rowLabel: string;
  data: unknown;
  maxColumns: number;
}) {
  const matrix = useMemo(() => toMatrixSeries(data, maxColumns), [data, maxColumns]);

  /** 사람마다의 기간 합계 — 맨 아랫줄에 놓는다. */
  const columnTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cells of matrix.values.values()) {
      for (const [key, v] of cells) totals.set(key, (totals.get(key) ?? 0) + v);
    }
    return totals;
  }, [matrix]);
  const grandTotal = [...columnTotals.values()].reduce((s, v) => s + v, 0);

  const empty = matrix.labels.length === 0 || matrix.seriesKeys.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {(title || description) && (
        <div className="shrink-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

      {empty ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          표시할 데이터가 없습니다
        </div>
      ) : (
        // 사람이 늘면 가로로만 움직인다 — 화면 전체가 밀리지 않는다.
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r bg-muted px-2 py-1.5 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                  {rowLabel}
                </th>
                {matrix.seriesKeys.map((key) => (
                  <th
                    key={key}
                    className="border-b px-2 py-1.5 text-right text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase"
                  >
                    {key}
                  </th>
                ))}
                <th className="border-b border-l bg-muted px-2 py-1.5 text-right text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                  합계
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.labels.map((label) => (
                <tr key={label} className="hover:bg-muted/30">
                  <th className="sticky left-0 z-10 border-b border-r bg-card px-2 py-1 text-left text-xs font-medium whitespace-nowrap">
                    {label}
                  </th>
                  {matrix.seriesKeys.map((key) => {
                    const v = matrix.values.get(label)?.get(key) ?? 0;
                    return (
                      <td
                        key={key}
                        // 0은 물려 둔다 — 숫자가 있는 칸이 먼저 눈에 들어와야 한다.
                        className={cn('border-b px-2 py-1 text-right text-sm tabular-nums', v === 0 && 'text-muted-foreground/50')}
                      >
                        {v === 0 ? '·' : v.toLocaleString('ko-KR')}
                      </td>
                    );
                  })}
                  <td className="border-b border-l bg-muted/30 px-2 py-1 text-right text-sm font-medium tabular-nums">
                    {(matrix.totals.get(label) ?? 0).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted">
              <tr>
                <th className="sticky left-0 z-10 border-t border-r bg-muted px-2 py-1.5 text-left text-xs font-semibold whitespace-nowrap">
                  누적
                </th>
                {matrix.seriesKeys.map((key) => (
                  <td key={key} className="border-t px-2 py-1.5 text-right text-sm font-semibold tabular-nums">
                    {(columnTotals.get(key) ?? 0).toLocaleString('ko-KR')}
                  </td>
                ))}
                <td className="border-t border-l px-2 py-1.5 text-right text-sm font-bold tabular-nums">
                  {grandTotal.toLocaleString('ko-KR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트에서 보여 줄 모양(값을 다루지 않는다). */
export function CrosstabTablePreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-4 gap-px bg-border text-[11px]">
          {['기간', '담당 A', '담당 B', '합계'].map((h) => (
            <div key={h} className="bg-muted px-2 py-1 font-semibold text-muted-foreground">
              {h}
            </div>
          ))}
          {['2026-07', '12', '9', '21', '2026-08', '8', '14', '22', '누적', '20', '23', '43'].map((v, i) => (
            <div key={i} className={cn('bg-card px-2 py-1 tabular-nums', i >= 8 && 'bg-muted font-semibold')}>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
