'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Component } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RFNode } from '@/components/graph/types';
import { TYPE_COLOR } from '@/components/graph/types';

export function ComponentNode({ data, selected }: NodeProps<RFNode>) {
  if (data.refType !== 'COMPONENT') return null;
  return (
    <div
      className={cn(
        'w-[220px] overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-primary'
      )}
    >
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" />
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white"
        style={{ backgroundColor: TYPE_COLOR.COMPONENT }}
      >
        <Component className="size-3.5" />
        <span className="truncate">{data.label ?? data.type}</span>
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div>타입: {data.type}</div>
        <div>바인딩: {data.hasBinding ? '연결됨' : '없음'}</div>
        <div>연결된 이벤트 {data.eventCount}개</div>
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
