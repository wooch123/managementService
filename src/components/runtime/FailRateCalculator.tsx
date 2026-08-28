'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { computeLife, computeRate, type Interval } from '@/lib/stats/reliability';

/**
 * 불량률 계산기 — 서버를 부르지 않는다.
 *
 * 입력이 전부 손으로 넣는 값이고 계산은 순수 함수라 왕복할 이유가 없다. 그래서 설계에서
 * 바인딩을 물리지 않아도 배치하는 즉시 동작한다(게시판과 같은 성격의 '바로 동작' 컴포넌트).
 *
 * 두 갈래로 나뉘는 이유: 현장에서 "몇 개 중 몇 개가 불량인가"(비율)와 "얼마나 오래 돌렸는데
 * 몇 개가 죽었는가"(시간)는 쓰는 자리도 답해야 할 것도 다르다. 앞은 출하 로트의 DPPM,
 * 뒤는 제품 수명(AFR·FIT·MTBF)이다.
 */

type Mode = 'rate' | 'life';
type TimeUnit = 'hour' | 'day' | 'year';

const CONFIDENCE_OPTIONS = [0.9, 0.95, 0.99] as const;
const TIME_UNITS: { key: TimeUnit; label: string; hours: number }[] = [
  { key: 'hour', label: '시간', hours: 1 },
  { key: 'day', label: '일', hours: 24 },
  { key: 'year', label: '년', hours: 8760 },
];

function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 아주 작은 값이 0.00으로 뭉개지지 않게 자릿수를 값의 크기에 맞춘다. */
function fmtAuto(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 100) return fmt(value, 0);
  if (abs >= 1) return fmt(value, 2);
  if (abs >= 0.01) return fmt(value, 4);
  return value.toExponential(3);
}

/**
 * 백분율. 지수 표기로 넘어가지 않게 자릿수만 늘린다 — DPPM 수준의 값(0.006%)이 `6.187e-3%`로
 * 나오면 옆 칸의 DPPM 숫자와 견줄 수가 없다.
 */
function pct(value: number): string {
  const p = value * 100;
  if (!Number.isFinite(p)) return '—';
  if (p === 0) return '0%';
  if (p >= 1) return `${p.toFixed(2)}%`;
  if (p >= 0.01) return `${p.toFixed(4)}%`;
  return `${p.toFixed(6)}%`;
}

