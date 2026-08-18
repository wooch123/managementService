/**
 * 게시판 본문용 최소 마크다운 파서.
 *
 * WHY 직접 만들었나: 마크다운 라이브러리를 새로 들이려면 스택 추가 승인이 필요하고(CLAUDE.md §2),
 * HTML 문자열을 만들어 dangerouslySetInnerHTML로 꽂는 방식은 방문자가 글을 쓰는 게시판에서
 * 그대로 XSS 경로가 된다. 여기서는 문자열을 토큰 트리로만 바꾸고 렌더는 React 엘리먼트로 한다 —
 * 본문에 <script>가 들어와도 화면에는 그냥 그 글자가 보인다.
 *
 * 지원 문법: 제목(#, ##, ###) / 굵게 / 기울임 / 인라인 코드 / 링크 / 목록(-, 1.) /
 *            인용(>) / 코드블록(```) / 구분선(---)
 */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: MdInline[] }
  | { kind: 'paragraph'; inline: MdInline[] }
  | { kind: 'list'; ordered: boolean; items: MdInline[][] }
  | { kind: 'quote'; inline: MdInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' };

/** javascript:, data: 같은 스킴은 링크로 만들지 않는다(클릭 시 코드가 실행될 수 있다). */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href; // 사이트 내부 경로
  return null;
}

// 그룹 순서: 1=굵게, 2=기울임, 3=코드, 4=링크 텍스트, 5=링크 주소.
// 이름 있는 캡처 그룹은 이 프로젝트의 tsconfig target(ES2017)에서 못 쓴다 — 번호로 받는다.
const INLINE_PATTERN = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: src.slice(last, at) });
    const [, strong, em, code, linkText, href] = m;
    if (strong !== undefined) out.push({ kind: 'strong', text: strong });
    else if (em !== undefined) out.push({ kind: 'em', text: em });
    else if (code !== undefined) out.push({ kind: 'code', text: code });
    else if (linkText !== undefined && href !== undefined) {
      const safe = safeHref(href);
      // 허용되지 않는 스킴이면 링크로 만들지 않고 쓴 그대로 보여준다.
      if (safe) out.push({ kind: 'link', text: linkText, href: safe });
      else out.push({ kind: 'text', text: m[0] });
    }
    last = at + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out.length > 0 ? out : [{ kind: 'text', text: src }];
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'hr' });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        inline: parseInline(heading[2]),
      });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      i--; // 바깥 for가 다시 증가시킨다
      blocks.push({ kind: 'quote', inline: parseInline(quoted.join('\n')) });
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+\.\s+(.*)$/.exec(lines[i]) : /^\s*[-*]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      i--;
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** 목록 화면의 미리보기 문구 — 서식 기호를 걷어낸 순수 텍스트 한 줄. */
export function toPlainExcerpt(src: string, max = 90): string {
  const text = src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
