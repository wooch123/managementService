'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

/**
 * 지금 누구로 보고 있는지 — 헤더 오른쪽 끝(사용자 지정, 2026-08-29).
 *
 * 예전에는 사이드바 맨 아래에 있었다. 그 자리는 사이드바를 접으면 아바타 한 글자만 남고,
 * 화면 왼쪽 밑이라 눈이 가장 늦게 닿는 곳이다. 로그아웃처럼 계정에 대한 일은 헤더 오른쪽에
 * 모여 있는 편이 익숙하다.
 *
 * 운영 화면은 로그인 없이 보는 곳이라 이름이 없다 — 그때는 '방문자'로 두고 메뉴에는 지금 상태만
 * 적는다(누를 것이 없는 메뉴를 열어 두면 눌러도 아무 일이 없는 것처럼 보인다).
 */
export function UserMenu({ username, mode }: { username?: string; mode: 'admin' | 'public' }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = username ?? '방문자';

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" title={displayName}>
          {/* 이름이 있을 때만 머리글자를 띄운다 — '방문자' 옆의 '방'은 이름을 두 번 적는 셈이다. */}
          {username ? (
            <Avatar size="sm" className="size-6 shrink-0">
              <AvatarFallback className="text-[10px]">{username.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          ) : (
            <User className="size-4 shrink-0 text-muted-foreground" />
          )}
          {/* 좁은 화면에서는 아바타만 남긴다. */}
          <span className="hidden max-w-24 truncate text-xs sm:inline">{displayName}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>{displayName}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {mode === 'admin' ? '관리자로 로그인됨' : '로그인 없이 보는 중'}
          </span>
        </DropdownMenuLabel>
        {mode === 'admin' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={loggingOut} onSelect={handleLogout}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
