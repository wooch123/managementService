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
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
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
      <BreadcrumbList>
        {visible.map((item, i) => {
          const isLast = i === visible.length - 1;

          const node =
            item === null ? (
              <BreadcrumbItem key="ellipsis">
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
              <BreadcrumbItem key={item.href ?? item.label}>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href ?? '#'}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            );

          return (
            <Fragment key={`wrap-${i}`}>
              {node}
              {!isLast && <BreadcrumbSeparator />}
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
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <BreadcrumbTrail items={breadcrumbItems} />
      <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
    </header>
  );
}
