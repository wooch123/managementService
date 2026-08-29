'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiResult } from '@/types/auth';

/**
 * Reball 작업 항목 선택 + 단가 자동 계산.
 *
 * 왜 입력 하나짜리 컴포넌트가 아니라 이 덩어리인가: 시료 하나당 가격은 **여러 칸이 함께 정해지는
 * 값**이다(어떤 작업을 하는지 · 볼 수가 200개를 넘는지 · 긴급인지 · 몇 개인지). 런타임에서 각
 * 입력은 자기 값만 알기 때문에, 이 계산을 일반 폼으로는 표현할 수 없다. 그래서 계산에 필요한
 * 칸들을 한 컴포넌트가 함께 들고 **하나의 값(객체)** 으로 내놓는다. 저장은 평소와 똑같이 액션이
 * 한다 — 액션의 값 소스가 이 노드의 객체에서 키 하나씩 집어 간다(`from: 'component' + path`).
 *
 * 단가표는 이 노드의 **바인딩**(list, 한 줄)으로 읽는다. 값이 바뀔 수 있어 화면에서 고칠 수 있어야
 * 한다는 요구가 있어(설계 문서 [Reball_Cost_Table]) '단가 수정'을 함께 둔다.
 */

export type CostRow = Record<string, number>;

/** 계산에 쓰는 단가표의 칼럼 이름 — 설계 문서의 [Reball_Cost_Table]과 같다. */
const COST_COLUMNS = ['upper_200ball', 'under_200ball', 'component_detach', 'underfill', 'grinding', 'urgent'] as const;
type CostColumn = (typeof COST_COLUMNS)[number];

const COST_LABELS: Record<CostColumn, string> = {
  upper_200ball: '200ball 이상',
  under_200ball: '200ball 미만',
  component_detach: 'Component detach',
  underfill: 'Underfill 제거',
  grinding: 'Grinding',
  urgent: '긴급',
};

/** 서버가 넘겨준 list 바인딩 결과에서 단가 한 줄을 꺼낸다(없으면 전부 0). */
export function toCostRow(data: unknown): CostRow {
  const empty = Object.fromEntries(COST_COLUMNS.map((c) => [c, 0])) as CostRow;
  if (!data || typeof data !== 'object') return empty;
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return empty;
  const row = rows[0] as Record<string, unknown>;
  for (const column of COST_COLUMNS) {
    const value = Number(row[column]);
    empty[column] = Number.isFinite(value) ? value : 0;
  }
  return empty;
}

export type ReballWorkValue = {
  is_reball: boolean;
  is_component_detach: boolean;
  is_underfill: boolean;
  is_grinding: boolean;
  urgent: boolean;
  /**
   * 볼이 200개 이상인가 — 단가표의 `200ball 이상/미만`을 가르는 값.
   *
   * 예전에는 볼 개수를 그대로 받아 여기서 200과 견줬는데, 가격에 쓰이는 것은 **넘느냐 아니냐**
   * 하나뿐이라 정확한 개수를 적는 일이 의뢰서마다 되풀이되는 부담이었다(사용자 지정).
   */
  over_200ball: boolean;
  count: number;
  per_cost: number;
  total_cost: number;
};

/** 단가표가 갈리는 기준 — 이 개수 **이상**이면 `upper_200ball`. 화면의 이름표에 쓴다. */
export const BALL_THRESHOLD = 200;

