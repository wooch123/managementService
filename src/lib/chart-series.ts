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
