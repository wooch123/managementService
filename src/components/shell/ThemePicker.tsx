'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, Monitor, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import {
  THEMES_BY_CATEGORY,
  THEME_STORAGE_KEY,
  getTheme,
  type ThemeDef,
} from '@/lib/theme/palettes';
import { cn } from '@/lib/utils';

/**
 * 테마 선택 버튼 — 사이드바 푸터 바로 위에 놓인다.
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip="테마 변경"
              className="group-data-[collapsible=icon]:justify-center"
            >
              <Palette className="size-4 shrink-0" />
              <span className="sidebar-fade">테마</span>
              <span className="sidebar-fade ml-auto truncate text-xs text-muted-foreground">
                {activeLabel}
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="top" className="max-h-[70vh] w-64 overflow-y-auto">
            <DropdownMenuItem onSelect={useSystem}>
              <Monitor className="size-4" />
              시스템 설정 따르기
              {mounted && current === null && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>

            {THEMES_BY_CATEGORY.map(({ category, themes }) => (
              <div key={category}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">{category}</DropdownMenuLabel>
                {themes.map((def) => (
                  <DropdownMenuItem key={def.id} onSelect={() => apply(def)}>
                    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
                      {def.swatch.map((color, i) => (
                        <span
                          key={i}
                          className={cn(
                            'size-3 rounded-full border border-black/10',
                            i > 0 && '-ml-1.5'
                          )}
                          style={{ background: color }}
                        />
                      ))}
                    </span>
                    <span className="truncate">{def.label}</span>
                    {mounted && current === def.id && <Check className="ml-auto size-4 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
