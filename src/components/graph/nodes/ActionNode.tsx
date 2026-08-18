'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RFNode } from '@/components/graph/types';
import { TYPE_COLOR } from '@/components/graph/types';

export function ActionNode({ data, selected }: NodeProps<RFNode>) {
  if (data.refType !== 'ACTION') return null;
  return (
    <div
      className={cn(
        'w-[220px] overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-primary'
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: TYPE_COLOR.ACTION }}>
        <Zap className="size-3.5" />
        <span className="truncate">{data.name}</span>
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div>종류: {data.kind}</div>
        {data.description && <div className="truncate">{data.description}</div>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
