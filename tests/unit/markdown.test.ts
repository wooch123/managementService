import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, toPlainExcerpt } from '@/lib/markdown';

describe('마크다운 파서 (게시판 본문)', () => {
  it('제목 · 문단 · 구분선을 블록으로 나눈다', () => {
    const blocks = parseMarkdown('# 제목\n\n본문입니다.\n\n---');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'hr']);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
  });

  it('굵게 · 기울임 · 인라인 코드를 구분한다', () => {
    const inline = parseInline('**굵게** 와 *기울임* 과 `code`');
    expect(inline.filter((n) => n.kind === 'strong')).toHaveLength(1);
    expect(inline.filter((n) => n.kind === 'em')).toHaveLength(1);
    expect(inline.filter((n) => n.kind === 'code')).toHaveLength(1);
  });

  it('http/내부 경로 링크만 링크로 만든다', () => {
    expect(parseInline('[사이트](https://example.com)')[0]).toMatchObject({
      kind: 'link',
      href: 'https://example.com',
    });
    expect(parseInline('[내부](/home/tips)')[0]).toMatchObject({ kind: 'link', href: '/home/tips' });
  });

  it('javascript: 스킴은 링크가 아니라 글자로 남긴다 (XSS 방지)', () => {
    const nodes = parseInline('[클릭](javascript:alert(1))');
    expect(nodes.every((n) => n.kind !== 'link')).toBe(true);
    expect(nodes.map((n) => ('text' in n ? n.text : '')).join('')).toContain('javascript:alert(1)');
  });

  it('HTML 태그를 그대로 텍스트로 다룬다', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks[0]).toMatchObject({ kind: 'paragraph' });
    const first = blocks[0];
    if (first.kind !== 'paragraph') throw new Error('문단이어야 한다');
    expect(first.inline.map((n) => ('text' in n ? n.text : '')).join('')).toContain('<script>');
  });

  it('목록과 코드블록을 인식한다', () => {
    const blocks = parseMarkdown('- 하나\n- 둘\n\n```\ncode line\n```');
    const list = blocks[0];
    if (list.kind !== 'list') throw new Error('목록이어야 한다');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ kind: 'code', text: 'code line' });
  });

  it('번호 목록은 ordered로 표시한다', () => {
    expect(parseMarkdown('1. 첫째\n2. 둘째')[0]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('인용문은 연속된 줄을 하나로 묶는다', () => {
    const blocks = parseMarkdown('> 한 줄\n> 두 줄\n\n다음 문단');
    expect(blocks.map((b) => b.kind)).toEqual(['quote', 'paragraph']);
  });

  it('목록 미리보기는 서식 기호를 걷어내고 길이를 자른다', () => {
    expect(toPlainExcerpt('# 제목\n**강조** 텍스트')).toBe('제목 강조 텍스트');
    expect(toPlainExcerpt('가'.repeat(200))).toHaveLength(91); // 90자 + 말줄임표
  });
});
