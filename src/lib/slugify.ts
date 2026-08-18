import { customAlphabet } from 'nanoid';

// 소문자+숫자만 사용하는 접미사 생성기 — nanoid 기본 알파벳(대문자 포함)은 slug 형식
// 규칙(소문자/숫자/하이픈)을 어길 수 있어 쓰지 않는다.
const randomSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

/**
 * 표시명(한글 포함 가능) → URL/식별자용 slug.
 * 라틴 문자가 하나도 남지 않으면(순수 한글 제목 등) 짧은 임의 접미사로 대체한다.
 */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (base.length === 0) return `page-${randomSuffix()}`;
  return base;
}

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_FORMAT.test(slug);
}
