'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type OnConnect,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import { toast } from 'sonner';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PageNode } from '@/components/graph/nodes/PageNode';
import { ComponentNode } from '@/components/graph/nodes/ComponentNode';
import { EntityNode } from '@/components/graph/nodes/EntityNode';
import { ActionNode } from '@/components/graph/nodes/ActionNode';
import { RelationEdge } from '@/components/graph/edges/RelationEdge';
import { EdgeMarkerDefs } from '@/components/graph/edges/EdgeMarkerDefs';
import { Toolbar } from '@/components/graph/Toolbar';
import { NodeDetailSheet } from '@/components/graph/NodeDetailSheet';
import { EdgeDetailPanel } from '@/components/graph/EdgeDetailPanel';
import { GraphSearch } from '@/components/graph/GraphSearch';
import { PageNav, collectPageScope, type PageNavItem } from '@/components/graph/PageNav';
import { toRFNode, toRFEdge } from '@/components/graph/convert';
import { applyTypeBandLayout, type LayoutDensity } from '@/components/graph/type-band-layout';
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  distributeHorizontal,
  distributeVertical,
  snapAllToGrid,
} from '@/components/graph/align-utils';
import { apiCall } from '@/lib/api-client';
import { findAllowedKind, type RefType } from '@/types/graph';
import { getComponentDef } from '@/lib/registry/catalog';
import type { GraphNodeDto, GraphEdgeDto } from '@/lib/db/graph';
import type { RFNode, RFEdge } from '@/components/graph/types';
import { TYPE_LABEL, TYPE_COLOR } from '@/components/graph/types';

const nodeTypes = { page: PageNode, component: ComponentNode, entity: EntityNode, action: ActionNode };
const edgeTypes = { relation: RelationEdge };

