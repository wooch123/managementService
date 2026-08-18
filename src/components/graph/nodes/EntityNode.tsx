'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RFNode } from '@/components/graph/types';
import { TYPE_COLOR } from '@/components/graph/types';

const MAX_VISIBLE_FIELDS = 8;

export function EntityNode({ data, selected }: NodeProps<RFNode>) {
  if (data.refType !== 'ENTITY') return null;
  const visible = data.fields.slice(0, MAX_VISIBLE_FIELDS);
  const overflow = data.fields.length - visible.length;

  return (
    <div
      className={cn(
        'w-[240px] overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-primary'
      )}
    >
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" />
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white"
        style={{ backgroundColor: TYPE_COLOR.ENTITY }}
      >
        <Database className="size-3.5" />
        <span className="truncate">{data.name}</span>
      </div>
      <div className="divide-y">
        {visible.map((f) => (
          <div key={f.name} className="flex items-center justify-between px-2 py-1 text-[11px]">
            <span className="truncate">{f.name}: {f.dataType}</span>
            <span className="ml-1 shrink-0 text-muted-foreground">
              {[f.isPrimary && 'PK', f.isUnique && 'UQ', f.isRequired && 'NN'].filter(Boolean).join(' ')}
            </span>
          </div>
        ))}
        {overflow > 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">+{overflow}개 더</div>}
        {data.fields.length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">필드 없음</div>}
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
