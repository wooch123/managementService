import { describe, it, expect } from 'vitest';
import { toRecordRow, toRecordRows } from '@/lib/record-view';
import { statusTone } from '@/lib/status-tone';

/** runListQuery가 돌려주는 모양 그대로. 첫 컬럼(id)은 엔진이 끼워 넣는 것이라 implicit이다. */
function result(rows: Record<string, unknown>[]) {
  return {
    rows,
    total: rows.length,
    columns: [
      { columnName: 'id', fieldId: null, dataType: 'TEXT', implicit: true, label: 'id' },
      { columnName: 'far_no', fieldId: 'f1', dataType: 'TEXT', label: 'FAR No' },
      { columnName: 'claim_status', fieldId: 'f2', dataType: 'ENUM', label: '진행상태' },
      { columnName: 'received_date', fieldId: 'f3', dataType: 'DATE', label: '접수일' },
      { columnName: 'written_at', fieldId: 'f4', dataType: 'DATETIME', label: '작성일시' },
      { columnName: 'tat_days', fieldId: 'f5', dataType: 'INTEGER', label: 'TAT(일)' },
    ],
  };
}

describe('레코드 보기 변환', () => {
  it('설계에 적힌 표시 이름을 라벨로 쓴다(컬럼명이 아니라)', () => {
    const record = toRecordRow(
      result([{ id: 'a', far_no: 'FAR-26-4514', claim_status: '분석중', received_date: '2026-08-17', written_at: null, tat_days: 17 }])
    );
    expect(record?.fields.map((f) => f.label)).toEqual(['FAR No', '진행상태', '접수일', '작성일시', 'TAT(일)']);
    // 엔진이 끼워 넣은 id 컬럼은 화면에 나오지 않는다 — 나오면 첫 칸이 난수로 보인다.
    expect(record?.fields.some((f) => f.label === 'id')).toBe(false);
  });

  it('일시는 분까지만, 숫자는 자릿수 구분, 빈 값은 —', () => {
    const record = toRecordRow(
      result([{ id: 'a', far_no: 'FAR-1', claim_status: '', received_date: '2026-08-17', written_at: '2026-08-18T06:51:22.913Z', tat_days: 1234 }])
    );
    const byLabel = Object.fromEntries((record?.fields ?? []).map((f) => [f.label, f.text]));
    expect(byLabel['작성일시']).toBe('2026-08-18 06:51');
    expect(byLabel['TAT(일)']).toBe('1,234');
    expect(byLabel['진행상태']).toBe('—');
  });

  it('선택 전(빈 결과)에는 레코드가 없다', () => {
    expect(toRecordRow({ rows: [], total: 0, columns: [] })).toBeNull();
    expect(toRecordRows(null)).toEqual([]);
    expect(toRecordRows(undefined)).toEqual([]);
  });

  it('maxItems만큼만 가져온다', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, far_no: `FAR-${i}`, claim_status: '접수', received_date: null, written_at: null, tat_days: i }));
    expect(toRecordRows(result(rows), 3)).toHaveLength(3);
  });
});

describe('상태 색 의미', () => {
  it('같은 뜻은 같은 톤으로 — 화면마다 낱말이 달라도', () => {
    for (const word of ['완료', '종결', '승인', '해결됨']) expect(statusTone(word)).toBe('good');
    for (const word of ['지연', '반려', '취소', '긴급', 'Critical']) expect(statusTone(word)).toBe('bad');
    for (const word of ['보류', '검토중', '확인 필요']) expect(statusTone(word)).toBe('warn');
    for (const word of ['분석중', '진행중', '작업중']) expect(statusTone(word)).toBe('info');
  });

  it('지연·긴급이 진행 상태보다 앞선다(둘 다 걸리는 낱말에서)', () => {
    // '지연 진행중' 같은 복합 문구는 "지금 문제가 있다"가 먼저 읽혀야 한다.
    expect(statusTone('지연 진행중')).toBe('bad');
  });

  it('모르는 낱말은 중립', () => {
    expect(statusTone('WLCSP')).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
  });
});
