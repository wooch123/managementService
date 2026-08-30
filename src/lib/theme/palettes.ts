/**
 * 테마 팔레트 22종 (다크 · 라이트 · 메탈릭 · 모던 각 4종, 그레이 6종).
 *
 * 색은 모두 oklch로 만든다 — 밝기(L)를 고정한 채 색상(H)만 돌리면 어떤 계열을 골라도 대비가
 * 흔들리지 않기 때문이다. 그래서 팔레트마다 색을 손으로 찍지 않고, 아래 build()가 기준 색상·채도
 * 하나에서 토큰 전체(배경·카드·글자·강조·경계·차트 5색·사이드바)를 파생시킨다.
 *
 * 적용 방식: `<html data-theme="...">`에 붙는 CSS 변수 묶음이다. globals.css의 :root/.dark가 깔아둔
 * 기본값을 덮어쓰며, 다크 계열 테마는 next-themes가 붙이는 `dark` 클래스와 함께 쓰인다.
 */

export const THEME_CATEGORIES = ['다크', '그레이', '라이트', '메탈릭', '모던'] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

export type ThemeDef = {
  id: string;
  label: string;
  category: ThemeCategory;
  isDark: boolean;
  /** 목록에서 보여줄 미리보기 색 3개(배경 · 강조 · 카드). */
  swatch: [string, string, string];
  tokens: Record<string, string>;
};

type Spec = {
  id: string;
  label: string;
  category: ThemeCategory;
  mode: 'light' | 'dark';
  /** 기준 색상(0~360). */
  hue: number;
  /** 기준 채도. 0에 가까울수록 무채색. */
  chroma: number;
  /** 메탈릭 계열의 은은한 그라데이션(배경에 깔린다). */
  sheen?: string;
  /**
   * **밝은 테마의 면을 이만큼 내린다**(0이면 지금까지와 같다).
   *
   * 흰 바탕을 오래 보면 눈이 아프다는 요청에서 왔다. 흰색을 그냥 회색으로 바꾸면 글자 대비까지
   * 함께 떨어지므로, 면을 내리는 만큼 글자·경계도 함께 진하게 당긴다 — 밝기만 낮추고 **읽히는
   * 정도는 유지**하는 것이 이 값이 하는 일이다. 어두운 테마에는 쓰지 않는다.
   */
  dim?: number;
};

const ok = (l: number, c: number, h: number) => `oklch(${+l.toFixed(3)} ${+c.toFixed(3)} ${h})`;

/** 차트 5색 — 기준 색상에서 좌우로 벌려 잡아 계열 안에서 서로 구분되게 한다. */
function chartColors(hue: number, chroma: number, mode: 'light' | 'dark', dim = 0) {
  const l = mode === 'dark' ? 0.72 : 0.6 - dim * 0.4;
  const c = Math.max(0.09, chroma * 1.6);
  const hues = [hue, (hue + 45) % 360, (hue + 315) % 360, (hue + 90) % 360, (hue + 270) % 360];
  return hues.map((h, i) => ok(l - i * 0.03, c - i * 0.008, h));
}

