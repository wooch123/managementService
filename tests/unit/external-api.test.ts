import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_TABLES,
  DEDICATED_ENDPOINT,
  isExternalTable,
  fieldsByColumn,
  type TableInfo,
} from '@/lib/api/external-tables';
import { isPrivateAddress, externalSignals, requestBaseUrl } from '@/lib/api/internal-network';
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

describe('isPrivateAddress — 사내/바깥 가르기', () => {
  it('사설·루프백 대역을 사내로 본다', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.0.10',
      '192.168.123.45',
      '172.16.0.1',
      '172.31.255.254',
      '169.254.1.1',
      '::1',
      '::ffff:192.168.0.10', // IPv6로 감싼 IPv4
      'fd00::1',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('공인 주소를 사내로 착각하지 않는다', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '11.0.0.1', '193.168.0.1', '2606:4700::1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('172.16~31만 사설이다 — 경계를 넘기지 않는다', () => {
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.31.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
  });

  it('말이 안 되는 값은 공인으로 친다 — 애매하면 잠근다', () => {
    for (const bad of ['', 'localhost', 'not-an-ip', '999.999.999.999', '192.168.0', '192.168.0.1.5', '  ']) {
      expect(isPrivateAddress(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('사설처럼 보이려는 문자열에 속지 않는다', () => {
    // 앞자리가 같다고 사설이 아니다.
    expect(isPrivateAddress('127.0.0.1.evil.com')).toBe(false);
    expect(isPrivateAddress('10.0.0.1@8.8.8.8')).toBe(false);
    expect(isPrivateAddress('0x7f.0.0.1')).toBe(false);
  });
});

describe('externalSignals — 터널로 온 요청을 사내로 착각하지 않는다', () => {
  const h = (map: Record<string, string>) => new Headers(map);

  it('사내에서 직접 부른 모양이면 표식이 없다', () => {
    expect(externalSignals(h({ host: '192.168.0.50:3000' }))).toEqual([]);
    expect(externalSignals(h({ host: 'localhost:3000' }))).toEqual([]);
    expect(externalSignals(h({ host: '127.0.0.1:3000' }))).toEqual([]);
  });

  it('Cloudflare 헤더가 있으면 바깥으로 본다', () => {
    // 이게 이 기능의 핵심. cloudflared가 127.0.0.1로 넘기므로 IP로는 절대 가려낼 수 없다.
    expect(externalSignals(h({ host: '127.0.0.1:3000', 'cf-connecting-ip': '203.0.113.9' }))).toContain(
      'cf-connecting-ip'
    );
    expect(externalSignals(h({ host: '127.0.0.1:3000', 'cf-ray': '8abc123' }))).toContain('cf-ray');
    expect(externalSignals(h({ host: '127.0.0.1:3000', 'cf-ipcountry': 'KR' }))).toContain('cf-ipcountry');
  });

  it('공개 호스트 이름으로 부르면 표식이 없어도 바깥으로 본다', () => {
    // Cloudflare 헤더가 어떤 이유로 안 붙어도 두 번째 근거가 잡는다.
    expect(externalSignals(h({ host: 'demo.dove9999.com' }))).toContain('public-host');
    expect(externalSignals(h({ host: 'DEMO.DOVE9999.COM:443' }))).toContain('public-host');
  });

  it('공개 호스트 이름은 바꿔 줄 수 있다', () => {
    expect(externalSignals(h({ host: 'other.example.com' }), 'other.example.com')).toContain('public-host');
    expect(externalSignals(h({ host: 'demo.dove9999.com' }), 'other.example.com')).not.toContain('public-host');
  });

  it('x-forwarded-for의 첫 주소가 공인이면 바깥으로 본다', () => {
    expect(externalSignals(h({ host: '10.0.0.2:3000', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toContain(
      'forwarded-public-ip'
    );
    // 사내 프록시를 거친 경우는 사내 그대로.
    expect(externalSignals(h({ host: '10.0.0.2:3000', 'x-forwarded-for': '192.168.0.7' }))).toEqual([]);
  });

  it('헤더를 위조해도 느슨해지지 않는다 — 엄격해질 뿐이다', () => {
    // 사내인 척하려고 cf 헤더를 지우는 건 터널을 지나오는 이상 불가능하고,
    // 반대로 아무 헤더나 더 붙이면 바깥으로 분류될 뿐이다.
    const forged = externalSignals(h({ host: 'demo.dove9999.com', 'x-forwarded-for': '192.168.0.9' }));
    expect(forged).toContain('public-host');
    expect(forged.length).toBeGreaterThan(0);
  });
});

describe('requestBaseUrl — 문서에 적을 주소', () => {
  const h = (map: Record<string, string>) => new Headers(map);
  const FALLBACK = 'http://localhost:3000';

  it('부른 사람이 쓴 주소를 그대로 되살린다', () => {
    // 이게 틀리면 사내에서 받은 문서에 localhost가 적혀, 받은 사람이 자기 PC를 부르게 된다.
    expect(requestBaseUrl(h({ host: '192.168.45.182:3000' }), FALLBACK)).toBe('http://192.168.45.182:3000');
    expect(requestBaseUrl(h({ host: 'nas.office.local:3000' }), FALLBACK)).toBe('http://nas.office.local:3000');
  });

  it('터널을 지나온 요청은 https 공개 주소로 적는다', () => {
    expect(
      requestBaseUrl(h({ host: 'demo.dove9999.com', 'x-forwarded-proto': 'https' }), FALLBACK)
    ).toBe('https://demo.dove9999.com');
  });

  it('x-forwarded-proto가 여러 개면 첫 번째를 쓴다', () => {
    expect(requestBaseUrl(h({ host: 'a.example.com', 'x-forwarded-proto': 'https, http' }), FALLBACK)).toBe(
      'https://a.example.com'
    );
  });

  it('Host가 이상하면 물러난다 — 주소 자리에 아무 문자열이나 박히지 않게', () => {
    // 줄바꿈·한글이 든 Host는 여기 없다. Headers가 만들 때 거부하므로 함수까지 오지 못한다.
    for (const bad of ['', 'evil.com/path', 'a b', 'http://evil.com', 'a.com:999999']) {
      expect(requestBaseUrl(h(bad ? { host: bad } : {}), FALLBACK), JSON.stringify(bad)).toBe(FALLBACK);
    }
  });

  it('IPv6 주소도 받는다', () => {
    expect(requestBaseUrl(h({ host: '[fd00::1]:3000' }), FALLBACK)).toBe('http://[fd00::1]:3000');
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
