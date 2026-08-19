/**
 * 조회 기간(기간 필터)의 단일 진실 공급원.
 *
 * 서버(운영 렌더러가 바인딩을 조회하기 전)와 클라이언트(기간 필터 컴포넌트가 주소를 바꿀 때)가
 * **같은 규칙**으로 기간을 계산해야 화면에 보이는 기간과 실제 조회 범위가 어긋나지 않는다.
 * 그래서 이 파일은 순수 함수만 두고 `server-only`를 붙이지 않는다.
 *
 * 주소 규약:
 *   `?preset=3m`                     → 최근 3개월(서버가 오늘 기준으로 계산)
 *   `?preset=all`                    → 기간 제한 없음
 *   `?from=2025-01-01&to=2025-06-30` → 직접 지정
 *   (아무것도 없음)                   → 페이지에 놓인 기간 필터 컴포넌트의 기본 프리셋
 */

export const PERIOD_PRESETS = [
  { key: '1m', label: '최근 1개월', months: 1 },
  { key: '3m', label: '최근 3개월', months: 3 },
  { key: '6m', label: '최근 6개월', months: 6 },
  { key: '12m', label: '최근 1년', months: 12 },
  { key: 'all', label: '전체', months: null },
] as const;

export type PeriodPresetKey = (typeof PERIOD_PRESETS)[number]['key'];

export const DEFAULT_PERIOD_PRESET: PeriodPresetKey = '3m';

/** 확정된 조회 기간. `from`/`to`가 null이면 그쪽 경계는 걸지 않는다(=전체). */
export type PeriodRange = {
  from: string | null;
  to: string | null;
  /** 프리셋으로 정해졌으면 그 키, 날짜를 직접 지정했으면 'custom' */
  preset: PeriodPresetKey | 'custom';
};

/** 기간 필터가 주소에 쓰는 파라미터 이름 — 바인딩 필터의 `ref`도 이 이름을 가리킨다. */
export const PERIOD_PARAM = { preset: 'preset', from: 'from', to: 'to' } as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function isPeriodPreset(value: unknown): value is PeriodPresetKey {
  return typeof value === 'string' && PERIOD_PRESETS.some((p) => p.key === value);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** 로컬 시각 기준 'YYYY-MM-DD'. UTC로 찍으면 한국 시간 오전 9시 이전에 하루 전 날짜가 나온다. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * n개월 전 같은 날. 말일 넘침(3월 31일 − 1개월)은 그 달의 마지막 날로 자른다 —
 * Date가 알아서 다음 달로 굴러가면 "1개월 전"이 오히려 앞으로 가버린다.
 */
export function monthsBefore(date: Date, months: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth() - months;
  const target = new Date(y, m, 1);
  const day = Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

export function presetRange(key: PeriodPresetKey, today: Date = new Date()): PeriodRange {
  const preset = PERIOD_PRESETS.find((p) => p.key === key) ?? PERIOD_PRESETS[1];
  if (preset.months === null) return { from: null, to: null, preset: preset.key };
  return { from: toIsoDate(monthsBefore(today, preset.months)), to: toIsoDate(today), preset: preset.key };
}

/** 프리셋 라벨(직접 지정이면 'YYYY-MM-DD ~ YYYY-MM-DD') */
export function periodLabel(range: PeriodRange): string {
  if (range.preset !== 'custom') {
    return PERIOD_PRESETS.find((p) => p.key === range.preset)?.label ?? range.preset;
  }
  return `${range.from ?? '처음'} ~ ${range.to ?? '오늘'}`;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 주소의 쿼리 → 확정된 기간. 값이 없거나 형식이 틀리면 조용히 기본 프리셋으로 돌아간다
 * (운영 화면은 주소를 손으로 고쳐도 깨지지 않아야 한다).
 */
export function resolvePeriod(
  raw: RawParams,
  defaultPreset: PeriodPresetKey = DEFAULT_PERIOD_PRESET,
  today: Date = new Date()
): PeriodRange {
  const preset = first(raw[PERIOD_PARAM.preset]);
  if (isPeriodPreset(preset)) return presetRange(preset, today);

  const from = first(raw[PERIOD_PARAM.from]);
  const to = first(raw[PERIOD_PARAM.to]);
  const validFrom = isIsoDate(from) ? from : null;
  const validTo = isIsoDate(to) ? to : null;
  if (validFrom || validTo) {
    // 뒤집힌 구간은 바로잡아 준다 — 빈 화면 대신 사용자가 의도한 범위를 보여주는 쪽이 낫다.
    if (validFrom && validTo && validFrom > validTo) return { from: validTo, to: validFrom, preset: 'custom' };
    return { from: validFrom, to: validTo, preset: 'custom' };
  }

  return presetRange(isPeriodPreset(defaultPreset) ? defaultPreset : DEFAULT_PERIOD_PRESET, today);
}

/**
 * 바인딩 필터가 `source: 'query'`로 참조하는 값들. 없는 경계는 키 자체를 넣지 않는다 —
 * 런타임은 "이름은 있는데 값이 비었다"가 아니라 "그 이름이 없다"로 조건을 건너뛴다.
 */
export function periodQueryValues(range: PeriodRange): Record<string, string> {
  const values: Record<string, string> = {};
  if (range.from) values[PERIOD_PARAM.from] = range.from;
  if (range.to) values[PERIOD_PARAM.to] = range.to;
  return values;
}

/** 기간 필터 컴포넌트가 주소를 바꿀 때 쓰는 쿼리 문자열(다른 파라미터는 건드리지 않는다). */
export function periodSearchString(base: URLSearchParams, next: { preset: PeriodPresetKey } | { from: string; to: string }): string {
  const params = new URLSearchParams(base);
  params.delete(PERIOD_PARAM.preset);
  params.delete(PERIOD_PARAM.from);
  params.delete(PERIOD_PARAM.to);
  if ('preset' in next) {
    params.set(PERIOD_PARAM.preset, next.preset);
  } else {
    params.set(PERIOD_PARAM.from, next.from);
    params.set(PERIOD_PARAM.to, next.to);
  }
  return params.toString();
}