/** viewKey가 있으면 그 페이지 보기 전용 좌표로, 없으면 전체 구조 보기 좌표로 저장한다. */
async function savePositions(nodes: RFNode[], viewKey?: string | null): Promise<void> {
  if (nodes.length === 0) return;
  await apiCall('/api/admin/graph/nodes', {
    method: 'PATCH',
    body: JSON.stringify({
      items: nodes.map((n) => ({ refType: n.data.refType, refId: n.data.refId, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
      ...(viewKey ? { viewKey } : {}),
    }),
  });
}

type ViewPositions = Record<string, Record<string, { x: number; y: number }>>;

function GraphCanvas({
  initialNodes,
  initialEdges,
  initialViewPositions,
  initialSelectedNodeId,
  initialSelectedEdgeId,
}: {
  initialNodes: RFNode[];
  initialEdges: RFEdge[];
  /** 페이지별 보기에서 기억해 둔 좌표 (viewKey → nodeId → {x,y}) */
  initialViewPositions: ViewPositions;
  initialSelectedNodeId?: string | null;
  initialSelectedEdgeId?: string | null;
}) {
  const router = useRouter();
  const { setCenter, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailNode, setDetailNode] = useState<RFNode | null>(null);
  const [detailEdge, setDetailEdge] = useState<RFEdge | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<RefType>>(new Set(['PAGE', 'COMPONENT', 'ENTITY', 'ACTION']));
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [pendingTrigger, setPendingTrigger] = useState<{ source: RFNode; target: RFNode } | null>(null);
  /** null = 전체 구조 보기, 그 외 = 해당 페이지 범위만 보기 */
  const [activePageId, setActivePageId] = useState<string | null>(null);
  /** 페이지별 보기에서 기억한 좌표 — 저장된 노드만 그 보기에서 위치를 덮어쓴다(없으면 전체 좌표). */
  const [viewPositions, setViewPositions] = useState<ViewPositions>(initialViewPositions);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
        const toDelete = edges.filter((ed) => ed.selected && !ed.data?.derived);
        if (toDelete.length === 0) return;
        e.preventDefault();
        for (const ed of toDelete) void apiCall(`/api/admin/relations/${ed.id}`, { method: 'DELETE' });
        setEdges((eds) => eds.filter((ed) => !toDelete.some((d) => d.id === ed.id)));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [edges, setEdges]);

  // §8.5 "대상 링크 클릭 시 해당 요소가 선택된 상태로 편집 화면 이동" — 검증 화면에서 ACTION/
  // RELATION 이슈의 대상 링크로 들어올 때 한 번만 적용한다(마운트 시점 값만 사용).
  useEffect(() => {
    if (initialSelectedNodeId) {
      const node = initialNodes.find((n) => n.id === initialSelectedNodeId);
      if (node) {
        setCenter(node.position.x + (node.width ?? 220) / 2, node.position.y + (node.height ?? 120) / 2, { zoom: 1, duration: 400 });
        setDetailNode(node);
      }
    }
    if (initialSelectedEdgeId) {
      const edge = initialEdges.find((e) => e.id === initialSelectedEdgeId);
      if (edge) setDetailEdge(edge);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orphanIds = useMemo(() => {
    if (!orphanOnly) return new Set<string>();
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    return new Set(nodes.filter((n) => !connected.has(n.id)).map((n) => n.id));
  }, [orphanOnly, nodes, edges]);

  const pageItems = useMemo<PageNavItem[]>(
    () =>
      nodes
        .filter((n) => n.data.refType === 'PAGE')
        .map((n) => {
          const d = n.data as unknown as { refId: string; title: string; slug: string; icon: string | null };
          return {
            id: d.refId,
            title: d.title,
            slug: d.slug,
            icon: d.icon,
            nodeCount: nodes.filter((c) => c.data.refType === 'COMPONENT' && (c.data as { pageId?: string }).pageId === d.refId).length,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title, 'ko')),
    [nodes]
  );

  /** 페이지를 고른 경우 그 페이지 범위의 노드 id 집합(전체 보기면 null) */
  const pageScopeIds = useMemo(
    () => (activePageId ? collectPageScope(nodes, edges, activePageId) : null),
    [activePageId, nodes, edges]
  );

  const visibleNodes = useMemo(() => {
    const saved = activePageId ? viewPositions[activePageId] : undefined;
    return nodes
      .filter((n) => visibleTypes.has(n.data.refType))
      .filter((n) => !pageScopeIds || pageScopeIds.has(n.id))
      .map((n) => {
        // 이 보기에서 따로 정렬해 둔 위치가 있으면 그 좌표로 그린다(전체 구조 보기는 원본 그대로).
        const pos = saved?.[n.id];
        const withPos = pos ? { ...n, position: pos } : n;
        return orphanIds.has(n.id)
          ? { ...withPos, style: { ...withPos.style, outline: '2px solid #ef4444', outlineOffset: 2 } }
          : withPos;
      });
  }, [nodes, visibleTypes, orphanIds, pageScopeIds, activePageId, viewPositions]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  // 보기 범위(전체 ↔ 페이지)를 바꾸면 그 범위가 한눈에 들어오도록 화면을 맞춘다.
  useEffect(() => {
    const timer = setTimeout(() => void fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [edges, visibleNodeIds]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      if (!source || !target) return;

      const kind = findAllowedKind(source.data.refType, target.data.refType);
      if (!kind) {
        toast.error(`${TYPE_LABEL[source.data.refType]}는 ${TYPE_LABEL[target.data.refType]}에 연결할 수 없습니다.`);
        return;
      }

      if (kind === 'TRIGGERS') {
        setPendingTrigger({ source, target });
        return;
      }

      void createRelation(source, target, kind);
    },
    [nodes] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function createRelation(source: RFNode, target: RFNode, kind: 'READS' | 'WRITES' | 'TRIGGERS' | 'NAVIGATES', eventName?: string) {
    const result = await apiCall<GraphEdgeDto & { id: string }>('/api/admin/relations', {
      method: 'POST',
      body: JSON.stringify({
        fromType: source.data.refType,
        fromId: source.data.refId,
        toType: target.data.refType,
        toId: target.data.refId,
        kind,
        eventName,
      }),
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setEdges((eds) => [
      ...eds,
      toRFEdge({
        id: result.data.id,
        fromType: source.data.refType,
        fromId: source.data.refId,
        toType: target.data.refType,
        toId: target.data.refId,
        kind,
        cardinality: null,
        labelText: null,
        derived: false,
      }),
    ]);
  }

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: RFNode, draggedNodes: RFNode[]) => {
      const moved = draggedNodes.length > 0 ? draggedNodes : [_node];
      if (activePageId) {
        // 페이지 보기에서 옮긴 위치는 그 페이지에만 기억한다.
        setViewPositions((prev) => ({
          ...prev,
          [activePageId]: {
            ...(prev[activePageId] ?? {}),
            ...Object.fromEntries(moved.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
          },
        }));
      } else {
        setNodes((nds) => nds.map((n) => moved.find((m) => m.id === n.id) ?? n));
      }
      void savePositions(moved, activePageId);
    },
    [activePageId, setNodes]
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: sel }) => {
    setSelectedIds(new Set(sel.map((n) => n.id)));
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setDetailNode(node as RFNode);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const data = (node as RFNode).data;
      if (data.refType === 'PAGE') router.push(`/admin/builder?pageId=${data.refId}`);
      else if (data.refType === 'COMPONENT') router.push(`/admin/builder?pageId=${data.pageId}`);
      else if (data.refType === 'ENTITY') router.push('/admin/data');
    },
    [router]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback((_e, edge) => {
    setDetailEdge(edge as RFEdge);
  }, []);

  function applyAndPersist(next: RFNode[]) {
    setNodes(next);
    void savePositions(next.filter((n) => selectedIds.has(n.id)));
  }

  function handleAlign(dir: 'left' | 'right' | 'top' | 'bottom') {
    const fn = { left: alignLeft, right: alignRight, top: alignTop, bottom: alignBottom }[dir];
    applyAndPersist(fn(nodes, selectedIds));
  }
  function handleDistribute(dir: 'horizontal' | 'vertical') {
    const fn = dir === 'horizontal' ? distributeHorizontal : distributeVertical;
    applyAndPersist(fn(nodes, selectedIds));
  }
  function handleSnapAll() {
    const next = snapAllToGrid(nodes);
    setNodes(next);
    void savePositions(next);
  }
  /** 자동 배치는 **지금 보이는 범위**만 대상으로 한다 — 페이지를 골라 놓았으면 그 페이지의
   * 노드만 재배치하고 나머지 좌표는 건드리지 않는다(전체 보기에서는 지금까지처럼 전부). */
  /** 같은 규칙을 한 번에 적용한다 — **전체 구조는 전체 노드 기준으로**, 각 페이지는 그 페이지
   * 범위 기준으로 따로 배치해 각각의 보기에 기억시킨다. */
  async function autoLayoutAllPages(direction: 'TB' | 'LR', density: LayoutDensity) {
    // 1) 전체 구조 보기 — 모든 노드를 한 배열로 재배치한다.
    const allScoped = nodes.filter((n) => visibleTypes.has(n.data.refType));
    if (allScoped.length > 0) {
      const allLaidOut = applyTypeBandLayout(allScoped, direction, density);
      const byId = new Map(allLaidOut.map((n) => [n.id, n]));
      setNodes(nodes.map((n) => byId.get(n.id) ?? n));
      await savePositions(allLaidOut);
    }

    // 2) 페이지별 보기 — 각 페이지 범위만 따로 배치한다.
    const nextViews: ViewPositions = { ...viewPositions };
    let touched = 0;
    for (const page of pageItems) {
      const scopeIds = collectPageScope(nodes, edges, page.id);
      const scoped = nodes.filter((n) => scopeIds.has(n.id) && visibleTypes.has(n.data.refType));
      if (scoped.length === 0) continue;
      const laidOut = applyTypeBandLayout(scoped, direction, density);
      nextViews[page.id] = {
        ...(nextViews[page.id] ?? {}),
        ...Object.fromEntries(laidOut.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
      };
      await savePositions(laidOut, page.id);
      touched += 1;
    }
    setViewPositions(nextViews);
    setTimeout(() => void fitView({ padding: 0.15, duration: 400 }), 50);
    toast.success(`전체 구조와 ${touched}개 페이지에 자동 배치를 일괄 적용했습니다.`);
  }

  function handleAutoLayout(direction: 'TB' | 'LR', density: LayoutDensity, scope: 'current' | 'all-pages' = 'current') {
    if (scope === 'all-pages') {
      void autoLayoutAllPages(direction, density);
      return;
    }
    const scopedNodes = visibleNodes;
    const laidOut = applyTypeBandLayout(scopedNodes, direction, density);

    if (activePageId) {
      // 페이지별 배치는 그 페이지 보기에만 기억한다 — 전체 구조 보기와 다른 페이지 배치는 그대로 둔다.
      setViewPositions((prev) => ({
        ...prev,
        [activePageId]: {
          ...(prev[activePageId] ?? {}),
          ...Object.fromEntries(laidOut.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
        },
      }));
    } else {
      const byId = new Map(laidOut.map((n) => [n.id, n]));
      setNodes(nodes.map((n) => byId.get(n.id) ?? n));
    }
    void savePositions(laidOut, activePageId);
    // 재배치 후에는 화면도 새 배열에 맞춰준다 — 그러지 않으면 노드가 화면 밖으로 나가 "빈 캔버스"처럼 보인다.
    setTimeout(() => void fitView({ padding: 0.15, duration: 400 }), 50);
    if (activePageId) toast.success(`이 페이지 범위의 노드 ${laidOut.length}개만 재배치했습니다.`);
  }

  function handleSearchSelect(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setCenter(node.position.x + (node.width ?? 220) / 2, node.position.y + (node.height ?? 120) / 2, { zoom: 1, duration: 400 });
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
  }

  async function handleEdgeSave(id: string, patch: { labelText: string | null; cardinality: string | null }) {
    const result = await apiCall(`/api/admin/relations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e)));
    setDetailEdge(null);
  }

  async function handleEdgeDelete(id: string) {
    await apiCall(`/api/admin/relations/${id}`, { method: 'DELETE' });
    setEdges((eds) => eds.filter((e) => e.id !== id));
    setDetailEdge(null);
  }

  const triggerEvents = pendingTrigger ? getComponentDef(pendingTrigger.source.data.type as string)?.events ?? [] : [];

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar
        visibleTypes={visibleTypes}
        onToggleType={(t) =>
          setVisibleTypes((prev) => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return next;
          })
        }
        orphanOnly={orphanOnly}
        onToggleOrphanOnly={() => setOrphanOnly((v) => !v)}
        selectedCount={selectedIds.size}
        onAlign={handleAlign}
        onDistribute={handleDistribute}
        onSnapAll={handleSnapAll}
        onAutoLayout={handleAutoLayout}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <PageNav
          pages={pageItems}
          activePageId={activePageId}
          onSelect={setActivePageId}
          totalNodeCount={nodes.length}
        />
        <div className="relative flex-1">
        <EdgeMarkerDefs />
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          snapToGrid
          snapGrid={[20, 20]}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} />
          <Controls className="[&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button]:!stroke-foreground [&_button:hover]:!bg-accent" />
          {/* MiniMap을 자체 bottom-right 절대배치 대신 우리가 만든 Panel 안에 흘려 넣어서, 접기
              토글 버튼과 세로로 함께 쌓이게 한다 (style로 position:static 지정해 MiniMap 자체의
              절대배치를 무력화). */}
          <Panel position="bottom-right" className="flex flex-col items-end gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="border border-border bg-card shadow-sm"
              onClick={() => setMinimapOpen((v) => !v)}
              aria-label={minimapOpen ? '미니맵 접기' : '미니맵 펼치기'}
              title={minimapOpen ? '미니맵 접기' : '미니맵 펼치기'}
            >
              {minimapOpen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
            {minimapOpen && (
              <MiniMap
                pannable
                zoomable
                style={{ position: 'static', margin: 0, width: 260, height: 190 }}
                className="!border !border-border !bg-card"
                maskColor="color-mix(in oklch, var(--color-background) 70%, transparent)"
                nodeColor={(n) => TYPE_COLOR[(n.data as { refType?: keyof typeof TYPE_COLOR }).refType ?? 'PAGE']}
                nodeStrokeWidth={0}
              />
            )}
          </Panel>
        </ReactFlow>
        <EdgeDetailPanel edge={detailEdge} onClose={() => setDetailEdge(null)} onSave={handleEdgeSave} onDelete={handleEdgeDelete} />
        </div>
      </div>

      <NodeDetailSheet
        node={detailNode}
        onClose={() => setDetailNode(null)}
        onActionUpdated={(refId, patch) =>
          setNodes((nds) => nds.map((n) => (n.data.refId === refId && n.data.refType === 'ACTION' ? { ...n, data: { ...n.data, ...patch } } : n)))
        }
      />

      <GraphSearch open={searchOpen} onOpenChange={setSearchOpen} nodes={nodes} onSelect={handleSearchSelect} />

      <Dialog open={!!pendingTrigger} onOpenChange={(o) => !o && setPendingTrigger(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>어느 이벤트에 연결할까요?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {triggerEvents.length === 0 && <p className="text-sm text-muted-foreground">이 컴포넌트는 이벤트가 없습니다.</p>}
            {triggerEvents.map((ev) => (
              <Button
                key={ev.name}
                variant="outline"
                className="justify-start"
                onClick={() => {
                  if (pendingTrigger) void createRelation(pendingTrigger.source, pendingTrigger.target, 'TRIGGERS', ev.name);
                  setPendingTrigger(null);
                }}
              >
                {ev.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GraphShell({
  initialData,
  initialSelectedNodeId,
  initialSelectedEdgeId,
}: {
  initialData: { nodes: (GraphNodeDto & { data: unknown })[]; edges: GraphEdgeDto[]; viewPositions?: ViewPositions };
  initialSelectedNodeId?: string | null;
  initialSelectedEdgeId?: string | null;
}) {
  const initialNodes = initialData.nodes.map(toRFNode);
  const initialEdges = initialData.edges.map(toRFEdge);

  return (
    <ReactFlowProvider>
      <GraphCanvas
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        initialViewPositions={initialData.viewPositions ?? {}}
        initialSelectedNodeId={initialSelectedNodeId}
        initialSelectedEdgeId={initialSelectedEdgeId}
      />
    </ReactFlowProvider>
  );
}
