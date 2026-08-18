'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { apiCall } from '@/lib/api-client';
import type { Field } from '@prisma/client';
import type { DataType } from '@/types/entity';

type RowData = Record<string, unknown>;

function inputForField(field: Field, value: unknown, onChange: (v: unknown) => void) {
  const dataType = field.dataType as DataType;
  if (dataType === 'BOOLEAN') {
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
  }
  if (dataType === 'JSON') {
    return (
      <Textarea
        value={typeof value === 'string' ? value : value != null ? JSON.stringify(value) : ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  if (dataType === 'DATE') {
    return <Input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (dataType === 'DATETIME') {
    return <Input type="datetime-local" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (dataType === 'INTEGER' || dataType === 'REAL') {
    return <Input type="number" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  }
  if (dataType === 'ENUM') {
    const options: string[] = field.enumValues ? JSON.parse(field.enumValues) : [];
    return (
      <select
        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">-</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

export function EntityDataTab({ entityId }: { entityId: string }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<RowData>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function refetch() {
    const [fieldsRes, rowsRes] = await Promise.all([
      apiCall<Field[]>(`/api/admin/entities/${entityId}/fields`),
      apiCall<{ rows: RowData[]; total: number }>(`/api/admin/entities/${entityId}/rows?pageSize=20`),
    ]);
    if (fieldsRes.ok) setFields(fieldsRes.data);
    if (rowsRes.ok) {
      setRows(rowsRes.data.rows);
      setTotal(rowsRes.data.total);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  function openCreate() {
    setEditingId(null);
    setFormValues({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: RowData) {
    setEditingId(row.id as string);
    setFormValues({ ...row });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit() {
    setFormError(null);
    const values: RowData = {};
    for (const field of fields) {
      if (formValues[field.columnName] !== undefined && formValues[field.columnName] !== '') {
        values[field.columnName] = formValues[field.columnName];
      }
    }
    const result = editingId
      ? await apiCall(`/api/admin/entities/${entityId}/rows/${editingId}`, { method: 'PATCH', body: JSON.stringify(values) })
      : await apiCall(`/api/admin/entities/${entityId}/rows`, { method: 'POST', body: JSON.stringify(values) });

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    setFormOpen(false);
    refetch();
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    const result = await apiCall(`/api/admin/entities/${entityId}/rows/${deleteTargetId}`, { method: 'DELETE' });
    if (result.ok) {
      setDeleteTargetId(null);
      refetch();
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">총 {total}행</p>
        <Button size="sm" onClick={openCreate} disabled={fields.length === 0}>
          <Plus className="size-4" /> 행 추가
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map((f) => (
                <TableHead key={f.id}>{f.name}</TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id as string}>
                {fields.map((f) => (
                  <TableCell key={f.id} className="max-w-[200px] truncate">
                    {f.dataType === 'BOOLEAN' ? (row[f.columnName] ? '참' : '거짓') : String(row[f.columnName] ?? '-')}
                  </TableCell>
                ))}
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row)} aria-label="행 수정">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTargetId(row.id as string)} aria-label="행 삭제">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={fields.length + 1} className="h-16 text-center text-sm text-muted-foreground">
                  데이터가 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '행 수정' : '행 추가'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {field.name}
                  {field.isRequired && ' *'}
                </label>
                {inputForField(field, formValues[field.columnName], (v) =>
                  setFormValues((prev) => ({ ...prev, [field.columnName]: v }))
                )}
              </div>
            ))}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button onClick={handleSubmit}>{editingId ? '저장' : '추가'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>행 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
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