function build(spec: Spec): ThemeDef {
  const { hue: h, chroma: c, mode } = spec;
  const charts = chartColors(h, c, mode, spec.dim ?? 0);

  /**
   * 면은 내리고(-d) 글자는 함께 진하게 당긴다(-d × 계수).
   *
   * 밝기만 내리면 대비가 같이 떨어져 "어둡고 흐릿한" 화면이 된다. 내려간 면 위에서도 같은
   * 정도로 읽히도록 글자·경계를 반대 방향으로 옮기는 것이 요령이다. d=0이면 아래 식이 전부
   * 원래 값으로 돌아가므로 기존 테마 20종은 한 톨도 바뀌지 않는다.
   */
  const d = mode === 'light' ? (spec.dim ?? 0) : 0;

  const tokens: Record<string, string> =
    mode === 'light'
      ? {
          '--background': ok(0.985 - d, c * 0.12, h),
          '--foreground': ok(0.22 - d * 0.75, c * 0.35, h),
          // 카드는 바탕보다 늘 한 뼘 밝다 — 내려앉아도 면이 떠 보여야 배치가 읽힌다.
          '--card': ok(1 - d * 0.8, c * 0.04, h),
          '--card-foreground': ok(0.22 - d * 0.75, c * 0.35, h),
          '--popover': ok(1 - d * 0.8, c * 0.04, h),
          '--popover-foreground': ok(0.22 - d * 0.75, c * 0.35, h),
          '--primary': ok(0.55 - d * 0.35, c, h),
          '--primary-foreground': ok(0.99, 0, h),
          '--secondary': ok(0.955 - d * 0.9, c * 0.25, h),
          '--secondary-foreground': ok(0.36 - d * 0.4, c * 0.6, h),
          '--muted': ok(0.962 - d * 0.9, c * 0.16, h),
          '--muted-foreground': ok(0.55 - d * 0.9, c * 0.2, h),
          '--accent': ok(0.94 - d * 0.85, c * 0.3, h),
          '--accent-foreground': ok(0.33 - d * 0.4, c * 0.6, h),
          '--destructive': 'oklch(0.577 0.245 27.325)',
          '--border': ok(0.918 - d * 0.8, c * 0.16, h),
          '--input': ok(0.9 - d * 0.8, c * 0.18, h),
          '--ring': ok(0.62 - d * 0.35, c * 0.8, h),
          '--sidebar': ok(0.995 - d * 0.85, c * 0.06, h),
          '--sidebar-foreground': ok(0.22 - d * 0.75, c * 0.35, h),
          '--sidebar-primary': ok(0.55 - d * 0.35, c, h),
          '--sidebar-primary-foreground': ok(0.99, 0, h),
          '--sidebar-accent': ok(0.945 - d * 0.85, c * 0.3, h),
          '--sidebar-accent-foreground': ok(0.33 - d * 0.4, c * 0.6, h),
          '--sidebar-border': ok(0.918 - d * 0.8, c * 0.16, h),
          '--sidebar-ring': ok(0.62 - d * 0.35, c * 0.8, h),
        }
      : {
          '--background': ok(0.17, c * 0.28, h),
          '--foreground': ok(0.97, c * 0.05, h),
          '--card': ok(0.225, c * 0.3, h),
          '--card-foreground': ok(0.97, c * 0.05, h),
          '--popover': ok(0.225, c * 0.3, h),
          '--popover-foreground': ok(0.97, c * 0.05, h),
          '--primary': ok(0.72, c, h),
          '--primary-foreground': ok(0.18, c * 0.4, h),
          '--secondary': ok(0.29, c * 0.28, h),
          '--secondary-foreground': ok(0.96, c * 0.06, h),
          '--muted': ok(0.29, c * 0.24, h),
          '--muted-foreground': ok(0.73, c * 0.1, h),
          '--accent': ok(0.34, c * 0.32, h),
          '--accent-foreground': ok(0.97, c * 0.06, h),
          '--destructive': 'oklch(0.704 0.191 22.216)',
          '--border': 'oklch(1 0 0 / 12%)',
          '--input': 'oklch(1 0 0 / 16%)',
          '--ring': ok(0.68, c * 0.9, h),
          '--sidebar': ok(0.2, c * 0.3, h),
          '--sidebar-foreground': ok(0.97, c * 0.05, h),
          '--sidebar-primary': ok(0.72, c, h),
          '--sidebar-primary-foreground': ok(0.18, c * 0.4, h),
          '--sidebar-accent': ok(0.3, c * 0.32, h),
          '--sidebar-accent-foreground': ok(0.97, c * 0.06, h),
          '--sidebar-border': 'oklch(1 0 0 / 12%)',
          '--sidebar-ring': ok(0.68, c * 0.9, h),
        };

  charts.forEach((color, i) => {
    tokens[`--chart-${i + 1}`] = color;
  });
  // 메탈릭만 배경에 결이 들어간다. 나머지는 none으로 명시해 테마를 바꿔도 잔상이 남지 않게 한다.
  tokens['--app-sheen'] = spec.sheen ?? 'none';

  return {
    id: spec.id,
    label: spec.label,
    category: spec.category,
    isDark: mode === 'dark',
    swatch: [tokens['--background'], tokens['--primary'], tokens['--card']],
    tokens,
  };
}

/** 금속 느낌의 결 — 밝은 띠와 어두운 띠를 비스듬히 겹친다. */
const metalSheen = (h: number, dark: boolean) =>
  dark
    ? `linear-gradient(135deg, ${ok(0.26, 0.012, h)} 0%, ${ok(0.19, 0.01, h)} 38%, ${ok(0.24, 0.014, h)} 62%, ${ok(0.18, 0.008, h)} 100%)`
    : `linear-gradient(135deg, ${ok(0.995, 0.006, h)} 0%, ${ok(0.955, 0.01, h)} 38%, ${ok(0.985, 0.008, h)} 62%, ${ok(0.945, 0.012, h)} 100%)`;

