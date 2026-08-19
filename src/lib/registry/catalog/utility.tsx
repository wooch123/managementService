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
import { LiveChat, LiveChatPreview } from '@/components/runtime/LiveChat';
import { PeriodFilter, PeriodFilterPreview } from '@/components/runtime/PeriodFilter';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';
import type { PeriodRange } from '@/lib/period';

/**
 * 서버가 `data`로 내려준 확정 기간을 안전하게 꺼낸다. 빌더 캔버스(undefined)나 카탈로그
 * 점검(빈 결과·숫자 등 엉뚱한 모양)에서도 터지지 않아야 하므로 모양을 직접 확인한다.
 */
function asPeriodRange(data: unknown): PeriodRange | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Partial<PeriodRange>;
  const okBound = (v: unknown) => v === null || typeof v === 'string';
  if (typeof value.preset !== 'string' || !okBound(value.from) || !okBound(value.to)) return null;
  return { from: value.from ?? null, to: value.to ?? null, preset: value.preset as PeriodRange['preset'] };
}

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
  defineComponent({
    key: 'live-chat',
    label: '실시간 채팅',
    group: '유틸리티',
    icon: 'messages-square',
    description: '운영 사이트 방문자 간 실시간 채팅 (SSE 기반, 방 단위 분리)',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('실시간 채팅'),
      room: z.string().default('default'),
      placeholder: z.string().default('메시지를 입력하고 Enter'),
    }),
    defaultProps: { title: '실시간 채팅', room: 'default', placeholder: '메시지를 입력하고 Enter' },
    defaultGrid: { span: 6, rowSpan: 30 },
    // 운영/미리보기(런타임 훅이 붙는 경우)에서만 실제 SSE에 연결한다. 빌더 캔버스·팔레트는
    // 정적 미리보기를 그려서, 편집 중에 연결이 무더기로 열리는 일을 막는다.
    render: ({ props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <LiveChat room={props.room} title={props.title} placeholder={props.placeholder} />
      ) : (
        <LiveChatPreview title={props.title} />
      ),
  }),
  defineComponent({
    key: 'date-range-filter',
    label: '기간 필터',
    group: '유틸리티',
    icon: 'calendar-range',
    description: '페이지 전체의 조회 기간을 정한다 — 고른 기간이 같은 페이지의 모든 바인딩에 적용된다',
    isContainer: false,
    // 폭이 좁으면 프리셋·날짜 입력이 두세 줄로 접힌다 — 접힌 만큼 칸이 늘어나야 한다.
    growsWithContent: true,
    // 스스로 조회하지 않는다. 주소(?preset / ?from&to)를 바꾸면 서버가 페이지의 바인딩들을
    // 그 기간으로 다시 조회한다 — 실제 연결은 각 바인딩의 필터에서 `주소 쿼리` 소스로 건다.
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('조회 기간'),
      /** 주소에 기간이 없을 때 적용되는 기본 기간 */
      defaultPreset: z.enum(['1m', '3m', '6m', '12m', 'all']).default('3m'),
      showPresets: z.boolean().default(true),
      /** 날짜를 직접 찍어 지정하는 입력칸 */
      showCustom: z.boolean().default(true),
    }),
    defaultProps: { title: '조회 기간', defaultPreset: '3m', showPresets: true, showCustom: true },
    defaultGrid: { span: 12, rowSpan: 3 },
    render: ({ props, data, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <PeriodFilter
          title={props.title}
          resolved={asPeriodRange(data)}
          showPresets={props.showPresets}
          showCustom={props.showCustom}
        />
      ) : (
        <PeriodFilterPreview title={props.title} defaultPreset={props.defaultPreset} />
      ),
  }),
] satisfies ComponentDef[];
