import { describe, expect, it } from 'vitest';
import {
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
  it('20종을 5개 분류에 4종씩 제공한다', () => {
    expect(THEMES).toHaveLength(20);
    expect(THEME_CATEGORIES).toHaveLength(5);
    for (const { category, themes } of THEMES_BY_CATEGORY) {
      expect(themes.length, `${category} 분류`).toBe(4);
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
    expect(THEME_CSS.match(/html\[data-theme=/g)).toHaveLength(20);
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
