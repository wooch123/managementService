import type { ReactNode } from 'react';
import type { z } from 'zod';

export const COMPONENT_GROUPS = [
  '레이아웃',
  '입력',
  '데이터 표시',
  '내비게이션',
  '피드백/오버레이',
  '액션',
  '유틸리티',
  '통계 차트',
  '게시판',
] as const;
export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

export type BindingMode = 'static' | 'list' | 'single' | 'field' | 'aggregate' | 'group';

export type EventDef = {
  name: string;
  label: string;
  payload?: string | null;
};

export type RenderContext<P = Record<string, unknown>> = {
  node: { id: string; type: string };
  props: P;
  data?: unknown;
  dispatch?: (eventName: string, payload?: unknown) => void;
  children?: ReactNode;
  /** 런타임(미리보기/운영) 전용 — 빌더 캔버스에서는 undefined로, 값이 없으면 각 입력 컴포넌트는
   * 지금까지처럼 비제어 상태로 렌더된다(P3 캔버스 동작과 100% 호환). */
  value?: unknown;
  onValueChange?: (v: unknown) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentDef<Schema extends z.ZodObject<any> = z.ZodObject<any>> = {
  key: string;
  label: string;
  group: ComponentGroup;
  icon: string;
  description: string;
  isContainer: boolean;
  /**
   * 배정된 칸보다 내용이 커지면 **칸을 늘려야** 하는 컴포넌트인지.
   *
   * 기본값(false)은 "칸 높이에 맞춰 내가 줄어든다" — 차트·표·대화처럼 안에서 스크롤하거나
   * 눌러 담는 것들이다. 이들이 칸 높이를 정확히 받으려면 min-content 기여를 0으로 눌러야 한다.
   * 반면 글이 접히는 안내문·필터 바는 정반대로, 접힌 만큼 칸이 늘어나야 한다 — 실제로 조회 기간
   * 필터가 좁은 폭에서 세 줄로 접혔는데 칸은 56px 그대로여서 넘친 줄이 아래 카드 뒤로 숨었다.
   */
  growsWithContent?: boolean;
  allowedChildren?: string[];
  bindingModes: BindingMode[];
  events: EventDef[];
  propsSchema: Schema;
  defaultProps: z.infer<Schema>;
  defaultGrid: { span: number; rowSpan: number };
  render: (ctx: RenderContext<z.infer<Schema>>) => ReactNode;
};

/**
 * 배열 리터럴 안에 일반 객체로 나열하면 TS가 각 항목을 공통 `ComponentDef`(props: unknown)로
 * 뭉뚱그려 버려 render(ctx)에서 ctx.props의 필드별 타입을 잃는다. 이 헬퍼로 각 항목을
 * 개별 제네릭 호출로 감싸면 propsSchema → render(ctx.props) 타입이 항목별로 정확히 추론된다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineComponent<Schema extends z.ZodObject<any>>(
  def: ComponentDef<Schema>
): ComponentDef<Schema> {
  return def;
}
