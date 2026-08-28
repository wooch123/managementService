/**
 * 불량률·신뢰성 통계 — '불량률 계산기' 화면이 쓰는 순수 계산부.
 *
 * 화면(React)과 떼어 놓는 이유는 두 가지다. ① 이런 수식은 눈으로 봐서는 맞는지 알 수 없어
 * **시험으로만** 확인된다(tests/unit/reliability.test.ts에 교과서 값과 맞춰 뒀다).
 * ② 서버에서 같은 값을 다시 계산해야 할 일이 생겨도 그대로 쓸 수 있다.
 *
 * 브라우저에서도 도는 코드라 외부 수치 라이브러리를 새로 들이지 않고, 표준적인 급수·연분수
 * 전개(Numerical Recipes 계열)를 직접 적었다.
 */

/** 로그 감마 — Lanczos 근사(g=7, n=9). 상대오차 1e-15 수준. */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // 반사 공식 — 0 < x < 0.5에서는 아래 급수가 정확도를 잃는다.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 3e-14;
const FPMIN = 1e-300;
const MAX_ITER = 300;

/** 불완전 베타 함수의 연분수 전개 — I_x(a,b)를 구하는 속살. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** 정규화 불완전 베타 I_x(a,b) — 이항분포의 누적확률과 같은 값이다. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** I_x(a,b) = p 가 되는 x. x에 대해 단조증가라 이분법이면 충분하다(80회면 배정밀도 한계). */
export function inverseIncompleteBeta(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (incompleteBeta(a, b, mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 정규화 하부 불완전 감마 P(a,x) — 카이제곱 누적분포의 속살. */
export function lowerGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let i = 0; i < MAX_ITER; i += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // 큰 x에서는 급수가 느려 상보값 Q(a,x)를 연분수로 구한 뒤 1에서 뺀다.
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** 카이제곱 분포의 역누적 — 자유도 df에서 하위확률이 p가 되는 값. */
export function chiSquareInverse(p: number, df: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  const a = df / 2;
  // 위쪽 경계를 넓혀 가며 먼저 잡는다 — 자유도가 크면 값도 그만큼 커진다.
  let hi = Math.max(df, 1);
  while (lowerGamma(a, hi / 2) < p && hi < 1e12) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (lowerGamma(a, mid / 2) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Interval = { lower: number; upper: number };

/** 표준정규 분위수(Acklam 근사, |오차| < 1.15e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * Wilson score 구간 — 표본이 작거나 불량률이 0에 가까워도 무너지지 않는다.
 * (정규근사 p̂ ± z·√(p̂q̂/n)는 불량이 0건이면 폭이 0이 되어 "불량률 0%가 확실하다"고 말해 버린다.)
 */
export function wilsonInterval(failures: number, n: number, confidence: number): Interval {
  if (n <= 0) return { lower: 0, upper: 0 };
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const p = failures / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
  };
}

/**
 * Clopper–Pearson 정확(exact) 구간 — 이항분포를 그대로 뒤집어 얻는다. 보수적이지만
 * "이보다 나쁠 수는 없다"를 보장해야 하는 품질 보고에 쓰인다. 불량이 0건이면 상한이
 * 이른바 '3의 법칙'(1 − α^(1/n))과 같은 값으로 나온다.
 */
export function clopperPearsonInterval(failures: number, n: number, confidence: number): Interval {
  if (n <= 0) return { lower: 0, upper: 0 };
  const alpha = 1 - confidence;
  const lower = failures <= 0 ? 0 : inverseIncompleteBeta(alpha / 2, failures, n - failures + 1);
  const upper = failures >= n ? 1 : inverseIncompleteBeta(1 - alpha / 2, failures + 1, n - failures);
  return { lower, upper };
}

export const HOURS_PER_YEAR = 8760;

export type RateResult = {
  /** 점추정 불량률(0~1) */
  rate: number;
  dppm: number;
  wilson: Interval;
  exact: Interval;
};

export function computeRate(failures: number, sample: number, confidence: number): RateResult {
  const rate = sample > 0 ? failures / sample : 0;
  return {
    rate,
    dppm: rate * 1e6,
    wilson: wilsonInterval(failures, sample, confidence),
    exact: clopperPearsonInterval(failures, sample, confidence),
  };
}

export type LifeResult = {
  /** 총 관측 시간 (제품 수 × 제품당 시간) */
  deviceHours: number;
  /** 시간당 고장률(점추정) */
  lambda: number;
  /** 단측 상한 신뢰수준에서의 고장률 */
  lambdaUpper: number;
  /** 연간 고장률(0~1) — 1 − exp(−λ·8760) */
  afr: number;
  afrUpper: number;
  /** 10억 시간당 고장 수 */
  fit: number;
  fitUpper: number;
  /** 평균 고장 간격(시간). 고장이 없으면 정의되지 않아 null. */
  mtbf: number | null;
  /** 상한 고장률에 대응하는 MTBF 하한 */
  mtbfLower: number;
};

/**
 * 시간 기반 신뢰성 지표(AFR·FIT·MTBF).
 *
 * `lambdaUpper`는 χ²(1−α, 2r+2) / (2T) — 정해진 시간까지 돌리고 끝내는 시험(time-terminated)의
 * 표준 상한이다. 고장이 0건이어도 값이 나온다는 것이 요점이다("0건이니 고장률 0"이라고 말하지
 * 않는다). 여기서 `confidence`는 **단측** 신뢰수준으로 읽는다.
 */
export function computeLife(
  units: number,
  hoursPerUnit: number,
  failures: number,
  confidence: number
): LifeResult {
  const deviceHours = units * hoursPerUnit;
  const lambda = deviceHours > 0 ? failures / deviceHours : 0;
  const lambdaUpper = deviceHours > 0 ? chiSquareInverse(confidence, 2 * failures + 2) / (2 * deviceHours) : 0;
  return {
    deviceHours,
    lambda,
    lambdaUpper,
    afr: 1 - Math.exp(-lambda * HOURS_PER_YEAR),
    afrUpper: 1 - Math.exp(-lambdaUpper * HOURS_PER_YEAR),
    fit: lambda * 1e9,
    fitUpper: lambdaUpper * 1e9,
    mtbf: failures > 0 ? deviceHours / failures : null,
    mtbfLower: lambdaUpper > 0 ? 1 / lambdaUpper : 0,
  };
}
