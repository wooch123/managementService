'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EntitySelect, useEntities, useEntityFields, FilterBuilder } from '@/components/builder/BindingEditor';
import { apiCall } from '@/lib/api-client';
import { ACTION_KINDS } from '@/types/graph';
import { defaultConfigFor, type ActionConfig, type ValueSource, type ActionKind } from '@/lib/actions/schema';
import { summarizeAction, fieldLabelLookup } from '@/lib/actions/summarize';
import type { Field } from '@prisma/client';
import type { Filter } from '@/types/binding';
import type { CanvasNode } from '@/components/builder/canvas-store';

export type ActionSummary = { id: string; name: string; kind: string; description: string | null; configJson: string };

const KIND_LABEL: Record<ActionKind, string> = {
  CREATE: '생성',
  UPDATE: '수정',
  DELETE: '삭제',
  QUERY: '조회',
  NAVIGATE: '페이지 이동',
  OPEN_MODAL: '모달 열기',
  CLOSE_MODAL: '모달 닫기',
  TOAST: '토스트',
  EXPORT_CSV: 'CSV 내보내기',
  COMPOSITE: '복합 실행',
};

function ValueSourceEditor({ value, onChange }: { value: ValueSource; onChange: (v: ValueSource) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Select value={value.from} onValueChange={(v) => onChange(defaultValueSource(v as ValueSource['from']))}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="literal">고정값</SelectItem>
          <SelectItem value="component">컴포넌트 값</SelectItem>
          <SelectItem value="selection">선택된 행</SelectItem>
          <SelectItem value="route">라우트 파라미터</SelectItem>
          <SelectItem value="now">현재 시각</SelectItem>
          <SelectItem value="user">현재 사용자</SelectItem>
          <SelectItem value="sequence">자동 번호</SelectItem>
        </SelectContent>
      </Select>
      {value.from === 'literal' && (
        <Input className="h-8" value={String(value.value ?? '')} onChange={(e) => onChange({ from: 'literal', value: e.target.value })} placeholder="값" />
      )}
      {value.from === 'component' && (
        <Input className="h-8" value={value.nodeId} onChange={(e) => onChange({ from: 'component', nodeId: e.target.value })} placeholder="컴포넌트 노드 id" />
      )}
      {value.from === 'selection' && (
        <>
          <Input className="h-8 w-24" value={value.nodeId} onChange={(e) => onChange({ ...value, nodeId: e.target.value })} placeholder="노드 id" />
          <Input className="h-8 w-24" value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })} placeholder="필드" />
        </>
      )}
      {value.from === 'route' && (
        <Input className="h-8" value={value.param} onChange={(e) => onChange({ from: 'route', param: e.target.value })} placeholder="파라미터명" />
      )}
      {value.from === 'sequence' && (
        <>
          <Input
            className="h-8 w-28"
            value={value.prefix}
            onChange={(e) => onChange({ ...value, prefix: e.target.value })}
            placeholder="접두사 ASG-"
          />
          <Input
            className="h-8 w-20"
            type="number"
            min={3}
            max={10}
            value={value.digits}
            onChange={(e) => onChange({ ...value, digits: Number(e.target.value) || 6 })}
            placeholder="자릿수"
          />
        </>
      )}
    </div>
  );
}

function defaultValueSource(from: ValueSource['from']): ValueSource {
  switch (from) {
    case 'literal':
      return { from: 'literal', value: '' };
    case 'component':
      return { from: 'component', nodeId: '' };
    case 'selection':
      return { from: 'selection', nodeId: '', field: '' };
    case 'route':
      return { from: 'route', param: '' };
    case 'now':
      return { from: 'now' };
    case 'user':
      return { from: 'user' };
    case 'sequence':
      return { from: 'sequence', prefix: '', digits: 6 };
  }
}