function Num({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'warn';
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-lg border p-3',
        tone === 'accent' && 'border-primary/40 bg-primary/5',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/5'
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums break-words">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

function IntervalRow({ name, ci, note }: { name: string; ci: Interval; note: string }) {
  return (
    <tr className="border-t">
      <th scope="row" className="py-2 pr-3 text-left align-top text-xs font-medium">
        {name}
        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{note}</span>
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{pct(ci.lower)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{pct(ci.upper)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{fmt(ci.lower * 1e6, 0)}</td>
      <td className="py-2 text-right tabular-nums">{fmt(ci.upper * 1e6, 0)}</td>
    </tr>
  );
}

export function FailRateCalculator({
  title,
  description,
  defaultSample,
  defaultFailures,
}: {
  title: string;
  description: string;
  defaultSample: number;
  defaultFailures: number;
}) {
  const [mode, setMode] = useState<Mode>('rate');
  const [confidence, setConfidence] = useState<number>(0.95);

  const [sample, setSample] = useState(defaultSample);
  const [failures, setFailures] = useState(defaultFailures);

  const [units, setUnits] = useState(1000);
  const [duration, setDuration] = useState(1000);
  const [unit, setUnit] = useState<TimeUnit>('hour');
  const [lifeFailures, setLifeFailures] = useState(2);

  const rate = useMemo(
    () => computeRate(Math.max(0, Math.min(failures, sample)), Math.max(0, sample), confidence),
    [failures, sample, confidence]
  );
  const hoursPerUnit = duration * (TIME_UNITS.find((u) => u.key === unit)?.hours ?? 1);
  const life = useMemo(
    () => computeLife(Math.max(0, units), Math.max(0, hoursPerUnit), Math.max(0, lifeFailures), confidence),
    [units, hoursPerUnit, lifeFailures, confidence]
  );

  const invalidRate = sample <= 0 || failures > sample;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {(title || description) && (
        <div className="shrink-0">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="계산 방식" className="inline-flex rounded-md border p-0.5">
          {(
            [
              ['rate', '불량률 · DPPM'],
              ['life', 'AFR · FIT · MTBF'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          신뢰수준
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums outline-none focus-visible:border-ring"
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
          >
            {CONFIDENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {(c * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === 'rate' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="검사 수량 (n)" value={sample} onChange={setSample} suffix="개" />
            <Field label="불량 수 (x)" value={failures} onChange={setFailures} suffix="개" />
          </div>

          {invalidRate ? (
            <p className="rounded-r-md border-l-[3px] border-amber-500 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              검사 수량은 1 이상이어야 하고, 불량 수가 검사 수량을 넘을 수 없습니다.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Num label="불량률" value={pct(rate.rate)} tone="accent" />
                <Num label="DPPM" value={fmt(rate.dppm, 0)} hint="100만 개당 불량 수" tone="accent" />
                <Num
                  label={`${(confidence * 100).toFixed(0)}% 상한 (정확)`}
                  value={fmt(rate.exact.upper * 1e6, 0)}
                  hint="DPPM · 이보다 나쁠 가능성은 낮다"
                  tone="warn"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <caption className="pb-1.5 text-left text-xs text-muted-foreground">
                    {(confidence * 100).toFixed(0)}% 신뢰구간 — 표본이 작을수록 구간이 넓어진다
                  </caption>
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="pb-1 pr-3 text-left font-medium">
                        방법
                      </th>
                      <th scope="col" className="pb-1 pr-3 text-right font-medium">
                        하한(%)
                      </th>
                      <th scope="col" className="pb-1 pr-3 text-right font-medium">
                        상한(%)
                      </th>
                      <th scope="col" className="pb-1 pr-3 text-right font-medium">
                        하한(DPPM)
                      </th>
                      <th scope="col" className="pb-1 text-right font-medium">
                        상한(DPPM)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <IntervalRow name="Wilson score" ci={rate.wilson} note="일상적인 보고에 권장" />
                    <IntervalRow name="Clopper–Pearson" ci={rate.exact} note="정확 구간 · 보수적" />
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="투입 수량" value={units} onChange={setUnits} suffix="대" />
            <Field label="관측 기간" value={duration} onChange={setDuration} />
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">기간 단위</span>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                value={unit}
                onChange={(e) => setUnit(e.target.value as TimeUnit)}
              >
                {TIME_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <Field label="고장 수" value={lifeFailures} onChange={setLifeFailures} suffix="건" />
          </div>

          <p className="text-xs text-muted-foreground">
            총 관측 시간 <span className="font-medium tabular-nums text-foreground">{fmt(life.deviceHours, 0)}</span> device-hours
            {life.deviceHours > 0 && <> · 제품당 {fmt(hoursPerUnit, 0)}시간</>}
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <Num label="AFR (연간 고장률)" value={pct(life.afr)} hint={`${(confidence * 100).toFixed(0)}% 상한 ${pct(life.afrUpper)}`} tone="accent" />
            <Num label="FIT" value={fmtAuto(life.fit)} hint={`10억 시간당 · 상한 ${fmtAuto(life.fitUpper)}`} tone="accent" />
            <Num
              label="MTBF"
              value={life.mtbf === null ? '—' : `${fmt(life.mtbf, 0)} h`}
              hint={`하한 ${fmt(life.mtbfLower, 0)} h`}
              tone="warn"
            />
          </div>

          <p className="rounded-r-md border-l-[3px] border-primary bg-primary/10 px-3 py-2 text-xs">
            고장이 0건이어도 상한은 0이 아니다 — χ²(2r+2) 기반 단측 상한이라 &ldquo;관측되지 않았을 뿐&rdquo;을
            숫자로 남긴다. 시험을 정해진 시간까지 돌리고 끝낸 경우(time-terminated) 기준이다.
          </p>
        </div>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기 — 편집 중에 계산기가 상태를 갖지 않게 한다. */
export function FailRateCalculatorPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="grid gap-2 sm:grid-cols-3">
        <Num label="불량률" value="0.03%" />
        <Num label="DPPM" value="250" />
        <Num label="95% 상한" value="731" />
      </div>
      <p className="text-xs text-muted-foreground">운영 화면에서 수량·불량 수를 넣으면 계산됩니다.</p>
    </div>
  );
}
