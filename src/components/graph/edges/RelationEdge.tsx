'use client';

import { useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, useNodes, type EdgeProps } from '@xyflow/react';
import { computeAvoidingPath, computeOrthogonalPath, type Rect } from '@/components/graph/edge-routing';
import type { RFEdge } from '@/components/graph/types';

const DEFAULT_NODE_SIZE = { width: 220, height: 110 };

const KIND_STYLE: Record<
  string,
  {
    stroke: string;
    strokeWidth: number;
    dashed: boolean;
    curved: boolean;
    orthogonal: boolean;
    flowDuration: number;
    dash: string;
  }
> = {
  CONTAINS: {
    stroke: '#334155',
    strokeWidth: 1.5,
    dashed: false,
    curved: false,
    orthogonal: true,
    flowDuration: 3.2,
    dash: '2 6',
  },
  READS: { stroke: '#8b5cf6', strokeWidth: 1.5, dashed: false, curved: false, orthogonal: false, flowDuration: 1.8, dash: '2 6' },
  WRITES: { stroke: '#f59e0b', strokeWidth: 3, dashed: false, curved: false, orthogonal: false, flowDuration: 1.3, dash: '2 7' },
  TRIGGERS: { stroke: '#f59e0b', strokeWidth: 1.5, dashed: true, curved: false, orthogonal: false, flowDuration: 1, dash: '6 4' },
  NAVIGATES: { stroke: '#3b82f6', strokeWidth: 1.5, dashed: true, curved: true, orthogonal: false, flowDuration: 1.5, dash: '6 4' },
  REFERENCES: { stroke: '#059669', strokeWidth: 1.5, dashed: false, curved: false, orthogonal: false, flowDuration: 3.2, dash: '2 6' },
};

/**
 * 6종 kind를 이 컴포넌트 하나로 처리한다(마커는 edge 객체 레벨의 markerStart/markerEnd에서
 * 이미 결정되어 props로 들어온다 — CONTAINS/REFERENCES는 GraphShell에서 커스텀 SVG marker URL을,
 * 나머지는 MarkerType.ArrowClosed 객체를 지정해 React Flow가 자동 생성한 marker를 그대로 쓴다).
 *
 * 연결 방향/데이터 흐름을 시각적으로 드러내기 위해 두 가지 애니메이션을 함께 쓴다:
 * 1) 선 자체에 옅은 점선을 깔고 stroke-dashoffset을 소스→타깃 방향으로 흘려 "선이 흐르는" 느낌을 준다
 *    (선택되지 않은 굵은 실선도 이 옅은 점선 오버레이를 별도 path로 겹쳐 방향성을 유지한다).
 * 2) 그 위에 작은 점(circle) 하나가 <animateMotion>으로 path를 따라 반복 이동해, 방향을 훨씬 명확하게 보여준다
 *    (animateMotion은 path의 d 문자열 시작→끝 순서를 그대로 따라가는데, getSmoothStepPath/getBezierPath는
 *    항상 source→target 순서로 좌표를 만들기 때문에 별도 방향 계산 없이 소스→타깃으로 흐른다).
 *    (한때 1초 간격으로 여러 점을 스태거링해 스트림처럼 보이게 했었는데, 점이 너무 많아 오히려
 *    산만하다는 피드백으로 점 하나가 반복 왕복하는 원래 방식으로 되돌렸다.)
 *
 * 경로 자체도 가능하면 다른 노드를 가로지르지 않게 그린다. CONTAINS(포함)는 항상 상하좌우
 * 직선(대각선/곡선 없음)으로만 구성해야 해서 edge-routing.ts의 computeOrthogonalPath를 쓴다 —
 * 핸들 방향으로 꺾은선을 만들고, 그 선분이 다른 노드 박스를 관통하면 그 세그먼트만 장애물 바깥으로
 * 밀어 우회시킨다(style.orthogonal). 나머지 5종은 source/target을 잇는 직선이 제3의 노드 박스와
 * 겹칠 때 computeAvoidingPath로 위/아래를 살짝 부풀린 곡선으로 우회한다. 두 방식 모두 완전한
 * 장애물 회피 경로탐색은 아니라 "가장 먼저 걸리는 장애물 하나"만 처리하며, 겹겹이 막힌 배치처럼
 * "정말 피할 수 없는" 경우는 원래 경로로 남는다.
 */
export function RelationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerStart,
  markerEnd,
}: EdgeProps<RFEdge>) {
  const kind = data?.kind ?? 'READS';
  const style = KIND_STYLE[kind] ?? KIND_STYLE.READS;
  const nodes = useNodes();

  const [path, labelX, labelY] = useMemo(() => {
    const obstacles: Rect[] = nodes
      .filter((n) => n.id !== source && n.id !== target)
      .map((n) => {
        const w = n.measured?.width ?? DEFAULT_NODE_SIZE.width;
        const h = n.measured?.height ?? DEFAULT_NODE_SIZE.height;
        return { left: n.position.x, top: n.position.y, right: n.position.x + w, bottom: n.position.y + h };
      });

    if (style.orthogonal) {
      const routed = computeOrthogonalPath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, obstacles);
      return [routed.path, routed.labelX, routed.labelY] as const;
    }

    const avoided = computeAvoidingPath(sourceX, sourceY, targetX, targetY, obstacles);
    if (avoided) return [avoided.path, avoided.labelX, avoided.labelY] as const;

    return style.curved
      ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
      : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  }, [nodes, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style.curved, style.orthogonal]);

  const label = data?.labelText ?? (kind === 'REFERENCES' ? (data?.cardinality ?? undefined) : undefined);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? style.strokeWidth + 1.5 : style.strokeWidth,
          strokeDasharray: style.dashed ? '6 4' : undefined,
        }}
      />
      {/* 흐름 오버레이: 방향성이 드러나도록 옅은 점선을 계속 소스→타깃으로 흘린다 */}
      <path
        d={path}
        fill="none"
        stroke={style.stroke}
        strokeWidth={selected ? style.strokeWidth + 1 : style.strokeWidth}
        strokeOpacity={0.55}
        strokeLinecap="round"
        strokeDasharray={style.dash}
        style={{ animation: `wa-edge-flow ${style.flowDuration}s linear infinite` }}
      />
      {/* 이동하는 점: 데이터가 실제로 흘러가는 방향을 명확하게 표시 */}
      <circle r={selected ? 4.5 : 3.5} fill={style.stroke}>
        <animateMotion dur={`${style.flowDuration * 1.6}s`} repeatCount="indefinite" path={path} rotate="auto" />
      </circle>
      {label && (
        <EdgeLabelRenderer>
          <div
            className="rounded border bg-background px-1 py-0.5 text-[10px] text-foreground shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
