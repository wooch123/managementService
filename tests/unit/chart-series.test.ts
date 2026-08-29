import { describe, it, expect } from 'vitest';
import { selectedColumns, toLabelValueSeries, toMatrixSeries, toStackedRows } from '@/lib/chart-series';

/**
 * 조회 결과 → 차트 계열 변환.
 *
 * 회귀 테스트의 핵심은 첫 번째 케이스다. 항목별 집계(group) 결과의 **값 컬럼에는 대응하는
 * 필드가 없다**(개수를 세는 것이라 원본 필드가 없다). 예전에는 "관리자가 고른 컬럼"을
 * `fieldId !== null`로 판별했기 때문에 이 값 컬럼이 통째로 버려졌고, 그러면 라벨별 건수를
 * 세는 대체 경로로 빠져 **모든 막대가 1**이 되었다 — 실제 운영 대시보드에서 1,252건짜리 막대가
 * 1로 그려지고 있었다(2026-08-19 발견).
 */
const GROUP_COUNT_RESULT = {
  rows: [
    { label: 'UFS 2.1', value: 1258 },
    { label: 'UFS 4.0', value: 1255 },
    { label: 'eMMC 5.1', value: 1252 },
  ],
  total: 3,
  columns: [
    { columnName: 'label', fieldId: 'f-product', dataType: 'TEXT' },
    { columnName: 'value', fieldId: null, dataType: 'REAL' },
  ],
};

describe('항목별 집계 결과를 차트 계열로', () => {
  it('개수 집계의 값을 그대로 쓴다 (전부 1로 세지 않는다)', () => {
    expect(toLabelValueSeries(GROUP_COUNT_RESULT)).toEqual([
      { label: 'UFS 2.1', value: 1258 },
      { label: 'UFS 4.0', value: 1255 },
      { label: 'eMMC 5.1', value: 1252 },
    ]);
  });

  it('합계·평균 집계(값 필드가 있는 경우)도 같다', () => {
    const result = {
      ...GROUP_COUNT_RESULT,
      columns: [
        { columnName: 'label', fieldId: 'f-month', dataType: 'TEXT' },
        { columnName: 'value', fieldId: 'f-tat', dataType: 'REAL' },
      ],
    };
    expect(toLabelValueSeries(result).map((s) => s.value)).toEqual([1258, 1255, 1252]);
  });
});

describe('목록 결과를 차트 계열로', () => {
  const LIST_RESULT = {
    rows: [
      { id: 'r1', period_label: '2026-06', received_cnt: 30 },
      { id: 'r2', period_label: '2026-07', received_cnt: 31 },
    ],
    columns: [
      { columnName: 'id', fieldId: null, dataType: 'TEXT', implicit: true },
      { columnName: 'period_label', fieldId: 'f-label', dataType: 'TEXT' },
      { columnName: 'received_cnt', fieldId: 'f-cnt', dataType: 'INTEGER' },
    ],
  };

  it('엔진이 끼워 넣은 id 컬럼은 축 후보에서 뺀다', () => {
    expect(selectedColumns(LIST_RESULT.columns).map((c) => c.columnName)).toEqual(['period_label', 'received_cnt']);
    expect(toLabelValueSeries(LIST_RESULT)).toEqual([
      { label: '2026-06', value: 30 },
      { label: '2026-07', value: 31 },
    ]);
  });

  it('숫자 컬럼이 없으면 라벨별 건수를 센다', () => {
    const rows = [{ id: 'r1', status: '분석중' }, { id: 'r2', status: '분석중' }, { id: 'r3', status: '종결' }];
    const columns = [
      { columnName: 'id', fieldId: null, dataType: 'TEXT', implicit: true },
      { columnName: 'status', fieldId: 'f-status', dataType: 'ENUM' },
    ];
    expect(toLabelValueSeries({ rows, columns })).toEqual([
      { label: '분석중', value: 2 },
      { label: '종결', value: 1 },
    ]);
  });

  it('모양이 아니면 빈 배열을 준다 (바인딩 없음·집계 숫자·null)', () => {
    for (const bad of [null, undefined, 0, 42, 'x', {}, { rows: [] }]) {
      expect(toLabelValueSeries(bad)).toEqual([]);
    }
  });
});

/**
 * 축이 둘인 결과 → 격자.
 *
 * 계열 상한을 넘긴 것들은 버리지 않고 '기타'로 합친다 — 버리면 누적 막대의 총합이 실제보다
 * 작아져, 옆의 지표 타일과 숫자가 어긋난다.
 */
const MATRIX_RESULT = {
  rows: [
    { label: 'A', series: 'x', value: 5 },
    { label: 'A', series: 'y', value: 3 },
    { label: 'A', series: 'z', value: 1 },
    { label: 'B', series: 'x', value: 4 },
    { label: 'B', series: 'z', value: 2 },
  ],
  total: 5,
  columns: [
    { columnName: 'label', fieldId: 'f1', dataType: 'TEXT' },
    { columnName: 'series', fieldId: 'f2', dataType: 'TEXT' },
    { columnName: 'value', fieldId: null, dataType: 'REAL' },
  ],
};

describe('두 축 결과 → 격자', () => {
  it('분류·계열·합계를 갈라 담는다', () => {
    const m = toMatrixSeries(MATRIX_RESULT);
    expect(m.labels).toEqual(['A', 'B']);
    expect(m.seriesKeys).toEqual(['x', 'y', 'z']); // 합이 큰 순서
    expect(m.values.get('A')?.get('y')).toBe(3);
    expect(m.totals.get('A')).toBe(9);
    expect(m.max).toBe(5);
  });

  it('없는 칸은 0으로 채워 평평한 행을 만든다', () => {
    const rows = toStackedRows(toMatrixSeries(MATRIX_RESULT));
    expect(rows).toEqual([
      { label: 'A', x: 5, y: 3, z: 1 },
      { label: 'B', x: 4, y: 0, z: 2 },
    ]);
  });

  it('계열 상한을 넘긴 것은 버리지 않고 기타로 합친다', () => {
    const m = toMatrixSeries(MATRIX_RESULT, 2);
    expect(m.seriesKeys).toEqual(['x', 'y', '기타']);
    expect(m.values.get('A')?.get('기타')).toBe(1);
    expect(m.values.get('B')?.get('기타')).toBe(2);
    // 합은 줄지 않는다.
    const total = [...m.values.values()].flatMap((c) => [...c.values()]).reduce((s, v) => s + v, 0);
    expect(total).toBe(15);
  });

  it('두 번째 축이 없는 결과는 계열 하나짜리 격자가 된다', () => {
    const m = toMatrixSeries(GROUP_COUNT_RESULT);
    expect(m.seriesKeys).toEqual(['전체']);
    expect(m.values.get('UFS 2.1')?.get('전체')).toBe(1258);
  });
});
