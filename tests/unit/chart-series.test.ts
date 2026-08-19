import { describe, it, expect } from 'vitest';
import { selectedColumns, toLabelValueSeries } from '@/lib/chart-series';

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
