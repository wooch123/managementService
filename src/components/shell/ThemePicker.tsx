'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, Monitor, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  LISTED_THEMES,
  THEME_STORAGE_KEY,
  getTheme,
  type ThemeDef,
} from '@/lib/theme/palettes';
import { cn } from '@/lib/utils';

/**
 * 테마 선택 버튼 — 헤더 오른쪽 끝에 놓인다(사용자 지정, 2026-08-29).
 *
 * 예전에는 사이드바 푸터 위에 있었는데, 사이드바를 접으면 아이콘만 남고 지금 무슨 테마인지도
 * 알 수 없었다. 헤더는 어느 화면에서도 같은 자리에 있고 접히지 않는다.
 *
 * 팔레트(색 묶음)는 `<html data-theme>`로, 밝기 모드(dark 클래스)는 next-themes로 다룬다.
 * 두 개를 나눠 둔 이유: `dark` 클래스는 Tailwind의 dark: 변형과 shadcn 컴포넌트가 이미 쓰고 있어
 * 그대로 두는 편이 안전하고, 팔레트는 그 위에 색 변수만 덮어쓰면 되기 때문이다.
 *
 * 선택값은 localStorage에 둔다 — 설계 데이터가 아니라 보는 사람의 화면 취향이다(CLAUDE.md §4.2 예외).
 */
export function ThemePicker() {
  const { setTheme } = useTheme();
  const [current, setCurrent] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setCurrent(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      // 저장소를 막아둔 브라우저 — 기본 테마로 동작한다
    }
  }, []);

  function apply(def: ThemeDef) {
    document.documentElement.setAttribute('data-theme', def.id);
    setTheme(def.isDark ? 'dark' : 'light');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, def.id);
    } catch {
      /* 저장 실패해도 이번 세션에는 적용된 상태다 */
    }
    setCurrent(def.id);
  }

  function useSystem() {
    document.documentElement.removeAttribute('data-theme');
    setTheme('system');
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* 무시 */
    }
    setCurrent(null);
  }

  const activeLabel = mounted ? (getTheme(current)?.label ?? '시스템 설정') : '테마';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" title={`테마 변경 — 지금 ${activeLabel}`}>
          <Palette className="size-4 shrink-0" />
          {/* 좁은 화면에서는 아이콘만 남긴다 — 헤더에서 이름표는 가장 먼저 접어도 되는 것이다. */}
          <span className="hidden max-w-28 truncate text-xs text-muted-foreground sm:inline">{activeLabel}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={useSystem}>
          <Monitor className="size-4" />
          시스템 설정 따르기
          {mounted && current === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* 분류 이름 없이 한 줄로 늘어놓는다 — 넷을 다섯 갈래로 나눠 보여 줄 이유가 없다. */}
        {LISTED_THEMES.map((def) => (
          <DropdownMenuItem key={def.id} onSelect={() => apply(def)}>
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
              {def.swatch.map((color, i) => (
                <span
                  key={i}
                  className={cn('size-3 rounded-full border border-black/10', i > 0 && '-ml-1.5')}
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="truncate">{def.label}</span>
            {mounted && current === def.id && <Check className="ml-auto size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
