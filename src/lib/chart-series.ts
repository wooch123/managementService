/**
 * 조회 결과(`{ rows, columns }`) → 차트가 먹는 `{ label, value }` 배열.
 *
 * '데이터 표시'와 '통계 차트' 두 카탈로그가 같은 규칙으로 값을 읽어야 하는데, 예전에는 같은
 * 로직이 양쪽에 각각 복사돼 있었다. 그래서 한쪽에서 발견한 결함이 다른 쪽에 그대로 남았다 —
 * 실제로 "관리자가 고른 컬럼"을 `fieldId !== null`로 판별하던 시절, 개수(count) 집계의 값
 * 컬럼에는 대응하는 필드가 없어 fieldId가 null이었고, 두 파일 모두 값 컬럼을 버린 채 라벨
 * 개수를 세어 막대를 전부 1로 그렸다(2026-08-19 운영 대시보드에서 확인). 규칙은 여기 한 곳에 둔다.
 */

export type SeriesColumn = { columnName: string; fieldId: string | null; dataType: string; implicit?: boolean };
export type SeriesResult = { rows: Record<string, unknown>[]; columns: SeriesColumn[] };

const NUMERIC_DATA_TYPES = new Set(['INTEGER', 'REAL']);

export function isNumericColumn(column: SeriesColumn): boolean {
  return NUMERIC_DATA_TYPES.has(column.dataType);
}

/** 조회 결과를 안전하게 꺼낸다(바인딩이 없거나 모양이 다르면 null). */
export function asSeriesResult(data: unknown): SeriesResult | null {
  if (!data || typeof data !== 'object') return null;
  const { rows, columns } = data as Partial<SeriesResult>;
  if (!Array.isArray(rows) || !Array.isArray(columns)) return null;
  return { rows, columns };
}

/**
 * 관리자가 고른 컬럼만. 엔진이 끼워 넣은 컬럼(`implicit`, 예: 모든 테이블의 id)은 뺀다 —
 * 그 컬럼까지 축 후보로 삼으면 첫 텍스트 컬럼이 id가 되어 라벨이 전부 난수로 나온다.
 */
export function selectedColumns(columns: SeriesColumn[]): SeriesColumn[] {
  return columns.filter((c) => !c.implicit);
}

/**
 * 첫 번째 비숫자 컬럼 = 라벨, 첫 번째 숫자 컬럼 = 값.
 * 숫자 컬럼이 없으면 라벨별 건수를 센다(원시 행 목록을 그대로 차트에 물린 경우).
 */
export function toLabelValueSeries(data: unknown): { label: string; value: number }[] {
  const result = asSeriesResult(data);
  if (!result) return [];

  const selected = selectedColumns(result.columns);
  const labelCol = selected.find((c) => !isNumericColumn(c));
  const valueCol = selected.find((c) => isNumericColumn(c));
  if (!labelCol) return [];

  if (!valueCol) {
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const label = String(row[labelCol.columnName] ?? '-');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, value]) => ({ label, value }));
  }

  return result.rows.map((row) => ({
    label: String(row[labelCol.columnName] ?? '-'),
    value: Number(row[valueCol.columnName] ?? 0),
  }));
}

export type MatrixCell = { label: string; series: string; value: number };
export type MatrixSeries = {
  /** 분류 축(가로) — 결과에 나온 순서 그대로. */
  labels: string[];
  /** 계열 축(층·열) — 합이 큰 순서. */
  seriesKeys: string[];
  /** `values[label][series]` — 없는 칸은 0. */
  values: Map<string, Map<string, number>>;
  /** 분류별 합 — 누적 막대의 총합, 히트맵의 행 합계. */
  totals: Map<string, number>;
  max: number;
};

/**
 * 축이 둘인 집계 결과(`{ label, series, value }`) → 격자.
 *
 * 두 번째 축이 없는 결과를 넘기면 계열이 하나("전체")인 격자가 나온다 — 부르는 쪽이
 * 바인딩 모양에 따라 갈라지지 않게 하려는 것이다.
 */
export function toMatrixSeries(data: unknown, seriesLimit = 8): MatrixSeries {
  const empty: MatrixSeries = { labels: [], seriesKeys: [], values: new Map(), totals: new Map(), max: 0 };
  const result = asSeriesResult(data);
  if (!result) return empty;

  const selected = selectedColumns(result.columns);
  const textCols = selected.filter((c) => !isNumericColumn(c));
  const valueCol = selected.find((c) => isNumericColumn(c));
  const labelCol = textCols[0];
  if (!labelCol || !valueCol) return empty;
  const seriesCol = textCols[1];

  const labels: string[] = [];
  const seriesTotals = new Map<string, number>();
  const values = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();

  for (const row of result.rows) {
    const label = String(row[labelCol.columnName] ?? '-');
    const series = seriesCol ? String(row[seriesCol.columnName] ?? '-') : '전체';
    const value = Number(row[valueCol.columnName] ?? 0);
    if (!values.has(label)) {
      values.set(label, new Map());
      labels.push(label);
    }
    const cells = values.get(label)!;
    cells.set(series, (cells.get(series) ?? 0) + value);
    totals.set(label, (totals.get(label) ?? 0) + value);
    seriesTotals.set(series, (seriesTotals.get(series) ?? 0) + value);
  }

  /**
   * 계열이 많으면 뒤쪽을 '기타'로 합친다. 층이 스물이면 색으로 구별되지도 않고 범례가
   * 그래프보다 커진다 — 큰 쪽 몇 개와 나머지 합이 읽기에 낫다.
   */
  const ranked = [...seriesTotals].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const kept = ranked.slice(0, seriesLimit);
  if (ranked.length > kept.length) {
    const dropped = new Set(ranked.slice(seriesLimit));
    for (const cells of values.values()) {
      let rest = 0;
      for (const key of dropped) {
        rest += cells.get(key) ?? 0;
        cells.delete(key);
      }
      if (rest > 0) cells.set('기타', rest);
    }
    kept.push('기타');
  }

  let max = 0;
  for (const cells of values.values()) for (const v of cells.values()) max = Math.max(max, v);

  return { labels, seriesKeys: kept, values, totals, max };
}

/** 격자를 recharts가 먹는 평평한 행(`{ label, [계열]: 값 }`)으로. */
export function toStackedRows(matrix: MatrixSeries): Record<string, string | number>[] {
  return matrix.labels.map((label) => {
    const cells = matrix.values.get(label);
    const row: Record<string, string | number> = { label };
    for (const key of matrix.seriesKeys) row[key] = cells?.get(key) ?? 0;
    return row;
  });
}
