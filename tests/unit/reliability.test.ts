import { describe, it, expect } from 'vitest';
import {
  chiSquareInverse,
  clopperPearsonInterval,
  computeLife,
  computeRate,
  incompleteBeta,
  logGamma,
  normalQuantile,
  wilsonInterval,
} from '@/lib/stats/reliability';

/**
 * 수식은 눈으로 봐서 맞는지 알 수 없다 — 교과서/표에 실려 있는 값과 맞춰 둔다.
 * 여기 있는 기대값은 모두 통계표(카이제곱표·정규분포표)나 널리 인용되는 예제에서 가져왔다.
 */

describe('기본 특수함수', () => {
  it('logGamma는 정수 팩토리얼과 맞는다', () => {
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 6); // 4!
    expect(Math.exp(logGamma(1))).toBeCloseTo(1, 10);
    // Γ(1/2) = √π
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
  });

  it('normalQuantile은 표준정규 분위수표와 맞는다', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.95)).toBeCloseTo(1.644854, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
  });

  it('incompleteBeta는 이항 누적확률과 같다', () => {
    // I_x(a,b)와 이항분포의 관계: P(X ≥ k) = I_p(k, n−k+1)
    // n=10, p=0.5, k=5 → P(X ≥ 5) = 0.623046875
    expect(incompleteBeta(5, 6, 0.5)).toBeCloseTo(0.623046875, 9);
  });

  it('chiSquareInverse는 카이제곱표와 맞는다', () => {
    expect(chiSquareInverse(0.95, 2)).toBeCloseTo(5.9915, 3);
    expect(chiSquareInverse(0.95, 10)).toBeCloseTo(18.307, 3);
    expect(chiSquareInverse(0.9, 4)).toBeCloseTo(7.7794, 3);
  });
});

describe('불량률 구간', () => {
  it('Wilson 구간 — 널리 인용되는 예제(x=2, n=10, 95%)', () => {
    const ci = wilsonInterval(2, 10, 0.95);
    expect(ci.lower).toBeCloseTo(0.05668, 4);
    expect(ci.upper).toBeCloseTo(0.50984, 4);
  });

  it('Clopper–Pearson 구간 — 정확 구간표(x=2, n=10, 95%)', () => {
    const ci = clopperPearsonInterval(2, 10, 0.95);
    expect(ci.lower).toBeCloseTo(0.02521, 4);
    expect(ci.upper).toBeCloseTo(0.55605, 4);
  });

  it('불량 0건이면 Clopper–Pearson 하한은 0, 상한은 닫힌 식과 같다', () => {
    const n = 300;
    const ci = clopperPearsonInterval(0, n, 0.95);
    expect(ci.lower).toBe(0);
    // 양측 구간이라 상한에 걸리는 꼬리는 α/2다 — 1 − (α/2)^(1/n).
    // ('3의 법칙' 3/n ≈ 0.01은 단측 95%의 값이고, 여기 값은 그보다 조금 크다.)
    expect(ci.upper).toBeCloseTo(1 - Math.pow(0.025, 1 / n), 8);
  });

  it('DPPM은 불량률의 100만 배다', () => {
    const r = computeRate(3, 12000, 0.95);
    expect(r.rate).toBeCloseTo(0.00025, 10);
    expect(r.dppm).toBeCloseTo(250, 8);
    // 구간도 점추정을 감싼다
    expect(r.exact.lower).toBeLessThanOrEqual(r.rate);
    expect(r.exact.upper).toBeGreaterThanOrEqual(r.rate);
    // 정확 구간의 하한은 Wilson보다 아래에 있다(보수적).
    // 상한까지 늘 더 넓지는 않다 — n이 크고 p가 0에 가까우면 Wilson 상한이 살짝 더 크다.
    expect(r.exact.lower).toBeLessThanOrEqual(r.wilson.lower);
  });
});

describe('시간 기반 신뢰성', () => {
  it('AFR·FIT·MTBF 점추정', () => {
    // 1,000대를 1,000시간 → 100만 device-hours, 고장 2건
    const life = computeLife(1000, 1000, 2, 0.9);
    expect(life.deviceHours).toBe(1_000_000);
    expect(life.lambda).toBeCloseTo(2e-6, 12);
    expect(life.fit).toBeCloseTo(2000, 6);
    expect(life.mtbf).toBeCloseTo(500_000, 6);
    expect(life.afr).toBeCloseTo(1 - Math.exp(-2e-6 * 8760), 10);
  });

  it('고장 0건이어도 상한 고장률이 나온다', () => {
    const life = computeLife(500, 2000, 0, 0.9);
    expect(life.lambda).toBe(0);
    expect(life.mtbf).toBeNull();
    // χ²(0.9, 2) = 4.60517 → λ_U = 4.60517 / (2 × 1,000,000)
    expect(life.lambdaUpper).toBeCloseTo(4.60517 / 2_000_000, 12);
    expect(life.fitUpper).toBeGreaterThan(0);
    expect(life.mtbfLower).toBeCloseTo(1 / life.lambdaUpper, 3);
  });

  it('상한은 항상 점추정보다 크다', () => {
    const life = computeLife(2000, 8760, 5, 0.95);
    expect(life.lambdaUpper).toBeGreaterThan(life.lambda);
    expect(life.afrUpper).toBeGreaterThan(life.afr);
    expect(life.mtbfLower).toBeLessThan(life.mtbf!);
  });
});
