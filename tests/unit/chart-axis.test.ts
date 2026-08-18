import { describe, expect, it } from 'vitest';
import {
  categoricalXAxisLayout,
  categoricalXAxisProps,
  estimateTextWidth,
  truncateLabel,
} from '@/lib/chart-axis';

describe('x축 레이블 배치 (밀집 시 회전)', () => {
  it('여유가 있으면 기울이지 않는다', () => {
    const layout = categoricalXAxisLayout(['1월', '2월', '3월', '4월']);
    expect(layout.angle).toBe(0);
    expect(layout.textAnchor).toBe('middle');
  });

  it('항목이 많아 가로로 안 들어가면 기울인다', () => {
    const labels = Array.from({ length: 14 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const layout = categoricalXAxisLayout(labels);
    expect(layout.angle).toBeLessThan(0);
    expect(layout.textAnchor).toBe('end');
  });

  it('아주 빽빽하면 더 세운다', () => {
    const sparse = categoricalXAxisLayout(Array.from({ length: 12 }, (_, i) => `항목 ${i + 1}`));
    const dense = categoricalXAxisLayout(Array.from({ length: 40 }, (_, i) => `항목 ${i + 1}`));
    expect(Math.abs(dense.angle)).toBeGreaterThan(Math.abs(sparse.angle));
  });

  it('건너뛰기 없이 모든 레이블을 그린다', () => {
    for (const n of [3, 10, 30, 60]) {
      const layout = categoricalXAxisLayout(Array.from({ length: n }, (_, i) => `L${i}`));
      expect(layout.interval).toBe(0);
    }
  });

  it('축 높이는 상한을 넘지 않고, 넘칠 만큼 긴 이름은 말줄임 대상이 된다', () => {
    const layout = categoricalXAxisLayout(
      ['개발실 상세분석 의뢰 건수', 'Auto향 이력 확인', 'DRAM 분석 요청', 'pFA(비파괴) 진행', 'pFA(파괴) 진행'],
      { maxHeight: 88 }
    );
    expect(layout.height).toBeLessThanOrEqual(88);
    expect(layout.maxChars).not.toBeNull();
    expect(truncateLabel('개발실 상세분석 의뢰 건수', layout.maxChars)).toMatch(/…$/);
  });

  it('한글은 라틴 문자보다 넓게 계산한다', () => {
    expect(estimateTextWidth('가나다라', 11)).toBeGreaterThan(estimateTextWidth('abcd', 11));
  });

  it('짧은 레이블은 자르지 않는다', () => {
    expect(truncateLabel('1월', 5)).toBe('1월');
    expect(truncateLabel('짧다', null)).toBe('짧다');
  });

  it('빈 목록에도 안전한 값을 돌려준다', () => {
    const layout = categoricalXAxisLayout([]);
    expect(layout.angle).toBe(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('recharts에 넘길 props에는 항상 interval 0과 tickFormatter가 들어간다', () => {
    const props = categoricalXAxisProps(['가', '나', '다']);
    expect(props.interval).toBe(0);
    expect(props.tickLine).toBe(false);
    expect(typeof props.tickFormatter).toBe('function');
    expect(props.tickFormatter('가')).toBe('가');
  });
});
