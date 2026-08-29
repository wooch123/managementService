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
  isNotNull: '값 있음',
};

/** 값을 받지 않는 연산 — 값·소스 칸을 아예 그리지 않는다. */
const VALUELESS_OPS = new Set<FilterOp>(['isNull', 'isNotNull']);

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

/** 모드 이름을 사람이 읽는 말로 — 예전에는 'list'/'aggregate'가 그대로 보였다. */
const MODE_LABEL: Record<string, string> = {
  list: '목록 (행 그대로)',
  single: '단건',
  field: '필드 값',
  aggregate: '집계 값 (숫자 하나)',
  group: '항목별 집계 (차트용)',
};

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
            else if (mode === 'aggregate') setBinding({ mode: 'aggregate', entityId: '', fn: 'count', filters: [], compare: false });
            else if (mode === 'group') setBinding({ mode: 'group', entityId: '', groupFieldId: '', groupTransform: 'none', fn: 'count', filters: [], orderBy: 'value', limit: 20 });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">바인딩 없음</SelectItem>
            {supportedModes.map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABEL[m] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {binding?.mode === 'list' && <ListBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'single' && <SingleBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'field' && <FieldBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'aggregate' && <AggregateBindingForm binding={binding} entities={entities} onChange={setBinding} />}
      {binding?.mode === 'group' && <GroupBindingForm binding={binding} entities={entities} onChange={setBinding} />}
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

/** 필터 값이 어디서 오는지 — `주소 쿼리`는 기간 필터 같은 화면 상단 컨트롤이 주소에 심어 둔 값을 읽는다. */
const SOURCE_LABEL: Record<Filter['source'], string> = {
  fixed: '고정값',
  query: '주소 쿼리',
  component: '컴포넌트 값',
};

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
          {!VALUELESS_OPS.has(f.op) && (
            <Select value={f.source} onValueChange={(v) => updateFilter(i, { source: v as Filter['source'], value: '', ref: '' })}>
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as Filter['source'][]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!VALUELESS_OPS.has(f.op) &&
            (f.source === 'fixed' ? (
              <Input
                className="h-8"
                value={(f.value as string) ?? ''}
                onChange={(e) => updateFilter(i, { value: e.target.value })}
                placeholder="값"
              />
            ) : (
              // 주소 쿼리는 파라미터 이름을, 컴포넌트 값은 그 컴포넌트의 노드 id를 가리킨다.
              <Input
                className="h-8"
                value={f.ref ?? ''}
                onChange={(e) => updateFilter(i, { ref: e.target.value })}
                placeholder={f.source === 'query' ? '파라미터 이름 (from / to)' : '노드 id'}
              />
            ))}
          <Button variant="ghost" size="icon-sm" onClick={() => removeFilter(i)} aria-label="조건 삭제">
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {filters.some((f) => f.source === 'query') && (
        <p className="text-xs text-muted-foreground">
          주소 쿼리 값이 없으면 그 조건은 걸리지 않는다 — 기간 필터 컴포넌트가 <code>from</code> · <code>to</code>를 넣어 준다.
        </p>
      )}
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
                <SelectItem value="countDistinct">개수(중복 제외)</SelectItem>
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
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={binding.compare ?? false}
              onChange={(e) => onChange({ ...binding, compare: e.target.checked })}
            />
            <span>
              <span className="font-medium">직전 기간과 비교</span>
              <span className="block text-muted-foreground">
                조회 기간과 같은 길이의 직전 구간을 함께 세어 증감(%)을 붙인다. 기간 필터가 있는 화면에서만 동작한다.
              </span>
            </span>
          </label>
        </>
      )}
    </div>
  );
}


/**
 * 항목별 집계 폼 — 차트가 "분류별 개수/합계"를 DB에서 직접 받아오게 한다.
 * 원시 행을 표본으로 가져와 화면에서 세던 방식은 데이터가 쌓이면 수치가 틀린다(모드 설명 참고).
 */
function isDateField(fields: Field[], fieldId: string): boolean {
  const field = fields.find((f) => f.id === fieldId);
  return field?.dataType === 'DATE' || field?.dataType === 'DATETIME';
}

function GroupBindingForm({
  binding,
  entities,
  onChange,
}: {
  binding: Extract<BindingSpec, { mode: 'group' }>;
  entities: EntityListItem[];
  onChange: (b: BindingSpec) => void;
}) {
  const fields = useEntityFields(binding.entityId || null);
  const numericFields = fields.filter((f) => f.dataType === 'INTEGER' || f.dataType === 'REAL');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">엔티티</label>
        <EntitySelect
          value={binding.entityId}
          entities={entities}
          onChange={(id) => onChange({ ...binding, entityId: id, groupFieldId: '', valueFieldId: undefined })}
        />
      </div>
      {binding.entityId && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">분류 기준 (가로축)</label>
            <Select value={binding.groupFieldId || undefined} onValueChange={(v) => onChange({ ...binding, groupFieldId: v })}>
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
          {isDateField(fields, binding.groupFieldId) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">날짜 묶음 단위</label>
              <Select
                value={binding.groupTransform ?? 'none'}
                onValueChange={(v) => onChange({ ...binding, groupTransform: v as typeof binding.groupTransform })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">묶지 않음 (날짜 그대로)</SelectItem>
                  <SelectItem value="month">월별 (2026-08)</SelectItem>
                  <SelectItem value="week">주별 (2026-W33)</SelectItem>
                  <SelectItem value="year">연도별 (2026)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                날짜를 묶으면 추이 차트를 원본 표에서 바로 만든다 — 조회 기간을 바꾸면 추이도 함께 따라온다.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">두 번째 분류 (층 · 열)</label>
            <Select
              value={binding.seriesFieldId || '__none__'}
              onValueChange={(v) => onChange({ ...binding, seriesFieldId: v === '__none__' ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">쓰지 않음</SelectItem>
                {fields
                  .filter((f) => f.id !== binding.groupFieldId)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              고르면 결과가 (분류 × 이 값) 격자로 나온다 — 누적 세로 막대의 층, 교차 히트맵의 열이 된다.
            </p>
          </div>
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
              </SelectContent>
            </Select>
          </div>
          {binding.fn !== 'count' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">값 필드 (숫자)</label>
              <Select value={binding.valueFieldId || undefined} onValueChange={(v) => onChange({ ...binding, valueFieldId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="숫자 필드 선택" />
                </SelectTrigger>
                <SelectContent>
                  {numericFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">정렬</label>
              <Select value={binding.orderBy} onValueChange={(v) => onChange({ ...binding, orderBy: v as typeof binding.orderBy })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="value">값이 큰 순서</SelectItem>
                  <SelectItem value="label">분류 이름 순서</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">최대 항목 수</label>
              <Input
                type="number"
                min={1}
                max={200}
                value={binding.limit}
                onChange={(e) => onChange({ ...binding, limit: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </div>
          </div>
          <FilterBuilder fields={fields} filters={binding.filters} onChange={(v) => onChange({ ...binding, filters: v })} />
        </>
      )}
    </div>
  );
}
