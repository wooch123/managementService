import { customAlphabet } from 'nanoid';

// 소문자+숫자만 사용하는 접미사 생성기 — 식별자 형식 규칙(소문자 시작 + 영숫자/밑줄)을
// 항상 만족해야 하므로 nanoid 기본 알파벳(대문자/하이픈 포함)을 쓰지 않는다.
const randomSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

/**
 * 이 파일은 순수 문자열 로직만 다루고 DB/비밀값에 접근하지 않는다. `src/types/entity.ts`(클라이언트
 * 폼 검증)와 `data-engine/ddl.ts`(서버 DDL) 양쪽에서 같은 검증 로직을 공유해야 하므로 의도적으로
 * `server-only`를 붙이지 않는다 — 붙이면 클라이언트 번들(FieldEditor의 실시간 예약어 검사)이 깨진다.
 */

/**
 * SQLite 키워드(전체는 아니고 실무에서 컬럼/테이블명으로 흔히 부딪히는 것 위주) +
 * §6.3의 암묵 컬럼(id/created_at/updated_at). 예약어는 대소문자 무관하게 차단한다.
 */
const SQLITE_KEYWORDS = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete', 'table', 'create', 'drop',
  'alter', 'index', 'unique', 'primary', 'key', 'foreign', 'references', 'not', 'null',
  'default', 'check', 'constraint', 'join', 'left', 'right', 'inner', 'outer', 'on',
  'and', 'or', 'as', 'order', 'by', 'group', 'having', 'limit', 'offset', 'values',
  'into', 'set', 'union', 'all', 'distinct', 'view', 'trigger', 'begin', 'end',
  'transaction', 'commit', 'rollback', 'pragma', 'exists', 'in', 'is', 'like', 'glob',
  'between', 'case', 'when', 'then', 'else', 'cast', 'collate', 'row', 'rowid',
]);

const IMPLICIT_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

const IDENTIFIER_FORMAT = /^[a-z][a-z0-9_]{0,62}$/;

/** 표시명(한글 포함 가능) → snake_case 물리 식별자. 라틴 문자가 하나도 안 남으면 임의 접미사로 대체한다. */
export function toSnakeCase(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (base.length === 0 || /^[0-9]/.test(base)) {
    return `f_${randomSuffix()}`;
  }
  return base;
}

export function isValidIdentifierFormat(name: string): boolean {
  return IDENTIFIER_FORMAT.test(name);
}

export function isReservedIdentifier(name: string): boolean {
  const lower = name.toLowerCase();
  return SQLITE_KEYWORDS.has(lower) || IMPLICIT_COLUMNS.has(lower);
}

/**
 * 식별자 화이트리스트 게이트. SQL 문자열에 삽입하기 전 거치는 유일한 관문이다 —
 * CLAUDE.md §4.1 "식별자 화이트리스트 + 파라미터 바인딩"의 식별자 축. 이 함수를 거치지
 * 않은 문자열은 어떤 DDL/DML 빌더에도 직접 연결하지 않는다.
 *
 * 예약어(isReservedIdentifier)는 *여기서* 막지 않는다 — id/created_at/updated_at은
 * 모든 테이블의 암묵 컬럼이라 쿼리 엔진이 항상 이 식별자들을 SELECT/ORDER BY 등에
 * 참조해야 하고, SQLite는 따옴표로 감싼 식별자를 키워드와 충돌 없이 허용한다. 형식
 * 검사(영소문자 시작 + 영숫자/밑줄)만으로 SQL 인젝션 방지에는 충분하다. 예약어 차단은
 * "관리자가 새 필드명으로 이 이름을 쓰지 못하게" 하는 입력 검증 목적이며 entity.ts의
 * zod 스키마와 FieldEditor의 실시간 검사에서 별도로 수행한다.
 */
export function quoteIdent(name: string): string {
  if (!isValidIdentifierFormat(name)) {
    throw new Error(`유효하지 않은 식별자입니다: ${name}`);
  }
  return `"${name}"`;
}
