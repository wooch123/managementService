'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, ChevronsUpDown, EyeOff, LayoutGrid, LogOut, Pencil } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
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
import { ThemePicker } from '@/components/shell/ThemePicker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PageTreeNode } from '@/lib/db/page-tree';

export function AppSidebar({
  pages,
  mode,
  username,
  siteTitle = 'WebApp_V1',
  siteSubtitle = 'v1.0.1',
}: {
  pages: PageTreeNode[];
  mode: 'admin' | 'public';
  username?: string;
  /** 사이드바 상단 표시 이름 — 관리자 화면에서 직접 수정한다(§ AppSetting). */
  siteTitle?: string;
  siteSubtitle?: string;
}) {
  const pathname = usePathname();
  const [titleEditOpen, setTitleEditOpen] = useState(false);

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
            {/* 관리자 화면에서는 이 영역을 눌러 사이트 이름/부제를 바로 수정한다(운영 화면은 표시 전용). */}
            <SidebarMenuButton
              size="lg"
              onClick={mode === 'admin' ? () => setTitleEditOpen(true) : undefined}
              title={mode === 'admin' ? '클릭해서 사이트 이름 수정' : undefined}
              className={cn(
                'group-data-[collapsible=icon]:justify-center',
                mode === 'public' && 'cursor-default'
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
                <LayoutGrid className="size-5 group-data-[collapsible=icon]:size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{siteTitle}</span>
                {siteSubtitle && <span className="truncate text-xs text-muted-foreground">{siteSubtitle}</span>}
              </div>
              {mode === 'admin' ? (
                <Pencil className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/menu-button:opacity-100 group-data-[collapsible=icon]:hidden" />
              ) : (
                <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {mode === 'admin' && (
        <SiteTitleDialog
          open={titleEditOpen}
          onOpenChange={setTitleEditOpen}
          initialTitle={siteTitle}
          initialSubtitle={siteSubtitle}
        />
      )}

      <SidebarContent>
        {/* SidebarGroup(p-2)로 감싸야 헤더·푸터와 좌우 여백이 같아진다 — 감싸지 않으면 메뉴가
            사이드바 왼쪽 끝에 붙어, 아이콘만 남는 접힘 상태에서 아이콘이 레일 가운데가 아니라
            8px 왼쪽으로 치우친다(레일 48px vs 버튼 32px). 접힘 상태에서는 명시적으로 가운데
            정렬도 걸어 둔다. */}
        <SidebarGroup>
          {/* 항목 사이를 살짝 띄운다 — shadcn 기본값은 gap-0이라 메뉴가 서로 붙어 한 덩어리로
              읽힌다. 하위 메뉴(gap-1)와 같은 리듬을 주되 목록이 길어져도 부담스럽지 않은 선. */}
          <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
            {pages.map((page) => (
              <PageMenuItem key={page.id} node={page} hrefFor={hrefFor} isActive={isActive} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* 테마 버튼은 푸터(사용자 메뉴) 바로 위에 둔다 — 요청 사항. 접힌 사이드바에서는 아이콘만 남는다. */}
      <ThemePicker />

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
  // 현재 보고 있는 페이지가 이 묶음 안에 있으면 열어 둔다(다른 곳으로 이동해도 사용자가 직접
  // 접기 전까지는 열린 상태를 유지한다).
  const [open, setOpen] = useState(active || childActive);
  useEffect(() => {
    if (active || childActive) setOpen(true);
  }, [active, childActive]);

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
    // 하위 페이지가 있어도 상위 항목 자체가 링크다 — 예전에는 상위를 누르면 하위 메뉴만 열리고
    // 그 페이지로는 이동하지 않아, 상위 페이지에 배치한 내용(요약 표·KPI)을 볼 방법이 없었다.
    // 이동과 펼치기를 동시에 하고, 펼침/접힘만 하고 싶을 때는 오른쪽 화살표 버튼을 쓴다.
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={node.title} onClick={() => setOpen(true)}>
          <Link href={hrefFor(node)}>
            {node.icon && <DynamicIcon name={node.icon} className="size-4" />}
            <span>{node.title}</span>
            {!node.isVisible && <EyeOff className="ml-auto size-3.5 text-muted-foreground" />}
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label={open ? '하위 메뉴 접기' : '하위 메뉴 펼치기'}
            onClick={(e) => {
              // 화살표는 펼침 전용 — 링크 클릭(이동)으로 번지지 않게 한다.
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <ChevronRight className="transition-transform group-data-open/collapsible:rotate-90" />
          </SidebarMenuAction>
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


/** 사이트 이름/부제 편집 — 저장 즉시 서버 컴포넌트를 다시 그려(refresh) 사이드바에 반영한다. */
function SiteTitleDialog({
  open,
  onOpenChange,
  initialTitle,
  initialSubtitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTitle: string;
  initialSubtitle: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) {
      toast.error('이름을 입력하세요.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteTitle: title.trim(), siteSubtitle: subtitle.trim() }),
    });
    const json = (await res.json()) as { ok: boolean; error?: { message: string } };
    setSaving(false);
    if (!json.ok) {
      toast.error(json.error?.message ?? '저장에 실패했습니다.');
      return;
    }
    toast.success('사이트 이름을 저장했습니다.');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>사이트 이름 수정</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-title">이름</Label>
            <Input id="site-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-subtitle">부제 (버전·부서명 등, 비워도 됩니다)</Label>
            <Input id="site-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={40} />
          </div>
          <p className="text-xs text-muted-foreground">
            운영 화면과 관리자 화면의 사이드바 상단에 함께 반영됩니다(배포 없이 즉시 적용).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
