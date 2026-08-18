import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemContent, ItemMedia, ItemTitle, ItemDescription } from '@/components/ui/item';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { ChevronDown, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

export const layoutComponents = [
  defineComponent({
    key: 'card',
    label: '카드',
    group: '레이아웃',
    icon: 'square',
    description: '제목/설명과 내용을 감싸는 카드 컨테이너',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('카드 제목'),
      description: z.string().default(''),
      showHeader: z.boolean().default(true),
    }),
    defaultProps: { title: '카드 제목', description: '', showHeader: true },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props, children }) => (
      <Card>
        {props.showHeader && (
          <CardHeader>
            <CardTitle>{props.title}</CardTitle>
            {props.description && <CardDescription>{props.description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="flex min-h-16 flex-col gap-2">{children}</CardContent>
      </Card>
    ),
  }),
  defineComponent({
    key: 'separator',
    label: '구분선',
    group: '레이아웃',
    icon: 'minus',
    description: '수평/수직 구분선',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ orientation: z.enum(['horizontal', 'vertical']).default('horizontal') }),
    defaultProps: { orientation: 'horizontal' },
    defaultGrid: { span: 12, rowSpan: 2 },
    render: ({ props }) => <Separator orientation={props.orientation} />,
  }),
  defineComponent({
    key: 'aspect-ratio',
    label: '가로세로 비율',
    group: '레이아웃',
    icon: 'rectangle-horizontal',
    description: '고정 비율 콘텐츠 영역',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ ratio: z.number().default(16 / 9) }),
    defaultProps: { ratio: 16 / 9 },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props, children }) => (
      <AspectRatio ratio={props.ratio} className="rounded-md bg-muted">
        {children}
      </AspectRatio>
    ),
  }),
  defineComponent({
    key: 'resizable',
    label: '크기 조절 패널',
    group: '레이아웃',
    icon: 'panels-left-right',
    description: '드래그로 폭을 조절하는 분할 패널',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ orientation: z.enum(['horizontal', 'vertical']).default('horizontal') }),
    defaultProps: { orientation: 'horizontal' },
    defaultGrid: { span: 12, rowSpan: 30 },
    render: ({ props, children }) => (
      <ResizablePanelGroup orientation={props.orientation} className="min-h-32 rounded-md border">
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-2 text-sm text-muted-foreground">
            {children ?? '패널 1'}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-2 text-sm text-muted-foreground">
            패널 2
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    ),
  }),
  defineComponent({
    key: 'scroll-area',
    label: '스크롤 영역',
    group: '레이아웃',
    icon: 'scroll',
    description: '커스텀 스크롤바를 가진 영역',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ height: z.number().default(200) }),
    defaultProps: { height: 200 },
    defaultGrid: { span: 6, rowSpan: 25 },
    render: ({ props, children }) => (
      <ScrollArea style={{ height: props.height }} className="rounded-md border p-2">
        {children}
      </ScrollArea>
    ),
  }),
  defineComponent({
    key: 'tabs',
    label: '탭',
    group: '레이아웃',
    icon: 'gallery-horizontal',
    description: '여러 화면을 탭으로 전환',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      tab1Label: z.string().default('탭 1'),
      tab2Label: z.string().default('탭 2'),
    }),
    defaultProps: { tab1Label: '탭 1', tab2Label: '탭 2' },
    defaultGrid: { span: 12, rowSpan: 25 },
    render: ({ props, children }) => (
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">{props.tab1Label}</TabsTrigger>
          <TabsTrigger value="tab2">{props.tab2Label}</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="flex min-h-16 flex-col gap-2 pt-2">
          {children}
        </TabsContent>
        <TabsContent value="tab2" className="pt-2 text-sm text-muted-foreground">
          {props.tab2Label} 내용
        </TabsContent>
      </Tabs>
    ),
  }),
  defineComponent({
    key: 'accordion',
    label: '아코디언',
    group: '레이아웃',
    icon: 'chevrons-up-down',
    description: '펼침/접힘 가능한 콘텐츠 목록',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ title: z.string().default('섹션 제목') }),
    defaultProps: { title: '섹션 제목' },
    defaultGrid: { span: 6, rowSpan: 15 },
    render: ({ props, children }) => (
      <Accordion type="single" collapsible defaultValue="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>{props.title}</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-2">{children}</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  }),
  defineComponent({
    key: 'collapsible',
    label: '접기/펼치기',
    group: '레이아웃',
    icon: 'chevron-down',
    description: '버튼 클릭으로 내용을 펼치는 영역',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ title: z.string().default('자세히 보기') }),
    defaultProps: { title: '자세히 보기' },
    defaultGrid: { span: 6, rowSpan: 15 },
    render: ({ props, children }) => (
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
          <ChevronDown className="size-4" /> {props.title}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">{children}</CollapsibleContent>
      </Collapsible>
    ),
  }),
  defineComponent({
    key: 'item',
    label: '아이템 행',
    group: '레이아웃',
    icon: 'list',
    description: '아이콘/제목/설명으로 구성된 목록 행',
    isContainer: false,
    bindingModes: ['single'],
    events: [{ name: 'onClick', label: '클릭 시', payload: null }],
    propsSchema: z.object({
      title: z.string().default('제목'),
      description: z.string().default('설명'),
      icon: z.string().default('circle'),
    }),
    defaultProps: { title: '제목', description: '설명', icon: 'circle' },
    defaultGrid: { span: 6, rowSpan: 8 },
    render: ({ props, dispatch }) => (
      <Item variant="outline" onClick={() => dispatch?.('onClick')}>
        <ItemMedia variant="icon">
          <LayoutGrid className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{props.title}</ItemTitle>
          <ItemDescription>{props.description}</ItemDescription>
        </ItemContent>
      </Item>
    ),
  }),
  defineComponent({
    key: 'sidebar',
    label: '사이드바',
    group: '레이아웃',
    icon: 'panel-left',
    description: '페이지 내부에 배치하는 보조 내비게이션 사이드바',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ title: z.string().default('메뉴') }),
    defaultProps: { title: '메뉴' },
    defaultGrid: { span: 3, rowSpan: 30 },
    render: ({ props, children }) => (
      <SidebarProvider className="min-h-40" style={{ '--sidebar-width': '100%' } as React.CSSProperties}>
        <Sidebar collapsible="none" className="rounded-md border">
          <SidebarContent>
            <SidebarGroup>
              <span className="px-2 py-1 text-xs font-medium text-muted-foreground">{props.title}</span>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronsUpDown className="size-4" />
                    {children ?? '메뉴 항목'}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    ),
  }),
] satisfies ComponentDef[];
