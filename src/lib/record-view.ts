/**
 * 조회 결과(`{ rows, columns }`) → "라벨이 붙은 레코드" 목록.
 *
 * 차트가 `{label, value}` 계열로 읽는 것과 같은 자리(§chart-series)에, 표가 아닌 **레코드 중심**
 * 컴포넌트(선택 상세·타임라인·요약 목록·문서 카드)가 공통으로 쓰는 변환을 둔다. 네 컴포넌트가
 * 제각기 `data`를 파헤치면 같은 결함이 네 번 생긴다.
 *
 * 규칙은 칸반/간트와 같다 — **바인딩의 `select` 순서**가 곧 화면 순서다. 관리자가 필드를 고른
 * 순서대로 첫 칸이 제목, 나머지가 본문이 된다. 별도의 fieldId 속성을 두지 않는 이유는 그것이
 * 이미 바인딩에 있기 때문이다(같은 정보를 두 곳에 적으면 반드시 어긋난다).
 */

import { asSeriesResult, selectedColumns, type SeriesColumn } from '@/lib/chart-series';

export type RecordField = {
  /** 설계에 적힌 표시 이름(예: 'FAR No'). 없으면 컬럼명으로 물러난다. */
  label: string;
  /** 화면에 그대로 쓸 문자열. 빈 값은 '—'. */
  text: string;
  raw: unknown;
  dataType: string;
  isEnum: boolean;
  isNumeric: boolean;
  isDate: boolean;
  isEmpty: boolean;
};

export type RecordRow = {
  /** 행 식별자(엔진이 끼워 넣는 id 컬럼). 목록 key로만 쓴다. */
  id: string;
  fields: RecordField[];
};

const NUMERIC = new Set(['INTEGER', 'REAL']);
const DATEISH = new Set(['DATE', 'DATETIME']);

/** 일시는 초·밀리초까지 보여 줄 이유가 없다 — 'YYYY-MM-DD HH:MM'까지만. 날짜는 그대로 둔다. */
function formatValue(raw: unknown, dataType: string): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (dataType === 'DATETIME') {
    const text = String(raw);
    return text.includes('T') ? text.replace('T', ' ').slice(0, 16) : text;
  }
  if (NUMERIC.has(dataType) && typeof raw === 'number') return raw.toLocaleString('ko-KR');
  return String(raw);
}

function toField(column: SeriesColumn & { label?: string }, raw: unknown): RecordField {
  const text = formatValue(raw, column.dataType);
  return {
    label: column.label ?? column.columnName,
    text: text === '' ? '—' : text,
    raw,
    dataType: column.dataType,
    isEnum: column.dataType === 'ENUM',
    isNumeric: NUMERIC.has(column.dataType),
    isDate: DATEISH.has(column.dataType),
    isEmpty: text === '',
  };
}

/** 조회 결과를 레코드 목록으로. 바인딩이 없거나 모양이 다르면 빈 배열. */
export function toRecordRows(data: unknown, limit = 100): RecordRow[] {
  const result = asSeriesResult(data);
  if (!result) return [];
  const columns = selectedColumns(result.columns) as (SeriesColumn & { label?: string })[];
  return result.rows.slice(0, limit).map((row, index) => ({
    id: String(row.id ?? index),
    fields: columns.map((column) => toField(column, row[column.columnName])),
  }));
}

/** 첫 레코드 하나(선택 상세용). 없으면 null. */
export function toRecordRow(data: unknown): RecordRow | null {
  return toRecordRows(data, 1)[0] ?? null;
}
