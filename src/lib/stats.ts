/**
 * 통계 차트 카탈로그(§8.3 '통계 차트' 그룹)가 쓰는 순수 계산 함수 모음.
 * React·DB에 의존하지 않으므로 단위 테스트로 그대로 검증한다(tests/unit/stats.test.ts).
 *
 * 입력은 항상 "이미 숫자로 정리된 배열"이고, 비어 있는 배열에도 안전하게 동작한다
 * (차트 쪽에서 데이터가 없을 때 별도 안내를 그리므로 여기서 예외를 던지지 않는다).
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 표본 표준편차(n-1). 값이 1개 이하면 0. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 선형 보간 분위수 (0 ≤ p ≤ 1) */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export type BoxStats = { min: number; q1: number; median: number; q3: number; max: number; iqr: number; outliers: number[] };

/** 박스플롯 5수 요약 + 1.5×IQR 밖 이상치 */
export function boxStats(values: number[]): BoxStats {
  if (values.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, iqr: 0, outliers: [] };
  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inliers = values.filter((v) => v >= lowFence && v <= highFence);
  return {
    min: inliers.length > 0 ? Math.min(...inliers) : Math.min(...values),
    q1,
    median,
    q3,
    max: inliers.length > 0 ? Math.max(...inliers) : Math.max(...values),
    iqr,
    outliers: values.filter((v) => v < lowFence || v > highFence),
  };
}

export type Bin = { label: string; from: number; to: number; count: number; center: number };

/** 등간격 도수분포. binCount는 미지정 시 스터지스 공식(⌈log2 n⌉ + 1). */
export function histogramBins(values: number[], binCount?: number): Bin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const k = Math.max(1, binCount ?? Math.ceil(Math.log2(values.length) + 1));
  if (min === max) return [{ label: format(min), from: min, to: max, count: values.length, center: min }];

  const width = (max - min) / k;
  const bins: Bin[] = Array.from({ length: k }, (_, i) => {
    const from = min + i * width;
    const to = from + width;
    return { label: `${format(from)}~${format(to)}`, from, to, count: 0, center: (from + to) / 2 };
  });
  for (const v of values) {
    // 마지막 구간은 상한을 포함한다(최댓값이 밖으로 새지 않게).
    const idx = Math.min(k - 1, Math.floor((v - min) / width));
    bins[idx].count += 1;
  }
  return bins;
}

/** 관리도 중심선/관리한계 (±k σ, 기본 3σ) */
export function controlLimits(values: number[], k = 3): { center: number; ucl: number; lcl: number; sigma: number } {
  const center = mean(values);
  const sigma = stdDev(values);
  return { center, ucl: center + k * sigma, lcl: center - k * sigma, sigma };
}

/** 이동범위(MR) = 연속한 두 값의 절대 차 */
export function movingRanges(values: number[]): number[] {
  return values.slice(1).map((v, i) => Math.abs(v - values[i]));
}

/** 단순 이동평균. window보다 앞선 구간은 null(선이 끊긴다). */
export function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    return mean(values.slice(i + 1 - window, i + 1));
  });
}

/** 최소제곱 단순회귀 y = a + b·x */
export function linearRegression(points: { x: number; y: number }[]): { a: number; b: number; r2: number } {
  const n = points.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  const sxx = points.reduce((acc, p) => acc + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((acc, p) => acc + (p.x - mx) * (p.y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const syy = points.reduce((acc, p) => acc + (p.y - my) ** 2, 0);
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { a, b, r2 };
}

/**
 * 표준정규 분위수 Φ⁻¹(p) — Acklam 근사(정밀도 약 1e-9). Q-Q 도표의 x축에 쓴다.
 * 외부 통계 라이브러리를 새로 들이지 않기 위해(CLAUDE.md §2 스택 고정) 직접 구현한다.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** 공정능력지수. 규격 한쪽만 주면 그쪽 기준(Cpu/Cpl)만으로 Cpk를 계산한다. */
export function capability(values: number[], lsl?: number, usl?: number): { cp: number | null; cpk: number | null; mean: number; sigma: number } {
  const m = mean(values);
  const sigma = stdDev(values);
  if (sigma === 0) return { cp: null, cpk: null, mean: m, sigma };
  const cp = lsl != null && usl != null ? (usl - lsl) / (6 * sigma) : null;
  const cpu = usl != null ? (usl - m) / (3 * sigma) : null;
  const cpl = lsl != null ? (m - lsl) / (3 * sigma) : null;
  const candidates = [cpu, cpl].filter((v): v is number => v != null);
  return { cp, cpk: candidates.length > 0 ? Math.min(...candidates) : null, mean: m, sigma };
}

/** 파레토용 — 값 내림차순 정렬 + 누적 비율(%) */
export function paretoSeries(items: { label: string; value: number }[]): { label: string; value: number; cumulative: number }[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((acc, i) => acc + i.value, 0);
  let running = 0;
  return sorted.map((i) => {
    running += i.value;
    return { ...i, cumulative: total === 0 ? 0 : Number(((running / total) * 100).toFixed(1)) };
  });
}

/** 워터폴용 — 각 항목의 시작/끝 누적값(막대를 띄우기 위한 base 포함) */
export function waterfallSeries(items: { label: string; value: number }[]): { label: string; base: number; value: number; total: number }[] {
  let running = 0;
  return items.map((i) => {
    const base = i.value >= 0 ? running : running + i.value;
    running += i.value;
    return { label: i.label, base, value: Math.abs(i.value), total: running };
  });
}

/** 소수점이 지저분하지 않게 축 라벨용으로 다듬는다. */
export function format(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(Math.abs(value) < 10 ? 2 : 1);
}
