import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_TABLES,
  DEDICATED_ENDPOINT,
  isExternalTable,
  fieldsByColumn,
  type TableInfo,
} from '@/lib/api/external-tables';
import { isValidIdentifierFormat, isReservedIdentifier } from '@/lib/data-engine/identifiers';

/**
 * 바깥 창구(`/api/external/<표>`)의 **명단**을 지키는 시험.
 *
 * 이 창구는 표 이름을 주소에서 받는다. 명단이 무너지면 주소 문자열이 표 이름 자리로 흘러가므로,
 * 여기서 막는 성질들을 못으로 박아 둔다.
 */

describe('외부 API 표 명단', () => {
  it('분석 이력은 이 창구로 열리지 않는다 (전용 창구가 따로 있다)', () => {
    // far_analysis_log에 직접 넣으면 회차(rev)와 원장 갱신이 짝을 잃는다.
    expect(isExternalTable('far_analysis_log')).toBe(false);
    expect(DEDICATED_ENDPOINT.far_analysis_log).toBe('POST /api/far/analysis');
  });

  it('명단의 이름은 전부 식별자 규칙을 지키고 예약어가 아니다', () => {
    // 명단에 오른 이름만 SQL로 가는 길이 있으므로, 그 이름들 자체가 안전해야 한다.
    for (const table of EXTERNAL_TABLES) {
      expect(isValidIdentifierFormat(table), table).toBe(true);
      expect(isReservedIdentifier(table), table).toBe(false);
    }
  });

  it('명단에 중복이 없다', () => {
    expect(new Set(EXTERNAL_TABLES).size).toBe(EXTERNAL_TABLES.length);
  });

  it('설계 DB의 표와 SQLite 내부 표는 열리지 않는다', () => {
    for (const name of ['sqlite_master', 'sqlite_sequence', 'Page', 'Entity', 'Component', 'Revision']) {
      expect(isExternalTable(name), name).toBe(false);
    }
  });

  it('주입을 노린 이름은 전부 명단에서 걸린다', () => {
    const attempts = [
      'far_table; DROP TABLE far_table',
      'far_table--',
      "far_table' OR '1'='1",
      '../../etc/passwd',
      'far_table ',
      ' far_table',
      'FAR_TABLE',
      '',
    ];
    for (const name of attempts) {
      expect(isExternalTable(name), name).toBe(false);
    }
  });
});

describe('fieldsByColumn', () => {
  const info: TableInfo = {
    entityId: 'e1',
    tableName: 'issue_row',
    label: 'Issue 항목',
    fields: [
      { id: 'f1', column: 'issue_id', label: 'Issue', type: 'TEXT', required: true },
      { id: 'f2', column: 'fail_mode', label: '불량 모드', type: 'TEXT', required: false },
    ],
  };

  it('칸 이름으로 설계 정보를 찾는다', () => {
    const map = fieldsByColumn(info);
    expect(map.get('fail_mode')?.id).toBe('f2');
    expect(map.get('issue_id')?.required).toBe(true);
  });

  it('설계에 없는 칸은 찾히지 않는다 — 조회 조건이 여기서 걸러진다', () => {
    const map = fieldsByColumn(info);
    // 바깥에서 아무 이름이나 보내도 fieldId를 얻지 못하면 SQL까지 가지 못한다.
    expect(map.get('nonexistent')).toBeUndefined();
    expect(map.get('id')).toBeUndefined();
    expect(map.get('created_at')).toBeUndefined();
  });
});
