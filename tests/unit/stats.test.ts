import { describe, it, expect } from 'vitest';
import {
  mean,
  stdDev,
  quantile,
  boxStats,
  histogramBins,
  controlLimits,
  movingRanges,
  movingAverage,
  linearRegression,
  normalQuantile,
  capability,
  paretoSeries,
  waterfallSeries,
} from '@/lib/stats';

describe('기술통계', () => {
  it('mean / stdDev', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3); // 표본 표준편차(n-1)
    expect(stdDev([5])).toBe(0);
  });

  it('quantile — 선형 보간', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('boxStats — 사분위와 1.5×IQR 이상치', () => {
    const s = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100]);
    expect(s.median).toBe(5);
    expect(s.outliers).toContain(100);
    expect(s.max).toBeLessThan(100); // 수염은 이상치를 제외한 최댓값
  });
});

describe('히스토그램', () => {
  it('모든 값이 어느 구간엔가 정확히 한 번 들어간다(최댓값 포함)', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bins = histogramBins(values, 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(values.length);
  });
  it('값이 모두 같으면 단일 구간', () => expect(histogramBins([3, 3, 3])).toHaveLength(1));
  it('빈 입력은 빈 배열', () => expect(histogramBins([])).toEqual([]));
});

describe('관리도', () => {
  it('controlLimits — 중심선 ±3σ', () => {
    const { center, ucl, lcl, sigma } = controlLimits([10, 12, 14, 11, 13]);
    expect(center).toBe(12);
    expect(ucl).toBeCloseTo(center + 3 * sigma, 10);
    expect(lcl).toBeCloseTo(center - 3 * sigma, 10);
  });
  it('movingRanges — 연속 값의 절대 차', () => expect(movingRanges([5, 8, 4])).toEqual([3, 4]));
  it('movingAverage — 구간 이전은 null', () => expect(movingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]));
});

describe('회귀·정규분포', () => {
  it('linearRegression — 완전 선형이면 R² = 1', () => {
    const { a, b, r2 } = linearRegression([
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ]);
    expect(b).toBeCloseTo(2, 10);
    expect(a).toBeCloseTo(1, 10);
    expect(r2).toBeCloseTo(1, 10);
  });

  it('normalQuantile — 표준정규 분위수', () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 4);
  });
});

describe('공정능력', () => {
  it('규격 양쪽이 주어지면 Cp/Cpk를 모두 계산한다', () => {
    const values = [9, 10, 11, 10, 10, 9, 11, 10];
    const { cp, cpk, mean: m } = capability(values, 7, 13);
    expect(m).toBe(10);
    expect(cp).not.toBeNull();
    expect(cpk).not.toBeNull();
    expect(cpk!).toBeLessThanOrEqual(cp!);
  });
  it('산포가 0이면 계산하지 않는다', () => expect(capability([5, 5, 5], 1, 9).cpk).toBeNull());
});

describe('파레토 / 워터폴', () => {
  it('paretoSeries — 내림차순 + 누적 100%', () => {
    const rows = paretoSeries([
      { label: 'A', value: 10 },
      { label: 'C', value: 50 },
      { label: 'B', value: 40 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['C', 'B', 'A']);
    expect(rows[rows.length - 1].cumulative).toBe(100);
  });

  it('waterfallSeries — 음수 항목은 아래로 떨어진다', () => {
    const rows = waterfallSeries([
      { label: '시작', value: 100 },
      { label: '손실', value: -30 },
    ]);
    expect(rows[0]).toMatchObject({ base: 0, value: 100, total: 100 });
    expect(rows[1]).toMatchObject({ base: 70, value: 30, total: 70 });
  });
});