function FieldMappingTable({
  entityId,
  fieldMap,
  onChange,
  pageNodes,
}: {
  entityId: string;
  fieldMap: Record<string, ValueSource>;
  onChange: (m: Record<string, ValueSource>) => void;
  pageNodes?: CanvasNode[];
}) {
  const fields = useEntityFields(entityId || null);
  const [autoMapContainer, setAutoMapContainer] = useState('');

  const containers = useMemo(() => (pageNodes ?? []).filter((n) => n.id), [pageNodes]);

  function runAutoMap() {
    if (!pageNodes) return;
    const descendants = collectDescendants(pageNodes, autoMapContainer);
    const next: Record<string, ValueSource> = { ...fieldMap };
    for (const node of descendants) {
      const binding = node.binding as { mode: string; entityId?: string; fieldId?: string } | null;
      if (binding?.mode === 'field' && binding.entityId === entityId && binding.fieldId) {
        next[binding.fieldId] = { from: 'component', nodeId: node.id };
      }
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {pageNodes && (
        <div className="flex items-center gap-1 rounded-md border border-dashed p-1.5">
          <Select value={autoMapContainer || undefined} onValueChange={setAutoMapContainer}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="폼 컨테이너 선택" />
            </SelectTrigger>
            <SelectContent>
              {containers.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label ?? n.type} ({n.id.slice(-4)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!autoMapContainer} onClick={runAutoMap}>
            폼 컴포넌트로부터 자동 매핑
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>대상 필드</TableHead>
              <TableHead>값 출처</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((f) => {
              const mapped = fieldMap[f.id];
              return (
                <TableRow key={f.id}>
                  <TableCell className="text-sm">{f.name}</TableCell>
                  <TableCell>
                    {mapped ? (
                      <ValueSourceEditor value={mapped} onChange={(v) => onChange({ ...fieldMap, [f.id]: v })} />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onChange({ ...fieldMap, [f.id]: { from: 'literal', value: '' } })}
                      >
                        <Plus className="size-3.5" /> 매핑 추가
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {mapped && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          const next = { ...fieldMap };
                          delete next[f.id];
                          onChange(next);
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function collectDescendants(nodes: CanvasNode[], rootId: string): CanvasNode[] {
  const out: CanvasNode[] = [];
  const queue = nodes.filter((n) => n.parentNodeId === rootId);
  while (queue.length > 0) {
    const n = queue.shift()!;
    out.push(n);
    queue.push(...nodes.filter((c) => c.parentNodeId === n.id));
  }
  return out;
}

function FollowUpSelect({ value, actions, onChange, label }: { value: string | null | undefined; actions: ActionSummary[]; onChange: (v: string | null) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">없음</SelectItem>
          {actions.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SortableStep({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-md border bg-card p-2"
    >
      <button type="button" {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 text-sm">{name}</span>
      <Button variant="ghost" size="icon-sm" onClick={onRemove}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function CompositeStepsEditor({ steps, actions, onChange }: { steps: string[]; actions: ActionSummary[]; onChange: (s: string[]) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [addValue, setAddValue] = useState('');
  const actionsById = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.indexOf(String(active.id));
    const newIndex = steps.indexOf(String(over.id));
    onChange(arrayMove(steps, oldIndex, newIndex));
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {steps.map((stepId, i) => (
              <SortableStep
                key={stepId}
                id={stepId}
                name={`${i + 1}. ${actionsById.get(stepId)?.name ?? stepId}`}
                onRemove={() => onChange(steps.filter((s) => s !== stepId))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-1">
        <Select value={addValue} onValueChange={setAddValue}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="스텝으로 추가할 액션" />
          </SelectTrigger>
          <SelectContent>
            {actions.filter((a) => a.kind !== 'COMPOSITE').map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!addValue}
          onClick={() => {
            onChange([...steps, addValue]);
            setAddValue('');
          }}
        >
          <Plus className="size-3.5" /> 추가
        </Button>
      </div>
    </div>
  );
}

function ConfigForm({
  config,
  onChange,
  actions,
  pageNodes,
}: {
  config: ActionConfig;
  onChange: (c: ActionConfig) => void;
  actions: ActionSummary[];
  pageNodes?: CanvasNode[];
}) {
  const entities = useEntities();
  // Hooks must run unconditionally on every render regardless of config.kind (Rules of Hooks) —
  // config.kind changes at runtime when the user switches the kind select, so branching before
  // calling a hook would change the hook order between renders and crash React.
  const entityIdForFields = 'entityId' in config ? config.entityId : '';
  const fields = useEntityFields(entityIdForFields || null);
  const [pages, setPages] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (config.kind !== 'NAVIGATE') return;
    apiCall<{ id: string; title: string }[]>('/api/admin/pages').then((r) => r.ok && setPages(r.data));
  }, [config.kind]);

  if (config.kind === 'CREATE' || config.kind === 'UPDATE') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">대상 엔티티</label>
          <EntitySelect value={config.entityId} entities={entities} onChange={(id) => onChange({ ...config, entityId: id, fieldMap: {} })} />
        </div>
        {config.kind === 'UPDATE' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">수정할 행 (key)</label>
            <ValueSourceEditor value={config.keySource} onChange={(v) => onChange({ ...config, keySource: v })} />
          </div>
        )}
        {config.entityId && (
          <FieldMappingTable
            entityId={config.entityId}
            fieldMap={config.fieldMap}
            onChange={(m) => onChange({ ...config, fieldMap: m })}
            pageNodes={pageNodes}
          />
        )}
        <FollowUpSelect label="성공 시" value={config.onSuccess} actions={actions} onChange={(v) => onChange({ ...config, onSuccess: v })} />
        <FollowUpSelect label="실패 시" value={config.onError} actions={actions} onChange={(v) => onChange({ ...config, onError: v })} />
      </div>
    );
  }

  if (config.kind === 'DELETE') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">대상 엔티티</label>
          <EntitySelect value={config.entityId} entities={entities} onChange={(id) => onChange({ ...config, entityId: id })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">삭제할 행 (key)</label>
          <ValueSourceEditor value={config.keySource} onChange={(v) => onChange({ ...config, keySource: v })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">확인 문구</label>
          <Input value={config.confirmText ?? ''} onChange={(e) => onChange({ ...config, confirmText: e.target.value })} />
        </div>
        <FollowUpSelect label="성공 시" value={config.onSuccess} actions={actions} onChange={(v) => onChange({ ...config, onSuccess: v })} />
      </div>
    );
  }

  if (config.kind === 'QUERY' || config.kind === 'EXPORT_CSV') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">대상 엔티티</label>
          <EntitySelect value={config.entityId} entities={entities} onChange={(id) => onChange({ ...config, entityId: id })} />
        </div>
        <FilterBuilder fields={fields} filters={config.filters as Filter[]} onChange={(f) => onChange({ ...config, filters: f })} />
        {config.kind === 'QUERY' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">갱신할 컴포넌트 노드 id</label>
            <Input value={config.targetNodeId} onChange={(e) => onChange({ ...config, targetNodeId: e.target.value })} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">파일명</label>
            <Input value={config.filename} onChange={(e) => onChange({ ...config, filename: e.target.value })} />
          </div>
        )}
      </div>
    );
  }

  if (config.kind === 'NAVIGATE') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">이동할 페이지</label>
        <Select value={config.pageId || undefined} onValueChange={(id) => onChange({ ...config, pageId: id })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="페이지 선택" />
          </SelectTrigger>
          <SelectContent>
            {pages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (config.kind === 'OPEN_MODAL' || config.kind === 'CLOSE_MODAL') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">대상 컴포넌트 노드 id</label>
        <Input value={config.targetNodeId} onChange={(e) => onChange({ ...config, targetNodeId: e.target.value })} />
      </div>
    );
  }

  if (config.kind === 'TOAST') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">종류</label>
          <Select value={config.variant} onValueChange={(v) => onChange({ ...config, variant: v as typeof config.variant })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">기본</SelectItem>
              <SelectItem value="success">성공</SelectItem>
              <SelectItem value="destructive">실패</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">메시지</label>
          <Input value={config.message} onChange={(e) => onChange({ ...config, message: e.target.value })} />
        </div>
      </div>
    );
  }

  // COMPOSITE
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">실패 시 전체 롤백</label>
        <Switch checked={config.stopOnError} onCheckedChange={(v) => onChange({ ...config, stopOnError: v })} />
      </div>
      <CompositeStepsEditor steps={config.steps} actions={actions} onChange={(s) => onChange({ ...config, steps: s })} />
    </div>
  );
}

export function ActionEditorSheet({
  action,
  open,
  onClose,
  onSaved,
  pageNodes,
}: {
  action: ActionSummary | null;
  open: boolean;
  onClose: () => void;
  onSaved: (saved: ActionSummary) => void;
  pageNodes?: CanvasNode[];
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ActionKind>('TOAST');
  const [config, setConfig] = useState<ActionConfig>(defaultConfigFor('TOAST'));
  const [actions, setActions] = useState<ActionSummary[]>([]);
  const [entities, setEntitiesState] = useState<{ id: string; name: string }[]>([]);
  const [fieldsByEntity, setFieldsByEntity] = useState<Record<string, Field[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiCall<ActionSummary[]>('/api/admin/actions').then((r) => r.ok && setActions(r.data));
    apiCall<{ id: string; name: string }[]>('/api/admin/entities').then((r) => r.ok && setEntitiesState(r.data));
  }, [open]);

  useEffect(() => {
    if (action) {
      setName(action.name);
      setKind(action.kind as ActionKind);
      try {
        setConfig(JSON.parse(action.configJson));
      } catch {
        setConfig(defaultConfigFor(action.kind as ActionKind));
      }
    } else {
      setName('');
      setKind('TOAST');
      setConfig(defaultConfigFor('TOAST'));
    }
    setError(null);
  }, [action, open]);

  useEffect(() => {
    const entityId = 'entityId' in config ? config.entityId : undefined;
    if (entityId && !fieldsByEntity[entityId]) {
      apiCall<Field[]>(`/api/admin/entities/${entityId}/fields`).then((r) => {
        if (r.ok) setFieldsByEntity((prev) => ({ ...prev, [entityId]: r.data }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  function handleKindChange(newKind: ActionKind) {
    setKind(newKind);
    setConfig(defaultConfigFor(newKind));
  }

  async function handleSave() {
    setError(null);
    const body = { name, kind, config };
    const result = action
      ? await apiCall<ActionSummary>(`/api/admin/actions/${action.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      : await apiCall<ActionSummary>('/api/admin/actions', { method: 'POST', body: JSON.stringify(body) });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
    onClose();
  }

  const summary = summarizeAction(config, {
    entityName: (id) => entities.find((e) => e.id === id)?.name ?? id,
    fieldName: fieldLabelLookup(fieldsByEntity),
    actionName: (id) => actions.find((a) => a.id === id)?.name ?? id,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{action ? '액션 편집' : '새 액션'}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">종류</label>
            <Select value={kind} onValueChange={(v) => handleKindChange(v as ActionKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]} ({k})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ConfigForm config={config} onChange={setConfig} actions={actions.filter((a) => a.id !== action?.id)} pageNodes={pageNodes} />

          <Card>
            <CardContent className="p-3 text-xs text-muted-foreground">{summary}</CardContent>
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter>
          <Button onClick={handleSave} disabled={!name.trim()}>
            저장
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
