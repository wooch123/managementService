import { describe, expect, it } from 'vitest';
import {
  categoricalXAxisLayout,
  categoricalXAxisProps,
  estimateTextWidth,
  truncateLabel,
  yAxisLabelProps,
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

describe('y축 이름', () => {
  it('이름이 없으면 축 설정을 건드리지 않는다', () => {
    expect(yAxisLabelProps('')).toEqual({});
    expect(yAxisLabelProps('   ')).toEqual({});
    expect(yAxisLabelProps(null)).toEqual({});
  });

  it('이름을 주면 세로로 세운 라벨과 넉넉한 축 폭을 돌려준다', () => {
    const props = yAxisLabelProps('불량 건수');
    expect(props.label?.value).toBe('불량 건수');
    expect(props.label?.angle).toBe(-90);
    expect(props.width).toBeGreaterThanOrEqual(48);
  });

  it('앞뒤 공백은 정리한다', () => {
    expect(yAxisLabelProps('  건수  ').label?.value).toBe('건수');
  });
});

/**
 * 양 끝 레이블 잘림 방지.
 *
 * 가로쓰기 레이블은 눈금 위에 가운데 정렬되므로 첫/마지막은 절반이 축 밖으로 나간다.
 * 실제로 4개월짜리 추이에서 '2026-05'가 '26-05'로 잘려 보였다(2026-08-19).
 */
describe('양 끝 여백', () => {
  it('가로쓰기면 가장 긴 레이블의 절반만큼 좌우를 비운다', () => {
    const layout = categoricalXAxisLayout(['2026-05', '2026-06', '2026-07', '2026-08']);
    expect(layout.angle).toBe(0);
    expect(layout.padding.left).toBeGreaterThan(0);
    expect(layout.padding.left).toBe(layout.padding.right);
    expect(layout.padding.left).toBeGreaterThanOrEqual(Math.floor(estimateTextWidth('2026-05') / 2));
  });

  it('기울인 축은 왼쪽 위로 뻗으므로 왼쪽만 비운다', () => {
    const many = Array.from({ length: 20 }, (_, i) => `아주 긴 항목 이름 ${i}`);
    const layout = categoricalXAxisLayout(many);
    expect(layout.angle).toBeLessThan(0);
    expect(layout.padding.left).toBeGreaterThan(0);
    expect(layout.padding.right).toBe(0);
  });

  it('말줄임된 레이블은 잘린 뒤 폭만큼만 비운다', () => {
    const long = Array.from({ length: 12 }, (_, i) => `아주 아주 아주 긴 항목 이름입니다 ${i}`);
    const layout = categoricalXAxisLayout(long);
    expect(layout.maxChars).not.toBeNull();
    expect(layout.padding.left).toBeLessThanOrEqual(40);
  });

  it('레이블이 아무리 길어도 여백이 그림을 잡아먹지 않는다', () => {
    const layout = categoricalXAxisLayout(['아주 아주 아주 긴 단 하나의 항목 이름']);
    expect(layout.padding.left).toBeLessThanOrEqual(40);
  });

  it('XAxis props에 그대로 실려 나간다', () => {
    expect(categoricalXAxisProps(['2026-05', '2026-06']).padding.left).toBeGreaterThan(0);
  });
});
