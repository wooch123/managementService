'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RFNode } from '@/components/graph/types';
import { TYPE_COLOR } from '@/components/graph/types';

export function PageNode({ data, selected }: NodeProps<RFNode>) {
  if (data.refType !== 'PAGE') return null;
  return (
    <div
      className={cn(
        'w-[220px] overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-primary'
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: TYPE_COLOR.PAGE }}>
        <FileText className="size-3.5" />
        <span className="truncate">{data.title}</span>
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="truncate">slug: {data.slug}</div>
        <div>자식 컴포넌트 {data.childCount}개</div>
        {data.icon && <div className="truncate">아이콘: {data.icon}</div>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
