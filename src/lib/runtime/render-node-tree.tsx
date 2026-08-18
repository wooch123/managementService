import { getComponentDef } from '@/lib/registry/catalog';
import { NodeErrorBoundary } from '@/components/builder/NodeErrorBoundary';
import type { ComponentDef, RenderContext } from '@/lib/registry/types';
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
const SELF_SURFACED = new Set(['card', 'alert']);

/**
 * §12.2 렌더 파이프라인의 축소판. `hooks`가 주어지면(미리보기/운영) 실제 dispatch와
 * 입력값 추적을 연결하고, 없으면(빌더 캔버스) 지금까지처럼 정적으로 렌더한다.
 */
export function renderNodeTree(nodes: NodeDto[], parentId: string | null = null, hooks?: RuntimeHooks): React.ReactNode {
  const children = nodes.filter((n) => n.parentNodeId === parentId).sort((a, b) => a.order - b.order);

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
    // 배치된 컴포넌트는 모두 카드 표면 위에 올린다(§3 디자인 규칙) — 자기 테두리를 이미 가진
    // 컴포넌트만 예외로 두어 테두리가 겹치지 않게 한다.
    const withCard = (content: React.ReactNode) =>
      isRoot && !SELF_SURFACED.has(node.type) ? (
        // Tremor식 카드 표면: 그림자 대신 1px 테두리, 반지름 8px, 넉넉한 안쪽 여백.
        <div className="flex h-full flex-col rounded-lg border bg-card p-4 text-card-foreground">
          <div className="min-h-0 flex-1">{content}</div>
        </div>
      ) : (
        content
      );

    return (
      <div
        key={node.id}
        className={isRoot ? 'min-h-0' : undefined}
        style={
          isRoot
            ? {
                gridColumn: `${node.grid.col} / span ${node.grid.span}`,
                gridRow: `${node.grid.row} / span ${node.grid.rowSpan}`,
              }
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
