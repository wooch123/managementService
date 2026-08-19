/**
 * 상태 표현의 색 의미를 한 곳에 모은다.
 *
 * 청사진 검토(REVIEW.md "공통 레이아웃 청사진")의 요구는 "정보·주의·위험·완료를 **같은 색 의미로**
 * 유지한다"는 것이다. 화면마다 상태 낱말이 다른데(접수/배정/분석중/보류/완료/반려/지연/열림…)
 * 컴포넌트마다 제 나름의 색을 고르면 같은 뜻이 화면마다 다른 색으로 보인다. 규칙은 여기 한 곳에 둔다.
 *
 * 색은 KPI 증감 표시(catalog/data-display.tsx)와 같은 방식으로 Tailwind 팔레트를 직접 쓴다 —
 * 테마 토큰(--chart-*)은 계열 구분용이라 5색뿐이고, 상태 배지는 밝은 배경 + 진한 글자라는
 * 다른 규격이 필요하다. 다크 모드 대비는 각 항목에서 함께 지정한다.
 */

export type StatusTone = 'good' | 'info' | 'warn' | 'bad' | 'accent' | 'neutral';

/** 낱말 → 톤. 위에서부터 먼저 걸리는 규칙을 쓴다(지연·긴급이 진행중보다 앞선다). */
const RULES: ReadonlyArray<readonly [RegExp, StatusTone]> = [
  [/지연|긴급|위험|반려|취소|실패|Critical|초과|미배정|열림/i, 'bad'],
  [/보류|대기|검토|확인 필요|주의|Major|경고|반입/, 'warn'],
  [/완료|종결|승인|해결|정상|양호|달성/, 'good'],
  [/접수|신규|의뢰|초안|등록|배정/, 'accent'],
  [/분석중|진행|작업중|반출|처리중|검사중/, 'info'],
];

export function statusTone(value: string): StatusTone {
  const text = value.trim();
  if (!text) return 'neutral';
  for (const [pattern, tone] of RULES) {
    if (pattern.test(text)) return tone;
  }
  return 'neutral';
}

export const TONE_CLASS: Record<StatusTone, string> = {
  good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  bad: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  accent: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  neutral: 'bg-muted text-muted-foreground',
};

/** 상태 배지 한 개의 클래스(모양 + 톤). 컴포넌트들이 같은 크기·모서리를 쓰게 한다. */
export function statusBadgeClass(value: string): string {
  return `inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ${TONE_CLASS[statusTone(value)]}`;
}
