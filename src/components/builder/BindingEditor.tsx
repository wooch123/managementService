'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useCanvasStore } from '@/components/builder/canvas-store';
import { getComponentDef } from '@/lib/registry/catalog';
import { apiCall } from '@/lib/api-client';
import type { BindingSpec, Filter, FilterOp, Sort } from '@/types/binding';
import type { Field } from '@prisma/client';
import type { EntityListItem } from '@/lib/db/entities';

const OP_LABEL: Record<FilterOp, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: '포함',
  in: '포함(목록)',
  isNull: '비어있음',
};

export function useEntities() {
  const [entities, setEntities] = useState<EntityListItem[]>([]);
  useEffect(() => {
    apiCall<EntityListItem[]>('/api/admin/entities').then((r) => r.ok && setEntities(r.data));
  }, []);
  return entities;
}

export function useEntityFields(entityId: string | null) {
  const [fields, setFields] = useState<Field[]>([]);
  useEffect(() => {
    if (!entityId) {
      setFields([]);
      return;
    }
    apiCall<Field[]>(`/api/admin/entities/${entityId}/fields`).then((r) => r.ok && setFields(r.data));
  }, [entityId]);
  return fields;
}

export function BindingEditor() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const updateNode = useCanvasStore((s) => s.updateNode);
  const entities = useEntities();

  if (!selectedId || !node) return null;
  const def = getComponentDef(node.type);
  if (!def) return null;

  const supportedModes = def.bindingModes.filter((m) => m !== 'static');
  if (supportedModes.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">이 컴포넌트는 데이터 바인딩을 지원하지 않습니다.</p>;
  }

  const binding = (node.binding as BindingSpec | null) ?? null;

  function setBinding(next: BindingSpec | null) {
    updateNode(selectedId!, { binding: next });
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">모드</label>
        <Select
          value={binding?.mode ?? 'none'}
          onValueChange={(v) => {
            if (v === 'none') {
              setBinding(null);
              return;
            }
            const mode = v as BindingSpec['mode'];
            if (mode === 'list') setBinding({ mode: 'list', entityId: '', select: [], filters: [], sort: [], pageSize: 10 });
            else if (mode === 'single') setBinding({ mode: 'single', entityId: '', select: [], keySource: 'fixed' });
            else if (mode === 'field') setBinding({ mode: 'field', entityId: '', fieldId: '' });
            else if (mode === 'aggregate') setBinding({ mode: 'aggregate', entityId: '', fn: 'count', filters: [] });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">바인딩 없음</SelectItem>
            {supportedModes.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {binding?.mode === 'list' && <ListBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'single' && <SingleBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'field' && <FieldBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'aggregate' && <AggregateBindingForm binding={binding} entities={entities} onChange={setBinding} />}
    </div>
  );
}

export function EntitySelect({ value, entities, onChange }: { value: string; entities: EntityListItem[]; onChange: (id: string) => void }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="엔티티 선택" />
      </SelectTrigger>
      <SelectContent>
        {entities.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBuilder({ fields, filters, onChange }: { fields: Field[]; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  function addFilter() {
    if (fields.length === 0) return;
    onChange([...filters, { fieldId: fields[0].id, op: 'eq', source: 'fixed', value: '' }]);
  }
  function updateFilter(i: number, patch: Partial<Filter>) {
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeFilter(i: number) {
    onChange(filters.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">필터</label>
        <Button variant="ghost" size="sm" onClick={addFilter} disabled={fields.length === 0}>
          <Plus className="size-3.5" /> 조건 추가
        </Button>
      </div>
      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select value={f.fieldId || undefined} onValueChange={(v) => updateFilter(i, { fieldId: v })}>
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue placeholder="필드" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((fld) => (
                <SelectItem key={fld.id} value={fld.id}>
                  {fld.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={f.op} onValueChange={(v) => updateFilter(i, { op: v as FilterOp })}>
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(OP_LABEL) as FilterOp[]).map((op) => (
                <SelectItem key={op} value={op}>
                  {OP_LABEL[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {f.op !== 'isNull' && (
            <Input
              className="h-8"
              value={(f.value as string) ?? ''}
              onChange={(e) => updateFilter(i, { value: e.target.value })}
              placeholder="값"
            />
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => removeFilter(i)} aria-label="조건 삭제">
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function SortEditor({ fields, sort, onChange }: { fields: Field[]; sort: Sort[]; onChange: (s: Sort[]) => void }) {
  function addSort() {
    if (fields.length === 0) return;
    onChange([...sort, { fieldId: fields[0].id, dir: 'asc' }]);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">정렬</label>
        <Button variant="ghost" size="sm" onClick={addSort} disabled={fields.length === 0}>
          <Plus className="size-3.5" /> 정렬 추가
        </Button>
      </div>
      {sort.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select
            value={s.fieldId || undefined}
            onValueChange={(v) => onChange(sort.map((x, idx) => (idx === i ? { ...x, fieldId: v } : x)))}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="필드" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((fld) => (
                <SelectItem key={fld.id} value={fld.id}>
                  {fld.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={s.dir}
            onValueChange={(v) => onChange(sort.map((x, idx) => (idx === i ? { ...x, dir: v as 'asc' | 'desc' } : x)))}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">오름차순</SelectItem>
              <SelectItem value="desc">내림차순</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon-sm" onClick={() => onChange(sort.filter((_, idx) => idx !== i))} aria-label="정렬 삭제">
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function FieldMultiSelect({ fields, selected, onChange }: { fields: Field[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">표시 필드</label>
      <div className="flex flex-wrap gap-1">
        {fields.map((f) => {
          const active = selected.includes(f.id);
          return (
            <Badge
              key={f.id}
              variant={active ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => onChange(active ? selected.filter((id) => id !== f.id) : [...selected, f.id])}
            >
              {f.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

function RowPreview({ entityId, filters, sort }: { entityId: string; filters: Filter[]; sort: Sort[] }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const fields = useEntityFields(entityId || null);

  useEffect(() => {
    if (!entityId) {
      setRows(null);
      return;
    }
    const qs = new URLSearchParams({ pageSize: '5', filters: JSON.stringify(filters), sort: JSON.stringify(sort) });
    apiCall<{ rows: Record<string, unknown>[] }>(`/api/admin/entities/${entityId}/rows?${qs}`).then(
      (r) => r.ok && setRows(r.data.rows)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, JSON.stringify(filters), JSON.stringify(sort)]);

  if (!entityId) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">현재 데이터 5행 미리보기</label>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map((f) => (
                <TableHead key={f.id} className="text-xs">
                  {f.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row, i) => (
              <TableRow key={i}>
                {fields.map((f) => (
                  <TableCell key={f.id} className="max-w-[120px] truncate text-xs">
                    {String(row[f.columnName] ?? '-')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(fields.length, 1)} className="h-12 text-center text-xs text-muted-foreground">
                  데이터가 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ListBindingForm({
  binding,
  entities,
  onChange,
}: {
  binding: Extract<BindingSpec, { mode: 'list' }>;
  entities: EntityListItem[];
  onChange: (b: BindingSpec) => void;
}) {
  const fields = useEntityFields(binding.entityId || null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">엔티티</label>
        <EntitySelect
          value={binding.entityId}
          entities={entities}
          onChange={(id) => onChange({ ...binding, entityId: id, select: [], filters: [], sort: [] })}
        />
      </div>
      {binding.entityId && (
        <>
          <FieldMultiSelect fields={fields} selected={binding.select} onChange={(v) => onChange({ ...binding, select: v })} />
          <FilterBuilder fields={fields} filters={binding.filters} onChange={(v) => onChange({ ...binding, filters: v })} />
          <SortEditor fields={fields} sort={binding.sort} onChange={(v) => onChange({ ...binding, sort: v })} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">페이지 크기</label>
            <Input
              type="number"
              className="w-24"
              value={binding.pageSize}
              onChange={(e) => onChange({ ...binding, pageSize: Number(e.target.value) || 1 })}
            />
          </div>
          <RowPreview entityId={binding.entityId} filters={binding.filters} sort={binding.sort} />
        </>
      )}
    </div>
  );
}

function SingleBindingForm({
  binding,
  entities,
  onChange,
}: {
  binding: Extract<BindingSpec, { mode: 'single' }>;
  entities: EntityListItem[];
  onChange: (b: BindingSpec) => void;
}) {
  const fields = useEntityFields(binding.entityId || null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">엔티티</label>
        <EntitySelect value={binding.entityId} entities={entities} onChange={(id) => onChange({ ...binding, entityId: id, select: [] })} />
      </div>
      {binding.entityId && (
        <>
          <FieldMultiSelect fields={fields} selected={binding.select} onChange={(v) => onChange({ ...binding, select: v })} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">키 소스</label>
            <Select value={binding.keySource} onValueChange={(v) => onChange({ ...binding, keySource: v as typeof binding.keySource })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="route">라우트 파라미터</SelectItem>
                <SelectItem value="selection">선택된 행</SelectItem>
                <SelectItem value="fixed">고정값</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {binding.keySource === 'fixed' && (
            <Input value={binding.keyValue ?? ''} onChange={(e) => onChange({ ...binding, keyValue: e.target.value })} placeholder="행 id" />
          )}
        </>
      )}
    </div>
  );
}

function FieldBindingForm({
  binding,
  entities,
  onChange,
}: {
  binding: Extract<BindingSpec, { mode: 'field' }>;
  entities: EntityListItem[];
  onChange: (b: BindingSpec) => void;
}) {
  const fields = useEntityFields(binding.entityId || null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">엔티티</label>
        <EntitySelect value={binding.entityId} entities={entities} onChange={(id) => onChange({ ...binding, entityId: id, fieldId: '' })} />
      </div>
      {binding.entityId && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">필드</label>
          <Select value={binding.fieldId || undefined} onValueChange={(v) => onChange({ ...binding, fieldId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="필드 선택" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function AggregateBindingForm({
  binding,
  entities,
  onChange,
}: {
  binding: Extract<BindingSpec, { mode: 'aggregate' }>;
  entities: EntityListItem[];
  onChange: (b: BindingSpec) => void;
}) {
  const fields = useEntityFields(binding.entityId || null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">엔티티</label>
        <EntitySelect value={binding.entityId} entities={entities} onChange={(id) => onChange({ ...binding, entityId: id, fieldId: undefined })} />
      </div>
      {binding.entityId && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">집계 함수</label>
            <Select value={binding.fn} onValueChange={(v) => onChange({ ...binding, fn: v as typeof binding.fn })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">개수</SelectItem>
                <SelectItem value="sum">합계</SelectItem>
                <SelectItem value="avg">평균</SelectItem>
                <SelectItem value="min">최소</SelectItem>
                <SelectItem value="max">최대</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {binding.fn !== 'count' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">대상 필드</label>
              <Select value={binding.fieldId || undefined} onValueChange={(v) => onChange({ ...binding, fieldId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="필드 선택" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <FilterBuilder fields={fields} filters={binding.filters} onChange={(v) => onChange({ ...binding, filters: v })} />
        </>
      )}
    </div>
  );
}
