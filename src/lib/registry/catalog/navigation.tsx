import { Fragment } from 'react';
import { z } from 'zod';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

export const navigationComponents = [
  defineComponent({
    key: 'breadcrumb',
    label: '브레드크럼',
    group: '내비게이션',
    icon: 'chevron-right',
    description: '현재 위치 경로 표시',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ items: z.array(z.string()).default(['홈', '현재 페이지']) }),
    defaultProps: { items: ['홈', '현재 페이지'] },
    defaultGrid: { span: 6, rowSpan: 4 },
    render: ({ props }) => (
      <Breadcrumb>
        <BreadcrumbList>
          {/* map이 돌려주는 바깥 요소에 key가 있어야 한다 — 이름 없는 조각(<>)으로 감싸면 안쪽에
              key를 붙여도 React가 "key prop이 없다"고 경고한다(실측). 같은 항목명이 두 번 들어와도
              구분되도록 순번을 함께 쓴다. */}
          {props.items.map((item, i) => (
            <Fragment key={`${item}-${i}`}>
              <BreadcrumbItem>
                {i === props.items.length - 1 ? (
                  <BreadcrumbPage>{item}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href="#">{item}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {i < props.items.length - 1 && <BreadcrumbSeparator />}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    ),
  }),
  defineComponent({
    key: 'navigation-menu',
    label: '내비게이션 메뉴',
    group: '내비게이션',
    icon: 'menu',
    description: '드롭다운형 상단 내비게이션',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ items: z.array(z.string()).default(['홈', '소개', '문의']) }),
    defaultProps: { items: ['홈', '소개', '문의'] },
    defaultGrid: { span: 6, rowSpan: 6 },
    render: ({ props }) => (
      <NavigationMenu viewport={false}>
        <NavigationMenuList>
          {props.items.map((item) => (
            <NavigationMenuItem key={item}>
              <NavigationMenuLink href="#">{item}</NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    ),
  }),
  defineComponent({
    key: 'menubar',
    label: '메뉴바',
    group: '내비게이션',
    icon: 'menu-square',
    description: '데스크톱 앱 스타일 메뉴바',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ menus: z.array(z.string()).default(['파일', '편집']) }),
    defaultProps: { menus: ['파일', '편집'] },
    defaultGrid: { span: 6, rowSpan: 6 },
    render: ({ props }) => (
      <Menubar>
        {props.menus.map((menu) => (
          <MenubarMenu key={menu}>
            <MenubarTrigger>{menu}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>새로 만들기</MenubarItem>
              <MenubarItem>열기</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
    ),
  }),
  defineComponent({
    key: 'dropdown-menu',
    label: '드롭다운 메뉴',
    group: '내비게이션',
    icon: 'chevron-down-square',
    description: '버튼 클릭 시 나타나는 메뉴',
    isContainer: false,
    bindingModes: [],
    events: [{ name: 'onSelect', label: '항목 선택 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('메뉴'),
      items: z.array(z.string()).default(['항목 1', '항목 2']),
    }),
    defaultProps: { label: '메뉴', items: ['항목 1', '항목 2'] },
    defaultGrid: { span: 3, rowSpan: 6 },
    render: ({ props, dispatch }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">{props.label}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {props.items.map((item) => (
            <DropdownMenuItem key={item} onSelect={() => dispatch?.('onSelect', item)}>
              {item}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }),
  defineComponent({
    key: 'context-menu',
    label: '우클릭 메뉴',
    group: '내비게이션',
    icon: 'mouse-pointer-click',
    description: '우클릭 시 나타나는 메뉴',
    isContainer: true,
    bindingModes: [],
    events: [{ name: 'onSelect', label: '항목 선택 시', payload: 'value' }],
    propsSchema: z.object({ items: z.array(z.string()).default(['복사', '삭제']) }),
    defaultProps: { items: ['복사', '삭제'] },
    defaultGrid: { span: 6, rowSpan: 12 },
    render: ({ props, dispatch, children }) => (
      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-16 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {children ?? '여기를 우클릭하세요'}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {props.items.map((item) => (
            <ContextMenuItem key={item} onSelect={() => dispatch?.('onSelect', item)}>
              {item}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    ),
  }),
  defineComponent({
    key: 'command',
    label: '커맨드 팔레트',
    group: '내비게이션',
    icon: 'square-terminal',
    description: '검색형 명령 실행 목록',
    isContainer: false,
    bindingModes: ['list'],
    events: [{ name: 'onSelect', label: '항목 선택 시', payload: 'value' }],
    propsSchema: z.object({ items: z.array(z.string()).default(['명령 1', '명령 2']) }),
    defaultProps: { items: ['명령 1', '명령 2'] },
    defaultGrid: { span: 6, rowSpan: 16 },
    render: ({ props, dispatch }) => (
      <Command className="rounded-md border">
        <CommandInput placeholder="검색..." />
        <CommandList>
          <CommandEmpty>결과 없음</CommandEmpty>
          <CommandGroup>
            {props.items.map((item) => (
              <CommandItem key={item} onSelect={() => dispatch?.('onSelect', item)}>
                {item}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    ),
  }),
] satisfies ComponentDef[];
