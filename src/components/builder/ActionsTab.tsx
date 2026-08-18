'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { ActionEditorSheet, type ActionSummary } from '@/components/actions/ActionEditorSheet';
import { useCanvasStore } from '@/components/builder/canvas-store';
import { getComponentDef } from '@/lib/registry/catalog';
import { apiCall } from '@/lib/api-client';

export function ActionsTab() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const allNodes = useCanvasStore((s) => s.nodes);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const [actions, setActions] = useState<ActionSummary[]>([]);
  const [editorTarget, setEditorTarget] = useState<{ action: ActionSummary | null; eventName: string } | null>(null);

  async function refetchActions() {
    const result = await apiCall<ActionSummary[]>('/api/admin/actions');
    if (result.ok) setActions(result.data);
  }

  useEffect(() => {
    refetchActions();
  }, []);

  if (!selectedId || !node) return null;
  const def = getComponentDef(node.type);
  if (!def) return null;

  if (def.events.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">이 컴포넌트는 지원하는 이벤트가 없습니다.</p>;
  }

  function connectAction(eventName: string, actionId: string | null) {
    const events = { ...node!.events };
    if (actionId) events[eventName] = actionId;
    else delete events[eventName];
    updateNode(selectedId!, { events });
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {def.events.map((ev) => {
        const connectedId = node.events[ev.name];
        const connectedAction = actions.find((a) => a.id === connectedId);
        return (
          <div key={ev.name} className="flex flex-col gap-1.5 rounded-md border p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{ev.label}</span>
              {connectedAction && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setEditorTarget({ action: connectedAction, eventName: ev.name })}>
                  {connectedAction.name}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Select value={connectedId ?? 'none'} onValueChange={(v) => connectAction(ev.name, v === 'none' ? null : v)}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="액션 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">연결 안 함</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setEditorTarget({ action: null, eventName: ev.name })}>
                <Plus className="size-3.5" /> 새 액션
              </Button>
            </div>
          </div>
        );
      })}

      <ActionEditorSheet
        action={editorTarget?.action ?? null}
        open={!!editorTarget}
        onClose={() => setEditorTarget(null)}
        onSaved={(saved) => {
          void refetchActions();
          if (editorTarget && !editorTarget.action) {
            connectAction(editorTarget.eventName, saved.id);
          }
        }}
        pageNodes={allNodes}
      />
    </div>
  );
}
