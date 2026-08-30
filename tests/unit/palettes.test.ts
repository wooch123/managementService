import { describe, expect, it } from 'vitest';
import {
  LISTED_THEMES,
  THEMES,
  THEMES_BY_CATEGORY,
  THEME_CATEGORIES,
  THEME_CSS,
  getTheme,
} from '@/lib/theme/palettes';

const REQUIRED_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--primary',
  '--primary-foreground',
  '--muted-foreground',
  '--border',
  '--ring',
  '--sidebar',
  '--chart-1',
  '--chart-5',
  '--app-sheen',
];

describe('테마 팔레트', () => {
  it('22종을 5개 분류로 나눠 제공한다 — 그레이만 6종이다', () => {
    expect(THEMES).toHaveLength(22);
    expect(THEME_CATEGORIES).toHaveLength(5);
    // 눈이 덜 부신 밝은 테마 둘(소프트 그레이·소프트 샌드)이 그레이에 더해졌다.
    const counts = Object.fromEntries(THEMES_BY_CATEGORY.map(({ category, themes }) => [category, themes.length]));
    expect(counts).toEqual({ 다크: 4, 그레이: 6, 라이트: 4, 메탈릭: 4, 모던: 4 });
  });

  /**
   * 고르는 자리에는 넷만 내놓는다(사용자 지정) — 나머지는 감출 뿐 지우지 않는다.
   *
   * 감춘 테마의 정의와 CSS가 남아 있어야, 이미 그 테마를 골라 둔 사람의 화면이 다음 접속에
   * 말없이 다른 색으로 바뀌지 않는다(CSS가 스물둘 그대로인 것은 아래 규칙 시험이 지킨다).
   */
  it('고르는 목록은 넷뿐이다 — 감춘 테마는 정의만 남는다', () => {
    expect(LISTED_THEMES.map((t) => t.id)).toEqual(['classic', 'indigo', 'graphite', 'titanium']);
    // 밝은 것 둘 → 어두운 것 둘. 분류 이름이 사라진 자리에서 그 정도 묶음은 있어야 읽힌다.
    expect(LISTED_THEMES.map((t) => t.isDark)).toEqual([false, false, true, true]);
    // 감춘 것은 목록에서만 빠진다 — 팔레트 자체는 그대로다.
    expect(THEMES.length).toBeGreaterThan(LISTED_THEMES.length);
  });

  /**
   * 면을 내린 밝은 테마(dim)는 **밝기만** 내려가야 한다 — 글자까지 함께 흐려지면
   * '눈이 덜 아픈 테마'가 아니라 그냥 읽기 힘든 테마가 된다.
   */
  it('내려앉은 밝은 테마도 글자와 면의 밝기 차를 지킨다', () => {
    const L = (v: string) => Number(/oklch\(([\d.]+)/.exec(v)?.[1] ?? NaN);
    const base = THEMES.find((x) => x.id === 'slate')!;
    for (const id of ['soft-gray', 'soft-sand']) {
      const t = THEMES.find((x) => x.id === id)!;
      // 면은 실제로 내려갔다.
      expect(L(t.tokens['--card']), `${id} 카드`).toBeLessThan(L(base.tokens['--card']));
      expect(L(t.tokens['--background']), `${id} 바탕`).toBeLessThan(L(base.tokens['--background']));
      // 그런데 글자와의 밝기 차는 원래 테마보다 좁아지지 않았다.
      const gap = L(t.tokens['--card']) - L(t.tokens['--card-foreground']);
      const baseGap = L(base.tokens['--card']) - L(base.tokens['--card-foreground']);
      expect(gap, `${id} 글자 대비`).toBeGreaterThan(baseGap - 0.02);
      // 카드가 바탕보다 밝아 면이 떠 보인다.
      expect(L(t.tokens['--card']), `${id} 카드가 바탕보다 밝다`).toBeGreaterThan(L(t.tokens['--background']));
    }
  });

  it('id가 서로 겹치지 않는다', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it('모든 테마가 필요한 토큰을 빠짐없이 갖는다', () => {
    for (const t of THEMES) {
      for (const key of REQUIRED_TOKENS) {
        expect(t.tokens[key], `${t.id}의 ${key}`).toBeTruthy();
      }
      expect(Object.keys(t.tokens).filter((k) => k.startsWith('--chart-'))).toHaveLength(5);
    }
  });

  it('메탈릭만 배경 결(그라데이션)을 갖고 나머지는 none이다', () => {
    for (const t of THEMES) {
      if (t.category === '메탈릭') expect(t.tokens['--app-sheen']).toContain('linear-gradient');
      else expect(t.tokens['--app-sheen']).toBe('none');
    }
  });

  it('다크 계열은 배경이 어둡고 라이트 계열은 밝다', () => {
    const lightness = (v: string) => Number(/oklch\(([\d.]+)/.exec(v)?.[1] ?? NaN);
    for (const t of THEMES) {
      const l = lightness(t.tokens['--background']);
      if (t.isDark) expect(l, `${t.id} 배경 밝기`).toBeLessThan(0.35);
      else expect(l, `${t.id} 배경 밝기`).toBeGreaterThan(0.9);
    }
  });

  it('CSS는 테마마다 html[data-theme] 규칙을 하나씩 만든다', () => {
    for (const t of THEMES) {
      expect(THEME_CSS).toContain(`html[data-theme="${t.id}"]`);
    }
    expect(THEME_CSS.match(/html\[data-theme=/g)).toHaveLength(22);
  });

  it('getTheme은 없는 id에 undefined를 돌려준다', () => {
    expect(getTheme('midnight')?.label).toBe('미드나이트');
    expect(getTheme('없는테마')).toBeUndefined();
    expect(getTheme(null)).toBeUndefined();
  });

  it('미리보기 색 3개(배경·강조·카드)를 갖는다', () => {
    for (const t of THEMES) {
      expect(t.swatch).toHaveLength(3);
      expect(t.swatch[0]).toBe(t.tokens['--background']);
      expect(t.swatch[1]).toBe(t.tokens['--primary']);
    }
  });
});
