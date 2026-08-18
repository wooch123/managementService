'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { apiCall } from '@/lib/api-client';
import { toSnakeCase, isValidIdentifierFormat, isReservedIdentifier } from '@/lib/data-engine/identifiers';
import { DATA_TYPES, type DataType } from '@/types/entity';
import type { Field } from '@prisma/client';

const TYPE_LABEL: Record<DataType, string> = {
  TEXT: '텍스트',
  INTEGER: '정수',
  REAL: '실수',
  BOOLEAN: '불리언',
  DATE: '날짜',
  DATETIME: '날짜+시간',
  JSON: 'JSON',
  ENUM: '열거형',
  REF: '참조',
};

function columnNameError(value: string): string | null {
  if (!value) return '컬럼명을 입력하세요';
  if (!isValidIdentifierFormat(value)) return '소문자로 시작하는 영문/숫자/밑줄만 가능합니다';
  if (isReservedIdentifier(value)) return '예약어는 사용할 수 없습니다';
  return null;
}

export function FieldEditor({ entityId, allEntities }: { entityId: string; allEntities: { id: string; name: string }[] }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<DataType>('TEXT');
  const [addError, setAddError] = useState<string | null>(null);
  const [typeChangeTarget, setTypeChangeTarget] = useState<{ field: Field; newType: DataType } | null>(null);
  const [typeChangeError, setTypeChangeError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Field | null>(null);

  async function refetch() {
    const result = await apiCall<Field[]>(`/api/admin/entities/${entityId}/fields`);
    if (result.ok) setFields(result.data);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function patchField(id: string, body: Record<string, unknown>) {
    const result = await apiCall<Field>(`/api/admin/fields/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (result.ok) {
      setFields((prev) => prev.map((f) => (f.id === id ? result.data : f)));
    }
    return result;
  }

  async function handleAdd() {
    setAddError(null);
    const result = await apiCall<Field>(`/api/admin/entities/${entityId}/fields`, {
      method: 'POST',
      body: JSON.stringify({ name: newName, dataType: newType, enumValues: newType === 'ENUM' ? ['값1'] : undefined, refEntityId: newType === 'REF' ? allEntities.find((e) => e.id !== entityId)?.id : undefined }),
    });
    if (!result.ok) {
      setAddError(result.error.message);
      return;
    }
    setFields((prev) => [...prev, result.data]);
    setNewName('');
    setNewType('TEXT');
  }

  async function handleTypeChangeConfirm() {
    if (!typeChangeTarget) return;
    setTypeChangeError(null);
    const result = await patchField(typeChangeTarget.field.id, { dataType: typeChangeTarget.newType, confirmDestructive: true });
    if (!result.ok) {
      setTypeChangeError(result.error.message);
      return;
    }
    setTypeChangeTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await apiCall(`/api/admin/fields/${deleteTarget.id}?confirm=true`, { method: 'DELETE' });
    if (result.ok) {
      setFields((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>표시명</TableHead>
              <TableHead>컬럼명</TableHead>
              <TableHead>타입</TableHead>
              <TableHead>필수</TableHead>
              <TableHead>유니크</TableHead>
              <TableHead>기본값</TableHead>
              <TableHead>부가설정</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                allEntities={allEntities}
                entityId={entityId}
                onPatch={(body) => patchField(field.id, body)}
                onRequestTypeChange={(newType) => setTypeChangeTarget({ field, newType })}
                onRequestDelete={() => setDeleteTarget(field)}
              />
            ))}
            {fields.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-16 text-center text-sm text-muted-foreground">
                  필드가 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
        <Input
          placeholder="새 필드 표시명"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && handleAdd()}
          className="max-w-[200px]"
        />
        <Select value={newType} onValueChange={(v) => setNewType(v as DataType)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus className="size-4" /> 필드 추가
        </Button>
        {newName && <span className="text-xs text-muted-foreground">컬럼명: {toSnakeCase(newName)}</span>}
      </div>
      {addError && <p className="text-sm text-destructive">{addError}</p>}

      <AlertDialog open={!!typeChangeTarget} onOpenChange={(open) => !open && setTypeChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>필드 타입 변경</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{typeChangeTarget?.field.name}&quot;의 타입을 {typeChangeTarget && TYPE_LABEL[typeChangeTarget.newType]}(으)로
              바꾸면 기존 데이터가 새 타입으로 재작성됩니다. 변환할 수 없는 값이 있으면 실패합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {typeChangeError && <p className="px-6 text-sm text-destructive">{typeChangeError}</p>}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setTypeChangeTarget(null)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleTypeChangeConfirm}>
              변경
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&quot;{deleteTarget?.name}&quot; 필드 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 필드의 모든 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldRow({
  field,
  allEntities,
  entityId,
  onPatch,
  onRequestTypeChange,
  onRequestDelete,
}: {
  field: Field;
  allEntities: { id: string; name: string }[];
  entityId: string;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onRequestTypeChange: (newType: DataType) => void;
  onRequestDelete: () => void;
}) {
  const [name, setName] = useState(field.name);
  const [columnName, setColumnName] = useState(field.columnName);
  const [columnNameErr, setColumnNameErr] = useState<string | null>(null);
  const [defaultVal, setDefaultVal] = useState(field.defaultVal ?? '');
  const enumValues: string[] = field.enumValues ? JSON.parse(field.enumValues) : [];
  const [enumDraft, setEnumDraft] = useState('');

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== field.name && onPatch({ name })} className="h-8" />
      </TableCell>
      <TableCell>
        <Input
          value={columnName}
          onChange={(e) => {
            setColumnName(e.target.value);
            setColumnNameErr(columnNameError(e.target.value));
          }}
          onBlur={() => {
            const err = columnNameError(columnName);
            setColumnNameErr(err);
            if (!err && columnName !== field.columnName) onPatch({ columnName });
            else if (err) setColumnName(field.columnName);
          }}
          className="h-8 font-mono text-xs"
        />
        {columnNameErr && <p className="text-[10px] text-destructive">{columnNameErr}</p>}
      </TableCell>
      <TableCell>
        <Select
          value={field.dataType}
          onValueChange={(v) => {
            if (v !== field.dataType) onRequestTypeChange(v as DataType);
          }}
        >
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch checked={field.isRequired} onCheckedChange={(v) => onPatch({ isRequired: v })} />
      </TableCell>
      <TableCell>
        <Switch checked={field.isUnique} onCheckedChange={(v) => onPatch({ isUnique: v })} />
      </TableCell>
      <TableCell>
        <Input
          value={defaultVal}
          onChange={(e) => setDefaultVal(e.target.value)}
          onBlur={() => defaultVal !== (field.defaultVal ?? '') && onPatch({ defaultVal: defaultVal || null })}
          className="h-8 w-[100px]"
          placeholder="-"
        />
      </TableCell>
      <TableCell>
        {field.dataType === 'ENUM' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                값 {enumValues.length}개
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="flex flex-wrap gap-1">
                {enumValues.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1">
                    {v}
                    <button type="button" onClick={() => onPatch({ enumValues: enumValues.filter((x) => x !== v) })}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <Input
                  value={enumDraft}
                  onChange={(e) => setEnumDraft(e.target.value)}
                  placeholder="값 추가 후 Enter"
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && enumDraft.trim()) {
                      onPatch({ enumValues: [...enumValues, enumDraft.trim()] });
                      setEnumDraft('');
                    }
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        )}
        {field.dataType === 'REF' && (
          <Select value={field.refEntityId ?? undefined} onValueChange={(v) => onPatch({ refEntityId: v })}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="대상 엔티티" />
            </SelectTrigger>
            <SelectContent>
              {allEntities
                .filter((e) => e.id !== entityId)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {field.dataType !== 'ENUM' && field.dataType !== 'REF' && <span className="text-xs text-muted-foreground">-</span>}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon-sm" onClick={onRequestDelete} aria-label="필드 삭제">
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
