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
] as const;
export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

export type BindingMode = 'static' | 'list' | 'single' | 'field' | 'aggregate';

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
