import { z } from 'zod';
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentDescription,
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FileIcon, CircleDot } from 'lucide-react';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

export const utilityComponents = [
  defineComponent({
    key: 'attachment',
    label: '첨부파일',
    group: '유틸리티',
    icon: 'paperclip',
    description: '업로드된 파일 표시 카드',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onRemove', label: '제거 시', payload: null }],
    propsSchema: z.object({
      title: z.string().default('문서.pdf'),
      description: z.string().default('1.2 MB'),
    }),
    defaultProps: { title: '문서.pdf', description: '1.2 MB' },
    defaultGrid: { span: 3, rowSpan: 6 },
    render: ({ props }) => (
      <Attachment>
        <AttachmentMedia>
          <FileIcon className="size-4" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{props.title}</AttachmentTitle>
          <AttachmentDescription>{props.description}</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    ),
  }),
  defineComponent({
    key: 'bubble',
    label: '말풍선',
    group: '유틸리티',
    icon: 'message-circle',
    description: '채팅 메시지 말풍선',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({
      text: z.string().default('안녕하세요'),
      align: z.enum(['start', 'end']).default('start'),
      variant: z.enum(['default', 'secondary', 'muted', 'outline']).default('default'),
    }),
    defaultProps: { text: '안녕하세요', align: 'start', variant: 'default' },
    defaultGrid: { span: 4, rowSpan: 6 },
    render: ({ props }) => (
      <Bubble align={props.align} variant={props.variant}>
        <BubbleContent>{props.text}</BubbleContent>
      </Bubble>
    ),
  }),
  defineComponent({
    key: 'marker',
    label: '마커',
    group: '유틸리티',
    icon: 'map-pin',
    description: '타임라인/목록용 표시 마커',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({ text: z.string().default('항목') }),
    defaultProps: { text: '항목' },
    defaultGrid: { span: 4, rowSpan: 4 },
    render: ({ props }) => (
      <Marker>
        <MarkerIcon>
          <CircleDot className="size-3" />
        </MarkerIcon>
        <MarkerContent>{props.text}</MarkerContent>
      </Marker>
    ),
  }),
  defineComponent({
    key: 'message',
    label: '메시지',
    group: '유틸리티',
    icon: 'messages-square',
    description: '아바타 + 말풍선 메시지 한 줄',
    isContainer: false,
    bindingModes: ['field'],
    events: [],
    propsSchema: z.object({
      author: z.string().default('사용자'),
      text: z.string().default('메시지 내용'),
      align: z.enum(['start', 'end']).default('start'),
    }),
    defaultProps: { author: '사용자', text: '메시지 내용', align: 'start' },
    defaultGrid: { span: 6, rowSpan: 8 },
    render: ({ props }) => (
      <Message align={props.align}>
        <MessageAvatar>
          <Avatar size="sm">
            <AvatarFallback>{props.author.slice(0, 1)}</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <Bubble align={props.align}>
            <BubbleContent>{props.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    ),
  }),
  defineComponent({
    key: 'message-scroller',
    label: '메시지 스크롤러',
    group: '유틸리티',
    icon: 'messages-square',
    description: '채팅 메시지 목록 스크롤 영역 (편집 화면은 정적 미리보기)',
    isContainer: true,
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({}),
    defaultProps: {},
    defaultGrid: { span: 6, rowSpan: 30 },
    render: ({ children }) => (
      <div className="flex h-full flex-col gap-2 overflow-y-auto rounded-md border p-2">
        {children ?? <p className="text-sm text-muted-foreground">메시지가 여기에 표시됩니다</p>}
      </div>
    ),
  }),
  defineComponent({
    key: 'questionnaire',
    label: '설문지',
    group: '유틸리티',
    icon: 'list-checks',
    description: '단계별 설문 (편집 화면은 정적 미리보기)',
    isContainer: false,
    bindingModes: [],
    events: [{ name: 'onSubmit', label: '제출 시', payload: 'answers' }],
    propsSchema: z.object({
      question: z.string().default('질문을 입력하세요'),
      choices: z.array(z.string()).default(['선택지 1', '선택지 2']),
    }),
    defaultProps: { question: '질문을 입력하세요', choices: ['선택지 1', '선택지 2'] },
    defaultGrid: { span: 6, rowSpan: 20 },
    render: ({ props }) => (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <span className="text-xs text-muted-foreground">1 / 1</span>
        <p className="text-sm font-medium">{props.question}</p>
        <div className="flex flex-col gap-2">
          {props.choices.map((c) => (
            <Button key={c} variant="outline" className="justify-start">
              {c}
            </Button>
          ))}
        </div>
      </div>
    ),
  }),
  defineComponent({
    key: 'direction',
    label: '텍스트 방향',
    group: '유틸리티',
    icon: 'move-horizontal',
    description: 'LTR/RTL 방향 컨텍스트 (자식에 적용)',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ direction: z.enum(['ltr', 'rtl']).default('ltr') }),
    defaultProps: { direction: 'ltr' },
    defaultGrid: { span: 6, rowSpan: 12 },
    render: ({ props, children }) => (
      <div dir={props.direction} className="flex flex-col gap-2">
        {children}
      </div>
    ),
  }),
] satisfies ComponentDef[];
