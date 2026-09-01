import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSqliteDb } from '@/lib/db/assert-db';

/**
 * DB 파일 검사.
 *
 * 이 검사가 없으면 SQLite가 **말없이 빈 DB를 만들고**, 그다음부터 모든 질의가
 * `The table 'main.Revision' does not exist`로 깨진다. 원인이 Prisma처럼 보이는 데다
 * 남겨진 0바이트 파일 때문에 다음 실행도 계속 실패한다 — 실제로 보고된 고장이다.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-db-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const at = (name: string) => path.join(dir, name);

describe('assertSqliteDb', () => {
  it('진짜 SQLite 파일은 통과시킨다', () => {
    const file = at('ok.db');
    fs.writeFileSync(file, Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(100)]));
    expect(() => assertSqliteDb(file, 'meta')).not.toThrow();
  });

  it('파일이 없으면 막는다 — 여기서 막지 않으면 빈 DB가 생긴다', () => {
    expect(() => assertSqliteDb(at('없다.db'), 'meta')).toThrow(/파일이 없습니다/);
  });

  it('0바이트 파일을 정상으로 보지 않는다', () => {
    // 앞선 실행이 남긴 빈 파일. "있으니 통과"로 두면 고장이 계속된다.
    const file = at('empty.db');
    fs.writeFileSync(file, '');
    expect(() => assertSqliteDb(file, 'meta')).toThrow(/비어 있습니다\(0바이트\)/);
  });

  it('SQLite가 아닌 파일을 막는다', () => {
    const file = at('not-a-db.db');
    fs.writeFileSync(file, 'This is just text, not a database at all.');
    expect(() => assertSqliteDb(file, 'meta')).toThrow(/SQLite 파일이 아닙니다/);
  });

  it('머리글보다 짧은 파일도 막는다', () => {
    const file = at('tiny.db');
    fs.writeFileSync(file, 'SQLite');
    expect(() => assertSqliteDb(file, 'meta')).toThrow(/SQLite 파일이 아닙니다/);
  });

  it('폴더를 가리키면 막는다', () => {
    const sub = at('adir.db');
    fs.mkdirSync(sub);
    expect(() => assertSqliteDb(sub, 'meta')).toThrow(/파일이 아닙니다/);
  });

  it('어디를 보고 있는지와 실행 위치를 함께 알려 준다', () => {
    // 경로는 실행 위치 기준으로 풀리므로, 이 둘이 있어야 "엉뚱한 폴더에서 띄웠다"가 보인다.
    const file = at('gone.db');
    try {
      assertSqliteDb(file, 'meta');
      expect.unreachable('던졌어야 한다');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(file);
      expect(message).toContain(process.cwd());
    }
  });

  it('설계 DB와 업무 DB에 각각 맞는 되돌리는 법을 알려 준다', () => {
    expect(() => assertSqliteDb(at('x.db'), 'meta')).toThrow(/prisma\/meta\.db/);
    expect(() => assertSqliteDb(at('x.db'), 'app')).toThrow(/data\/app\.db/);
    expect(() => assertSqliteDb(at('x.db'), 'app')).toThrow(/pnpm db:init/);
  });
});