/** 고른 작업에 해당하는 단가를 더한다 — 시료 하나당 가격. */
export function perSampleCost(
  work: Omit<ReballWorkValue, 'count' | 'per_cost' | 'total_cost'>,
  cost: CostRow
): number {
  let sum = 0;
  if (work.is_reball) sum += work.over_200ball ? cost.upper_200ball : cost.under_200ball;
  if (work.is_component_detach) sum += cost.component_detach;
  if (work.is_underfill) sum += cost.underfill;
  if (work.is_grinding) sum += cost.grinding;
  if (work.urgent) sum += cost.urgent;
  return sum;
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors',
        checked ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function ReballCost({
  nodeId,
  title,
  description,
  cost,
  defaultOver200ball,
  collapsible = false,
  onValueChange,
}: {
  nodeId: string;
  title: string;
  description: string;
  cost: CostRow;
  defaultOver200ball: boolean;
  /** 제목을 눌러 접었다 펼 수 있게 한다. 켜면 **접힌 채로** 시작한다. */
  collapsible?: boolean;
  onValueChange: (value: ReballWorkValue) => void;
}) {
  const router = useRouter();
  const [isReball, setIsReball] = useState(true);
  const [detach, setDetach] = useState(false);
  const [underfill, setUnderfill] = useState(false);
  const [grinding, setGrinding] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const [overBall, setOverBall] = useState(defaultOver200ball);
  const [count, setCount] = useState(1);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CostRow>(cost);
  const [saving, setSaving] = useState(false);

  /**
   * 단가표는 **매 렌더마다 새 객체로** 만들어져 내려온다(카탈로그가 서버 데이터를 그때그때
   * 풀어 준다). 그대로 의존성에 넣으면 값이 하나도 안 바뀌어도 아래 useMemo가 매번 새 결과를
   * 만들고 → 부모에 알리고 → 다시 렌더되어 무한 갱신이 된다(실제로 그랬다).
   * 그래서 **내용**을 문자열로 눌러 비교하고, 계산에는 최신 객체를 ref로 꺼내 쓴다.
   */
  const costRef = useRef(cost);
  costRef.current = cost;
  const costKey = COST_COLUMNS.map((column) => Number(cost[column] ?? 0)).join('|');

  const value = useMemo<ReballWorkValue>(() => {
    const work = {
      is_reball: isReball,
      is_component_detach: detach,
      is_underfill: underfill,
      is_grinding: grinding,
      urgent,
      over_200ball: overBall,
    };
    const per = perSampleCost(work, costRef.current);
    return { ...work, count, per_cost: per, total_cost: per * count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReball, detach, underfill, grinding, urgent, overBall, count, costKey]);

  // 액션이 집어 갈 값은 부모(런타임)의 componentValues에 있다. 부모의 콜백은 렌더마다 새로
  // 만들어지므로 의존성에 넣지 않고 ref로 최신 것만 들고 있는다 — 넣으면 매 렌더마다 다시 돌아
  // 무한 갱신이 된다.
  const notify = useRef(onValueChange);
  notify.current = onValueChange;
  useEffect(() => {
    notify.current(value);
  }, [value]);

  async function saveCost() {
    setSaving(true);
    try {
      const res = await fetch('/api/runtime/cost-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, values: draft }),
      });
      const result = (await res.json()) as ApiResult<{ saved: number }>;
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success('단가표를 저장했습니다');
      setEditing(false);
      // 저장한 값으로 다시 계산되어야 한다 — 서버가 준 바인딩 데이터를 새로 받아 온다.
      router.refresh();
    } catch {
      toast.error('단가표를 저장하지 못했습니다');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {/*
        접었다 펴는 머리 — 단가는 **가끔 확인하고 더 가끔 고치는 것**이라 늘 펼쳐 두면
        정작 자주 쓰는 의뢰 표를 아래로 밀어낸다(사용자 지정, 2026-08-29). 기본은 접힘이다.
      */}
      {collapsible ? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-md text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <span className="min-w-0">
            {title && <span className="chart-title block">{title}</span>}
            {description && <span className="block text-xs text-muted-foreground">{description}</span>}
          </span>
        </button>
      ) : (
        (title || description) && (
          <div className="shrink-0">
            {title && <h3 className="chart-title">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )
      )}

      {!open ? null : (
      <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Check label="Reball" hint={`볼 재작업 · ${won(overBall ? cost.upper_200ball : cost.under_200ball)}`} checked={isReball} onChange={setIsReball} />
        <Check label="Component detach" hint={`부품 분리 · ${won(cost.component_detach)}`} checked={detach} onChange={setDetach} />
        <Check label="Underfill 제거" hint={`언더필 제거 · ${won(cost.underfill)}`} checked={underfill} onChange={setUnderfill} />
        <Check label="Grinding" hint={`연마 · ${won(cost.grinding)}`} checked={grinding} onChange={setGrinding} />
      </div>

      {/*
        세 칸의 이름·입력칸·설명이 각각 같은 줄에 놓이도록 부모의 줄을 그대로 물려받게 한다
        (subgrid). 예전에는 칸마다 제 높이대로 쌓아 두고 긴급 칸만 아래로 밀어 맞췄는데,
        Ball 수에만 설명 줄이 있어서 입력칸 높이가 서로 어긋났다 — 이름은 위에 나란한데
        입력칸은 한 칸만 내려와 있는 모양이었다.
      */}
      <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto]">
        {/*
          볼 개수는 체크 하나로 받는다(사용자 지정). 가격에 쓰이는 것은 200을 넘느냐 하나뿐인데,
          정확한 개수를 매번 세어 적는 일이 의뢰서마다 되풀이되는 부담이었다.
        */}
        <div className="grid min-w-0 content-start gap-1.5 sm:row-span-3 sm:grid-rows-subgrid">
          <span className="text-sm font-medium">Ball 수</span>
          <label
            className={cn(
              'flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors',
              overBall ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50'
            )}
          >
            <input type="checkbox" className="size-4 shrink-0 accent-[var(--primary)]" checked={overBall} onChange={(e) => setOverBall(e.target.checked)} />
            {BALL_THRESHOLD}ball 이상
          </label>
          {/* 어느 쪽 단가가 걸렸는지 그 자리에서 보여 준다 — 체크만 있으면 왜 이 가격인지 알 수 없다. */}
          <span className={cn('text-[11px]', overBall ? 'text-primary' : 'text-muted-foreground')}>
            {overBall ? `${BALL_THRESHOLD}ball 이상` : `${BALL_THRESHOLD}ball 미만`} 단가 ·{' '}
            {won(overBall ? cost.upper_200ball : cost.under_200ball)}
          </span>
        </div>
        {/*
          바깥은 label이 아니라 div다. 예전에는 이름표까지 통째로 label이라 '긴급 여부'라는
          글씨를 눌러도 체크가 토글됐다 — 누를 곳과 눌리는 것이 어긋나 있었다.
        */}
        <div className="grid min-w-0 content-start gap-1.5 sm:row-span-3 sm:grid-rows-subgrid">
          <span className="text-sm font-medium">긴급 여부</span>
          <label
            className={cn(
              'flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors',
              urgent ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'hover:bg-muted/50'
            )}
          >
            <input type="checkbox" className="size-4 shrink-0 accent-[var(--primary)]" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            긴급
          </label>
          <span className={cn('text-[11px]', urgent ? 'text-primary' : 'text-muted-foreground')}>
            {urgent ? `${won(cost.urgent)} 포함` : `선택하면 ${won(cost.urgent)}`}
          </span>
        </div>
        <label className="grid min-w-0 content-start gap-1.5 sm:row-span-3 sm:grid-rows-subgrid">
          <span className="text-sm font-medium">시료 개수</span>
          <input
            type="number"
            min={1}
            step={1}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={count}
            onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))}
          />
          <span className="text-[11px] text-muted-foreground">이 개수로 총액을 계산합니다</span>
        </label>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">시료 1개당</span>
          <span className="text-lg font-semibold tabular-nums">{won(value.per_cost)}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-xs text-muted-foreground">총액 ({count.toLocaleString('ko-KR')}개)</span>
          <span className="text-2xl font-semibold tabular-nums">{won(value.total_cost)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            setDraft(cost);
            setEditing((v) => !v);
          }}
        >
          {editing ? '단가 수정 닫기' : '단가 수정'}
        </button>

        {editing && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              단가는 바뀔 수 있어 이 화면에서 고칠 수 있습니다. 저장하면 이후 작성하는 의뢰서의 계산에 바로 반영됩니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {COST_COLUMNS.map((column) => (
                <label key={column} className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium">{COST_LABELS[column]}</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={draft[column] ?? 0}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [column]: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveCost()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? '저장 중…' : '단가표 저장'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-muted/50"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기. */
export function ReballCostPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-primary/50 bg-primary/5 p-2.5 text-sm font-medium">Reball</div>
        <div className="rounded-lg border p-2.5 text-sm font-medium">Component detach</div>
      </div>
      <div className="flex items-end justify-between rounded-lg border border-primary/40 bg-primary/5 p-3">
        <span className="text-xs text-muted-foreground">시료 1개당</span>
        <span className="text-xl font-semibold tabular-nums">단가표에서 자동 계산</span>
      </div>
    </div>
  );
}
