'use client';

import { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { TYPE_LABEL } from '@/components/graph/types';
import type { RFNode } from '@/components/graph/types';

function labelOf(n: RFNode): string {
  switch (n.data.refType) {
    case 'PAGE':
      return n.data.title;
    case 'COMPONENT':
      return n.data.label ?? n.data.type;
    case 'ENTITY':
      return n.data.name;
    case 'ACTION':
      return n.data.name;
  }
}

export function GraphSearch({ open, onOpenChange, nodes, onSelect }: { open: boolean; onOpenChange: (o: boolean) => void; nodes: RFNode[]; onSelect: (nodeId: string) => void }) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="노드 검색" description="이름으로 노드를 찾아 이동합니다">
      <Command>
        <CommandInput placeholder="노드 이름 검색..." />
        <CommandList>
          <CommandEmpty>결과가 없습니다</CommandEmpty>
          <CommandGroup>
            {nodes.map((n) => (
              <CommandItem
                key={n.id}
                value={`${labelOf(n)} ${TYPE_LABEL[n.data.refType]}`}
                onSelect={() => {
                  onSelect(n.id);
                  onOpenChange(false);
                }}
              >
                <span className="text-xs text-muted-foreground">[{TYPE_LABEL[n.data.refType]}]</span> {labelOf(n)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