const SPECS: Spec[] = [
  // ── 다크 ──
  { id: 'midnight', label: '미드나이트', category: '다크', mode: 'dark', hue: 275, chroma: 0.12 },
  { id: 'deep-ocean', label: '딥오션', category: '다크', mode: 'dark', hue: 225, chroma: 0.11 },
  { id: 'forest-night', label: '포레스트', category: '다크', mode: 'dark', hue: 155, chroma: 0.1 },
  { id: 'plum-dark', label: '플럼', category: '다크', mode: 'dark', hue: 330, chroma: 0.11 },

  // ── 그레이 ──
  { id: 'slate', label: '슬레이트', category: '그레이', mode: 'light', hue: 250, chroma: 0.014 },
  { id: 'stone', label: '스톤', category: '그레이', mode: 'light', hue: 70, chroma: 0.012 },
  { id: 'graphite', label: '그래파이트', category: '그레이', mode: 'dark', hue: 250, chroma: 0.012 },
  { id: 'ash', label: '애쉬', category: '그레이', mode: 'dark', hue: 90, chroma: 0.008 },
  /**
   * 흰 바탕이 눈에 부담이라는 요청으로 더한 둘(2026-08-29). 밝은 테마이되 면이 한 단계 내려앉아
   * 종이에 가깝다 — 어두운 테마로 가지 않고도 화면이 덜 쏜다. 둘의 차이는 회색의 온도뿐이라
   * 차가운 쪽·따뜻한 쪽 중 눈에 편한 것을 고르면 된다.
   */
  { id: 'soft-gray', label: '소프트 그레이', category: '그레이', mode: 'light', hue: 250, chroma: 0.012, dim: 0.075 },
  { id: 'soft-sand', label: '소프트 샌드', category: '그레이', mode: 'light', hue: 75, chroma: 0.014, dim: 0.075 },

  // ── 라이트 ──
  { id: 'classic', label: '클래식', category: '라이트', mode: 'light', hue: 260, chroma: 0.005 },
  { id: 'sky', label: '스카이', category: '라이트', mode: 'light', hue: 235, chroma: 0.07 },
  { id: 'mint', label: '민트', category: '라이트', mode: 'light', hue: 165, chroma: 0.07 },
  { id: 'lavender', label: '라벤더', category: '라이트', mode: 'light', hue: 295, chroma: 0.07 },

  // ── 메탈릭 ──
  { id: 'silver', label: '실버', category: '메탈릭', mode: 'light', hue: 245, chroma: 0.01, sheen: metalSheen(245, false) },
  { id: 'bronze', label: '브론즈', category: '메탈릭', mode: 'light', hue: 55, chroma: 0.022, sheen: metalSheen(55, false) },
  { id: 'titanium', label: '티타늄', category: '메탈릭', mode: 'dark', hue: 230, chroma: 0.012, sheen: metalSheen(230, true) },
  { id: 'gunmetal', label: '건메탈', category: '메탈릭', mode: 'dark', hue: 200, chroma: 0.016, sheen: metalSheen(200, true) },

  // ── 모던 ──
  { id: 'indigo', label: '인디고', category: '모던', mode: 'light', hue: 272, chroma: 0.16 },
  { id: 'emerald', label: '에메랄드', category: '모던', mode: 'light', hue: 158, chroma: 0.14 },
  { id: 'cobalt', label: '코발트', category: '모던', mode: 'dark', hue: 250, chroma: 0.16 },
  { id: 'coral', label: '코랄', category: '모던', mode: 'light', hue: 25, chroma: 0.15 },
];

export const THEMES: ThemeDef[] = SPECS.map(build);

export const THEMES_BY_CATEGORY: { category: ThemeCategory; themes: ThemeDef[] }[] = THEME_CATEGORIES.map(
  (category) => ({ category, themes: THEMES.filter((t) => t.category === category) })
);

/**
 * 고르는 자리에 **내놓을** 테마 — 넷만 남긴다(사용자 지정, 2026-08-30).
 *
 * 스물두 종을 다섯 분류로 늘어놓으니 고르는 일이 오히려 일이 됐다. 실제로 쓰이는 것은
 * 밝은 둘과 어두운 둘이라 그것만 내놓고 나머지는 감춘다. 분류 이름도 함께 감춘다 — 넷을
 * 다섯 갈래로 나눠 보여 줄 이유가 없다.
 *
 * **지우지는 않는다.** 감춘 테마의 정의와 CSS는 그대로 둔다 — 이미 그 테마를 골라 둔 사람의
 * 브라우저에는 그 이름이 저장되어 있고, 정의를 지우면 그 화면이 다음 접속에 말없이 다른 색으로
 * 바뀐다. 감춘 테마를 쓰던 사람은 계속 그대로 보되, 다시 고를 수는 없다.
 *
 * 차례는 밝은 것 → 어두운 것이다. 분류 이름이 사라진 자리에서 그 정도 묶음은 있어야 읽힌다.
 */
const LISTED_THEME_IDS = ['classic', 'indigo', 'graphite', 'titanium'] as const;

export const LISTED_THEMES: ThemeDef[] = LISTED_THEME_IDS.map((id) => {
  const def = THEMES.find((t) => t.id === id);
  // 목록에 적어 둔 이름이 팔레트에서 사라지면 조용히 빈 목록이 되는 대신 여기서 멈춘다.
  if (!def) throw new Error(`목록에 내놓을 테마를 찾지 못했습니다: ${id}`);
  return def;
});

export function getTheme(id: string | null | undefined): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * 모든 테마의 CSS 규칙.
 *
 * `html[data-theme]`로 잡는 이유: globals.css의 `:root`·`.dark`와 명시도가 같으면 파일 순서에
 * 따라 이겼다 졌다 하기 때문이다. 태그 선택자를 하나 더해 항상 테마가 이기게 한다.
 */
export const THEME_CSS = THEMES.map(
  (t) =>
    `html[data-theme="${t.id}"]{${Object.entries(t.tokens)
      .map(([k, v]) => `${k}:${v}`)
      .join(';')}}`
).join('\n');

/** 첫 페인트 전에 저장된 테마를 붙여 깜빡임을 없앤다(next-themes가 dark 클래스를 다루는 것과 같은 방식). */
export const THEME_STORAGE_KEY = 'webapp-v1-theme';
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`;
