import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { InfoIcon } from 'lucide-react';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * Dialog/AlertDialog/Sheet/Drawer/Popover/HoverCard는 실제로는 Radix Portal로
 * document.body에 렌더링되어 캔버스의 그리드 배치와 무관해진다. WYSIWYG 캔버스에서
 * 그리드 셀 안에 실제 위치·크기를 갖게 하기 위해, 편집 모드에서는 포털을 쓰지 않는
 * 정적 미리보기 프레임으로 렌더링한다 (런타임 §12 렌더러는 이 제약이 없으므로
 * 실제 Radix 오버레이를 그대로 사용한다 — P8에서 별도 구현).
 */
function OverlayPreviewFrame({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border bg-popover p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{label} 미리보기</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export const feedbackComponents = [
  defineComponent({
    key: 'alert',
    label: '알림',
    group: '피드백/오버레이',
    icon: 'circle-alert',
    description: '인라인 경고/안내 메시지',
    isContainer: false,
    // 글이 길어 여러 줄로 접히면 그만큼 칸이 늘어나야 한다(아래 컴포넌트를 덮지 않게).
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('안내'),
      description: z.string().default('내용을 입력하세요'),
      variant: z.enum(['default', 'destructive']).default('default'),
    }),
    defaultProps: { title: '안내', description: '내용을 입력하세요', variant: 'default' },
    defaultGrid: { span: 6, rowSpan: 8 },
    render: ({ props }) => (
      <Alert variant={props.variant}>
        <InfoIcon />
        <AlertTitle>{props.title}</AlertTitle>
        <AlertDescription>{props.description}</AlertDescription>
      </Alert>
    ),
  }),
  defineComponent({
    key: 'alert-dialog',
    label: '확인 대화상자',
    group: '피드백/오버레이',
    icon: 'triangle-alert',
    description: '되돌릴 수 없는 작업 확인용 모달',
    isContainer: false,
    bindingModes: [],
    events: [
      { name: 'onConfirm', label: '확인 시', payload: null },
      { name: 'onCancel', label: '취소 시', payload: null },
    ],
    propsSchema: z.object({
      triggerLabel: z.string().default('삭제'),
      title: z.string().default('정말 삭제하시겠습니까?'),
      description: z.string().default('이 작업은 되돌릴 수 없습니다.'),
    }),
    defaultProps: { triggerLabel: '삭제', title: '정말 삭제하시겠습니까?', description: '이 작업은 되돌릴 수 없습니다.' },
    defaultGrid: { span: 3, rowSpan: 6 },
    render: ({ props }) => <Button variant="destructive">{props.triggerLabel}</Button>,
  }),
  defineComponent({
    key: 'dialog',
    label: '다이얼로그',
    group: '피드백/오버레이',
    icon: 'app-window',
    description: '중앙 모달 창',
    isContainer: true,
    bindingModes: [],
    events: [
      { name: 'onOpen', label: '열릴 때', payload: null },
      { name: 'onClose', label: '닫힐 때', payload: null },
    ],
    propsSchema: z.object({ triggerLabel: z.string().default('열기'), title: z.string().default('다이얼로그 제목') }),
    defaultProps: { triggerLabel: '열기', title: '다이얼로그 제목' },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props, children }) => (
      <OverlayPreviewFrame label="Dialog" title={props.title}>
        {children}
      </OverlayPreviewFrame>
    ),
  }),
  defineComponent({
    key: 'drawer',
    label: '드로어',
    group: '피드백/오버레이',
    icon: 'panel-bottom',
    description: '하단에서 올라오는 모달',
    isContainer: true,
    bindingModes: [],
    events: [
      { name: 'onOpen', label: '열릴 때', payload: null },
      { name: 'onClose', label: '닫힐 때', payload: null },
    ],
    propsSchema: z.object({ title: z.string().default('드로어 제목') }),
    defaultProps: { title: '드로어 제목' },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props, children }) => (
      <OverlayPreviewFrame label="Drawer" title={props.title}>
        {children}
      </OverlayPreviewFrame>
    ),
  }),
  defineComponent({
    key: 'sheet',
    label: '사이드 시트',
    group: '피드백/오버레이',
    icon: 'panel-right',
    description: '측면에서 슬라이드되는 패널',
    isContainer: true,
    bindingModes: [],
    events: [
      { name: 'onOpen', label: '열릴 때', payload: null },
      { name: 'onClose', label: '닫힐 때', payload: null },
    ],
    propsSchema: z.object({ title: z.string().default('시트 제목') }),
    defaultProps: { title: '시트 제목' },
    defaultGrid: { span: 4, rowSpan: 25 },
    render: ({ props, children }) => (
      <OverlayPreviewFrame label="Sheet" title={props.title}>
        {children}
      </OverlayPreviewFrame>
    ),
  }),
  defineComponent({
    key: 'popover',
    label: '팝오버',
    group: '피드백/오버레이',
    icon: 'message-square',
    description: '트리거 옆에 뜨는 작은 패널',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ triggerLabel: z.string().default('열기') }),
    defaultProps: { triggerLabel: '열기' },
    defaultGrid: { span: 4, rowSpan: 15 },
    render: ({ props, children }) => (
      <OverlayPreviewFrame label="Popover" title={props.triggerLabel}>
        {children}
      </OverlayPreviewFrame>
    ),
  }),
  defineComponent({
    key: 'hover-card',
    label: '호버 카드',
    group: '피드백/오버레이',
    icon: 'square-mouse-pointer',
    description: '마우스 오버 시 나타나는 카드',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ triggerLabel: z.string().default('@username') }),
    defaultProps: { triggerLabel: '@username' },
    defaultGrid: { span: 4, rowSpan: 12 },
    render: ({ props, children }) => (
      <OverlayPreviewFrame label="HoverCard" title={props.triggerLabel}>
        {children}
      </OverlayPreviewFrame>
    ),
  }),
  defineComponent({
    key: 'tooltip',
    label: '툴팁',
    group: '피드백/오버레이',
    icon: 'message-circle-question',
    description: '짧은 도움말 말풍선',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ triggerLabel: z.string().default('도움말'), text: z.string().default('설명 텍스트') }),
    defaultProps: { triggerLabel: '도움말', text: '설명 텍스트' },
    defaultGrid: { span: 3, rowSpan: 6 },
    render: ({ props }) => (
      <div className="inline-flex flex-col gap-1">
        <Button variant="outline" size="sm">
          {props.triggerLabel}
        </Button>
        <span className="text-xs text-muted-foreground">↳ {props.text}</span>
      </div>
    ),
  }),
  defineComponent({
    key: 'toast',
    label: '토스트',
    group: '피드백/오버레이',
    icon: 'message-square-dot',
    description: '액션 실행 시 잠깐 나타나는 알림 (sonner)',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      message: z.string().default('저장되었습니다'),
      variant: z.enum(['default', 'success', 'destructive']).default('default'),
    }),
    defaultProps: { message: '저장되었습니다', variant: 'default' },
    defaultGrid: { span: 4, rowSpan: 6 },
    render: ({ props }) => (
      <div className="flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-sm">
        {props.message}
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          토스트는 캔버스에 직접 배치되지 않고 액션에서 호출됩니다
        </span>
      </div>
    ),
  }),
  defineComponent({
    key: 'spinner',
    label: '로딩 스피너',
    group: '피드백/오버레이',
    icon: 'loader-circle',
    description: '로딩 상태 표시',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({}),
    defaultProps: {},
    defaultGrid: { span: 1, rowSpan: 4 },
    render: () => <Spinner />,
  }),
] satisfies ComponentDef[];
