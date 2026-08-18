'use client';

import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import { getCatalogByGroup } from '@/lib/registry/catalog';
import type { ComponentDef } from '@/lib/registry/types';
import { useCanvasStore } from '@/components/builder/canvas-store';
import { cn } from '@/lib/utils';

export function ComponentPalette() {
  const [tab, setTab] = useState<'components' | 'structure'>('components');
  const [search, setSearch] = useState('');
  const grouped = useMemo(() => getCatalogByGroup(), []);

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    const out: typeof grouped = { ...grouped };
    for (const key of Object.keys(grouped) as (keyof typeof grouped)[]) {
      out[key] = grouped[key].filter(
        (def) =>
          def.label.toLowerCase().includes(q) ||
          def.key.toLowerCase().includes(q) ||
          def.description.toLowerCase().includes(q)
      );
    }
    return out;
  }, [grouped, search]);

  return (
    <div className="flex h-full flex-col border-r">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'components' | 'structure')} className="flex h-full flex-col">
        <div className="border-b p-2">
          <TabsList className="w-full">
            <TabsTrigger value="components" className="flex-1">
              컴포넌트
            </TabsTrigger>
            <TabsTrigger value="structure" className="flex-1">
              구조(트리)
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="components" className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-2 p-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="컴포넌트 검색"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <Accordion type="multiple" defaultValue={Object.keys(grouped)}>
                {Object.entries(filteredGrouped).map(([group, defs]) =>
                  defs.length > 0 ? (
                    <AccordionItem key={group} value={group}>
                      <AccordionTrigger className="text-xs">{group}</AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-1">
                        {defs.map((def) => (
                          <PaletteItem key={def.key} def={def} />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ) : null
                )}
              </Accordion>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="structure" className="flex-1 overflow-y-auto p-2">
          <StructureTree />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaletteItem({ def }: { def: ComponentDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${def.key}`,
    data: { source: 'palette', componentKey: def.key },
  });

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className={cn(
            'flex h-11 cursor-grab items-center gap-2 rounded-md border px-2 text-sm hover:bg-accent active:cursor-grabbing',
            isDragging && 'opacity-40'
          )}
        >
          <DynamicIcon name={def.icon} className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{def.label}</span>
            <span className="truncate text-[10px] text-muted-foreground">{def.key}</span>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-56">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{def.label}</span>
          <span className="text-xs text-muted-foreground">{def.description}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function StructureTree() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const select = useCanvasStore((s) => s.select);

  const roots = nodes.filter((n) => !n.parentNodeId);

  if (nodes.length === 0) {
    return <p className="p-4 text-center text-xs text-muted-foreground">캔버스에 컴포넌트를 배치하세요</p>;
  }

  function renderNode(id: string, depth: number) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    const children = nodes.filter((n) => n.parentNodeId === id).sort((a, b) => a.order - b.order);
    return (
      <div key={id}>
        <button
          type="button"
          onClick={() => select(id)}
          style={{ paddingLeft: depth * 16 }}
          className={cn(
            'flex w-full items-center rounded-md px-2 py-1 text-left text-xs hover:bg-accent',
            selectedId === id && 'bg-accent font-medium'
          )}
        >
          {node.label || node.type}
        </button>
        {children.map((c) => renderNode(c.id, depth + 1))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {roots
        .sort((a, b) => a.order - b.order)
        .map((n) => renderNode(n.id, 0))}
    </div>
  );
}
