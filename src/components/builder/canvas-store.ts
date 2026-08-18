'use client';

import { create } from 'zustand';
import { temporal } from 'zundo';
import type { NodeDto } from '@/lib/db/nodes';

export type CanvasNode = NodeDto;
export type Viewport = 'desktop' | 'tablet' | 'mobile';
export type Region = 'main' | 'aside';

type CanvasState = {
  pageId: string | null;
  nodes: CanvasNode[];
  selectedId: string | null;
  viewport: Viewport;
  /** 캔버스에서 지금 편집 중인 화면 영역 — 본문 그리드 / 우측 플로팅 패널 */
  activeRegion: Region;
  loadPage: (pageId: string, nodes: CanvasNode[]) => void;
  select: (id: string | null) => void;
  setViewport: (v: CanvasState['viewport']) => void;
  setRegion: (r: Region) => void;
  /** 노드를 다른 화면 영역으로 옮긴다(자손도 함께). */
  setNodeRegion: (id: string, region: Region) => void;
  addNode: (node: CanvasNode) => void;
  updateNode: (
    id: string,
    patch: Partial<{
      props: Partial<CanvasNode['props']>;
      grid: Partial<CanvasNode['grid']>;
      events: CanvasNode['events'];
      label: CanvasNode['label'];
      binding: CanvasNode['binding'];
    }>
  ) => void;
  moveNode: (id: string, parentNodeId: string | null, order: number) => void;
  removeSubtree: (id: string) => void;
  duplicateLocal: (id: string, newNode: CanvasNode) => void;
};

function collectDescendantIds(nodes: CanvasNode[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parentNodeId && ids.has(n.parentNodeId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
    }
  }
  return ids;
}

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set) => ({
      pageId: null,
      nodes: [],
      selectedId: null,
      viewport: 'desktop',
      activeRegion: 'main',

      loadPage: (pageId, nodes) => set({ pageId, nodes, selectedId: null }),
      select: (id) => set({ selectedId: id }),
      setViewport: (v) => set({ viewport: v }),
      setRegion: (r) => set({ activeRegion: r, selectedId: null }),
      setNodeRegion: (id, region) =>
        set((s) => {
          const ids = collectDescendantIds(s.nodes, id);
          return { nodes: s.nodes.map((n) => (ids.has(n.id) ? { ...n, region } : n)) };
        }),

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node], selectedId: node.id })),

      updateNode: (id, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  ...(patch.props ? { props: { ...n.props, ...patch.props } } : {}),
                  ...(patch.grid ? { grid: { ...n.grid, ...patch.grid } } : {}),
                  ...(patch.events ? { events: { ...n.events, ...patch.events } } : {}),
                  ...(patch.label !== undefined ? { label: patch.label } : {}),
                  ...(patch.binding !== undefined ? { binding: patch.binding } : {}),
                }
              : n
          ),
        })),

      moveNode: (id, parentNodeId, order) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, parentNodeId, order } : n)),
        })),

      removeSubtree: (id) =>
        set((s) => {
          const toRemove = collectDescendantIds(s.nodes, id);
          return {
            nodes: s.nodes.filter((n) => !toRemove.has(n.id)),
            selectedId: s.selectedId && toRemove.has(s.selectedId) ? null : s.selectedId,
          };
        }),

      duplicateLocal: (_id, newNode) =>
        set((s) => ({ nodes: [...s.nodes, newNode], selectedId: newNode.id })),
    }),
    {
      limit: 50,
      partialize: (state) => ({ nodes: state.nodes }),
    }
  )
);

export const useCanvasTemporal = () => useCanvasStore.temporal;
