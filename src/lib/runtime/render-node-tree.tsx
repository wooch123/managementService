import { getComponentDef } from '@/lib/registry/catalog';
import { NodeErrorBoundary } from '@/components/builder/NodeErrorBoundary';
import type { ComponentDef, RenderContext } from '@/lib/registry/types';
import { cn } from '@/lib/utils';
import type { NodeDto } from '@/lib/db/nodes';

export type RuntimeHooks = {
  dispatch?: (node: NodeDto, eventName: string, payload?: unknown) => void;
  getValue?: (nodeId: string) => unknown;
  onValueChange?: (nodeId: string, value: unknown) => void;
  /** §12.2 "바인딩 데이터는 서버에서 미리 조회" — 운영 런타임(RuntimeRenderer)만 채워 넣는다.
   * 빌더 캔버스/미리보기는 지금까지처럼 undefined로 둬 기존 동작을 그대로 유지한다. */
  getData?: (nodeId: string) => unknown;
};

/**
 * def.render(ctx)를 실제 React 컴포넌트의 렌더 단계 "안에서" 호출하기 위한 얇은 래퍼.
 * NodeErrorBoundary가 렌더 중 예외를 잡으려면 그 예외가 React가 호출하는 컴포넌트 렌더
 * 스택 안에서 던져져야 한다 — def.render(ctx)를 JSX 자식 자리에 그냥 직접 써서 호출하면
 * NodeErrorBoundary가 마운트되기도 전, 부모의 렌더 도중(일반 함수 호출로) 실행되어버려
 * 예외가 경계를 그냥 통과한다(실제 발견된 버그 — 운영 렌더러에서 한 컴포넌트가 던진
 * 예외가 페이지 전체를 500으로 무너뜨렸다).
 */
function NodeRenderer({ def, ctx }: { def: ComponentDef; ctx: RenderContext }) {
  return <>{def.render(ctx)}</>;
}

/** 자기 표면(테두리+배경)을 이미 갖고 있는 컴포넌트 — 카드로 한 번 더 감싸면 테두리가 겹친다. */
const SELF_SURFACED = new Set(['card', 'alert', 'page-title']);

/**
 * §12.2 렌더 파이프라인의 축소판. `hooks`가 주어지면(미리보기/운영) 실제 dispatch와
 * 입력값 추적을 연결하고, 없으면(빌더 캔버스) 지금까지처럼 정적으로 렌더한다.
 */
export function renderNodeTree(nodes: NodeDto[], parentId: string | null = null, hooks?: RuntimeHooks): React.ReactNode {
  const children = nodes.filter((n) => n.parentNodeId === parentId);
  // 최상위는 **보이는 순서**(위→아래, 왼쪽→오른쪽)로 그린다. 그리드에 좌표를 직접 지정하므로
  // 넓은 화면에서는 DOM 순서가 배치를 바꾸지 않지만, 폭이 좁아 한 줄씩 쌓일 때는 DOM 순서가
  // 곧 화면 순서가 된다 — order가 배치 순서와 어긋난 페이지(fa-assign·tips)에서 실제로 달라진다.
  // 탭 이동 순서도 이 편이 화면과 일치한다.
  if (parentId === null) {
    children.sort((a, b) => a.grid.row - b.grid.row || a.grid.col - b.grid.col || a.order - b.order);
  } else {
    children.sort((a, b) => a.order - b.order);
  }

  return children.map((node) => {
    const def = getComponentDef(node.type);
    if (!def) {
      return (
        <div key={node.id} className="rounded-md border border-dashed border-destructive/50 p-2 text-xs text-destructive">
          알 수 없는 컴포넌트: {node.type}
        </div>
      );
    }
    const isRoot = parentId === null;
    // 내용만큼 칸이 늘어나야 하는 컴포넌트(글이 접히는 안내문·필터 바)는 높이 계산이 정반대다.
    // 기본형은 min-content를 0으로 눌러 칸 높이를 그대로 받고(차트·표·대화가 안에서 스크롤한다),
    // 이쪽은 누르지 않아야 접힌 만큼이 칸 높이로 전달된다(registry/types.ts 참고).
    const grows = def.growsWithContent === true;
    // 배치된 컴포넌트는 모두 카드 표면 위에 올린다(§3 디자인 규칙) — 자기 테두리를 이미 가진
    // 컴포넌트만 예외로 두어 테두리가 겹치지 않게 한다.
    // 표면의 세기로 화면에 계층을 만든다 — 지표는 또렷하게, 차트는 물러나게(registry/types.ts).
    const surface =
      def.surface === 'strong' ? 'border-border'
      : def.surface === 'quiet' ? 'border-border/60'
      : 'border-border';
    const withCard = (content: React.ReactNode) =>
      isRoot && !SELF_SURFACED.has(node.type) ? (
        // Tech Report 양식의 카드 표면 — 흰 면에 1px 선, 반지름 14px, 안여백 20px,
        // 그리고 거의 보이지 않는 그림자 한 겹(양식의 `0 1px 2px rgba(28,32,37,.02)`).
        // 값은 globals.css의 --card-radius / --card-shadow에서 온다(테마가 바뀌어도 함께 간다).
        <div
          style={{ borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)' }}
          className={cn(
            'flex flex-col border bg-card p-5 text-card-foreground',
            grows ? 'min-h-full' : 'h-full',
            surface
          )}
        >
          <div className={grows ? 'flex-1' : 'min-h-0 flex-1'}>{content}</div>
        </div>
      ) : (
        content
      );

    return (
      <div
        key={node.id}
        // min-h-0을 걸면 이 칸의 min-content 기여가 0이 되어, 늘어나야 하는 컴포넌트도 칸이
        // 그대로 남는다(줄바꿈된 내용이 아래 칸 뒤로 숨는다). 늘어나는 쪽에는 걸지 않는다.
        className={isRoot ? (grows ? 'runtime-cell min-w-0' : 'runtime-cell min-h-0 min-w-0') : undefined}
        style={
          isRoot
            ? ({
                gridColumn: `${node.grid.col} / span ${node.grid.span}`,
                gridRow: `${node.grid.row} / span ${node.grid.rowSpan}`,
                // 폭이 좁아 한 줄씩 쌓일 때 설계한 높이를 최소 높이로 되살리는 데 쓴다
                // (globals.css의 .runtime-grid 좁은 폭 규칙이 읽는다).
                '--rt-span-y': String(node.grid.rowSpan),
              } as React.CSSProperties)
            : undefined
        }
      >
        {withCard(
        <NodeErrorBoundary typeName={def.label}>
          <NodeRenderer
            def={def}
            ctx={{
              node: { id: node.id, type: node.type },
              // 카탈로그에 속성이 새로 생기면 예전에 저장된 노드에는 그 값이 없다. 기본값을 먼저 깔고
              // 저장된 값을 덮어써야, 새 속성을 참조하는 렌더 코드가 undefined에서 터지지 않는다
              // (2026-08-19 실측: yLabel 추가 후 기존 차트가 전부 "렌더링 오류"로 떨어졌다).
              props: { ...def.defaultProps, ...node.props },
              data: hooks?.getData?.(node.id),
              dispatch: (eventName, payload) => hooks?.dispatch?.(node, eventName, payload),
              value: hooks?.getValue?.(node.id),
              onValueChange: hooks?.onValueChange ? (v) => hooks.onValueChange!(node.id, v) : undefined,
              children: def.isContainer ? renderNodeTree(nodes, node.id, hooks) : undefined,
            }}
          />
        </NodeErrorBoundary>
        )}
      </div>
    );
  });
}
