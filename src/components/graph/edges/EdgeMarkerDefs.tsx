'use client';

/** CONTAINS(다이아몬드)/REFERENCES(까마귀발)는 React Flow 기본 MarkerType에 없어 직접 정의한다.
 * 여기의 <style>은 RelationEdge의 흐름 애니메이션(점선 이동 + 이동하는 점)이 쓰는 keyframes로,
 * 모든 엣지가 공유하므로 한 번만 주입한다. */
export function EdgeMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker id="marker-diamond" viewBox="0 0 20 20" markerWidth="14" markerHeight="14" refX="18" refY="10" orient="auto-start-reverse">
          <polygon points="1,10 10,2 19,10 10,18" fill="white" stroke="#334155" strokeWidth="1.5" />
        </marker>
        <marker id="marker-crowsfoot" viewBox="0 0 20 20" markerWidth="14" markerHeight="14" refX="1" refY="10" orient="auto">
          <path d="M1,10 L19,2 M1,10 L19,10 M1,10 L19,18" fill="none" stroke="#059669" strokeWidth="1.5" />
        </marker>
      </defs>
      <style>{`
        @keyframes wa-edge-flow {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}
