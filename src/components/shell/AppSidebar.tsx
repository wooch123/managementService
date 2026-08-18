'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, ChevronsUpDown, EyeOff, LayoutGrid, LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import type { PageTreeNode } from '@/lib/db/page-tree';

const APP_VERSION = 'v1.0.1';

export function AppSidebar({
  pages,
  mode,
  username,
}: {
  pages: PageTreeNode[];
  mode: 'admin' | 'public';
  username?: string;
}) {
  const pathname = usePathname();

  function hrefFor(node: PageTreeNode) {
    return mode === 'admin' ? `/admin/builder?pageId=${node.id}` : `/home/${node.slug}`;
  }

  function isActive(node: PageTreeNode): boolean {
    if (mode === 'public') return pathname === `/home/${node.slug}`;
    return false;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default group-data-[collapsible=icon]:justify-center">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
                <LayoutGrid className="size-5 group-data-[collapsible=icon]:size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-medium">WebApp_V1</span>
                <span className="text-xs text-muted-foreground">{APP_VERSION}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* SidebarGroup(p-2)로 감싸야 헤더·푸터와 좌우 여백이 같아진다 — 감싸지 않으면 메뉴가
            사이드바 왼쪽 끝에 붙어, 아이콘만 남는 접힘 상태에서 아이콘이 레일 가운데가 아니라
            8px 왼쪽으로 치우친다(레일 48px vs 버튼 32px). 접힘 상태에서는 명시적으로 가운데
            정렬도 걸어 둔다. */}
        <SidebarGroup>
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            {pages.map((page) => (
              <PageMenuItem key={page.id} node={page} hrefFor={hrefFor} isActive={isActive} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu username={username} mode={mode} />
      </SidebarFooter>
    </Sidebar>
  );
}

function PageMenuItem({
  node,
  hrefFor,
  isActive,
}: {
  node: PageTreeNode;
  hrefFor: (node: PageTreeNode) => string;
  isActive: (node: PageTreeNode) => boolean;
}) {
  const hasChildren = node.children.length > 0;
  const active = isActive(node);
  const childActive = node.children.some((c) => isActive(c));

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={node.title}>
          <Link href={hrefFor(node)}>
            {node.icon && <DynamicIcon name={node.icon} className="size-4" />}
            <span>{node.title}</span>
            {!node.isVisible && <EyeOff className="ml-auto size-3.5 text-muted-foreground" />}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible defaultOpen={childActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={node.title}>
            {node.icon && <DynamicIcon name={node.icon} className="size-4" />}
            <span>{node.title}</span>
            <ChevronRight className="ml-auto size-4 transition-transform group-data-open/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.children.map((child) => (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton asChild isActive={isActive(child)}>
                  <Link href={hrefFor(child)}>
                    <span>{child.title}</span>
                    {!child.isVisible && (
                      <EyeOff className="ml-auto size-3.5 text-muted-foreground" />
                    )}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function UserMenu({ username, mode }: { username?: string; mode: 'admin' | 'public' }) {
  const { theme, setTheme } = useTheme();
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:justify-center">
              <Avatar size="sm" className="shrink-0">
                <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-medium">{displayName}</span>
                {username && (
                  <span className="text-xs text-muted-foreground">{username}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            {mode === 'public' && (
              <DropdownMenuItem onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun /> : <Moon />}
                {theme === 'dark' ? '라이트 모드' : '다크 모드'}
              </DropdownMenuItem>
            )}
            {mode === 'admin' && (
              <DropdownMenuItem
                variant="destructive"
                disabled={loggingOut}
                onSelect={handleLogout}
              >
                <LogOut />
                로그아웃
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
