'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/lib/runtime/breadcrumb';

function BreadcrumbTrail({ items }: { items: BreadcrumbItemType[] }) {
  if (items.length === 0) return null;

  const last = items[items.length - 1];
  const collapsedMiddle = items.length > 3 ? items.slice(1, -1) : null;
  const visible = collapsedMiddle
    ? [items[0], null, last]
    : items;

  return (
    <Breadcrumb>
      {/* 헤더 높이가 h-14로 고정이라 줄바꿈되면 아래가 잘린다 — 한 줄로 유지하고 넘치면 말줄임한다. */}
      <BreadcrumbList className="min-w-0 flex-nowrap whitespace-nowrap">
        {visible.map((item, i) => {
          const isLast = i === visible.length - 1;

          const node =
            item === null ? (
              <BreadcrumbItem key="ellipsis" className="hidden sm:flex">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {collapsedMiddle!.map((mid) => (
                      <DropdownMenuItem key={mid.href} asChild>
                        <Link href={mid.href ?? '#'}>{mid.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
            ) : (
              <BreadcrumbItem key={item.href ?? item.label} className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                ) : (
                  // 마지막(현재 페이지)만 남기고 상위 단계는 좁은 화면에서 접는다.
                  <BreadcrumbLink asChild className="hidden truncate sm:block">
                    <Link href={item.href ?? '#'}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            );

          return (
            <Fragment key={`wrap-${i}`}>
              {node}
              {/* 상위 단계를 접는 폭에서는 구분선만 남으면 안 된다. */}
              {!isLast && <BreadcrumbSeparator className="hidden sm:block" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppHeader({
  breadcrumbItems,
  rightSlot,
}: {
  breadcrumbItems: BreadcrumbItemType[];
  rightSlot?: React.ReactNode;
}) {
  // 사이드바를 펼친 상태에서는 접기 버튼이 사이드바 헤더 안에 있다(AppSidebar). 여기 버튼은
  // 접혀 있어 그 자리가 없을 때와, 사이드바가 시트로 뜨는 좁은 화면에서만 나타난다 —
  // 둘 다 보이면 같은 일을 하는 버튼이 나란히 두 개가 된다.
  const { state, isMobile } = useSidebar();
  const showTrigger = isMobile || state === 'collapsed';

  return (
    // 창이 좁아져도 오른쪽 도구가 헤더 밖으로 밀려나지 않게 한다 — 가운데 제목 영역이 먼저
    // 줄어들고(min-w-0), 오른쪽은 줄어들지 않는다(shrink-0). 예전에는 제목이 자기 폭을 다 차지해
    // 오른쪽 단계 표시가 헤더 밖으로 185px까지 삐져나갔다.
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      {showTrigger && <SidebarTrigger className="shrink-0" title="사이드바 펼치기" />}
      {/* 사이드바 토글과 제목 사이의 짧은 세로 구분선은 제거했다(시각적 노이즈만 남고 구분 기능이 없다). */}
      <div className="min-w-0 flex-1">
        <BreadcrumbTrail items={breadcrumbItems} />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">{rightSlot}</div>
    </header>
  );
}
