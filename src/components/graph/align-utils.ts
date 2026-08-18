import type { RFNode } from '@/components/graph/types';

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

function mapSelected(nodes: RFNode[], ids: Set<string>, fn: (n: RFNode) => RFNode): RFNode[] {
  return nodes.map((n) => (ids.has(n.id) ? fn(n) : n));
}

export function alignLeft(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const xs = nodes.filter((n) => ids.has(n.id)).map((n) => n.position.x);
  const min = Math.min(...xs);
  return mapSelected(nodes, ids, (n) => ({ ...n, position: { ...n.position, x: snap(min) } }));
}

export function alignRight(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const rights = nodes.filter((n) => ids.has(n.id)).map((n) => n.position.x + (n.width ?? 220));
  const max = Math.max(...rights);
  return mapSelected(nodes, ids, (n) => ({ ...n, position: { ...n.position, x: snap(max - (n.width ?? 220)) } }));
}

export function alignTop(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const ys = nodes.filter((n) => ids.has(n.id)).map((n) => n.position.y);
  const min = Math.min(...ys);
  return mapSelected(nodes, ids, (n) => ({ ...n, position: { ...n.position, y: snap(min) } }));
}

export function alignBottom(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const bottoms = nodes.filter((n) => ids.has(n.id)).map((n) => n.position.y + (n.height ?? 120));
  const max = Math.max(...bottoms);
  return mapSelected(nodes, ids, (n) => ({ ...n, position: { ...n.position, y: snap(max - (n.height ?? 120)) } }));
}

export function distributeHorizontal(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const selected = nodes.filter((n) => ids.has(n.id)).sort((a, b) => a.position.x - b.position.x);
  if (selected.length < 3) return nodes;
  const first = selected[0].position.x;
  const last = selected[selected.length - 1].position.x;
  const step = (last - first) / (selected.length - 1);
  const newX = new Map(selected.map((n, i) => [n.id, snap(first + step * i)]));
  return nodes.map((n) => (newX.has(n.id) ? { ...n, position: { ...n.position, x: newX.get(n.id)! } } : n));
}

export function distributeVertical(nodes: RFNode[], ids: Set<string>): RFNode[] {
  const selected = nodes.filter((n) => ids.has(n.id)).sort((a, b) => a.position.y - b.position.y);
  if (selected.length < 3) return nodes;
  const first = selected[0].position.y;
  const last = selected[selected.length - 1].position.y;
  const step = (last - first) / (selected.length - 1);
  const newY = new Map(selected.map((n, i) => [n.id, snap(first + step * i)]));
  return nodes.map((n) => (newY.has(n.id) ? { ...n, position: { ...n.position, y: newY.get(n.id)! } } : n));
}

export function snapAllToGrid(nodes: RFNode[]): RFNode[] {
  return nodes.map((n) => ({ ...n, position: { x: snap(n.position.x), y: snap(n.position.y) } }));
}
