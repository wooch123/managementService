'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { apiCall } from '@/lib/api-client';
import type { EntityListItem } from '@/lib/db/entities';

export function EntityList({
  entities,
  selectedId,
  onSelect,
  onRefetch,
}: {
  entities: EntityListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefetch: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<EntityListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EntityListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreate() {
    setCreateError(null);
    const result = await apiCall<{ id: string }>('/api/admin/entities', {
      method: 'POST',
      body: JSON.stringify({ name: createName }),
    });
    if (!result.ok) {
      setCreateError(result.error.message);
      return;
    }
    setCreateOpen(false);
    setCreateName('');
    onRefetch();
    onSelect(result.data.id);
  }

  async function handleRename() {
    if (!renameTarget) return;
    const result = await apiCall(`/api/admin/entities/${renameTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: renameValue }),
    });
    if (result.ok) {
      setRenameTarget(null);
      onRefetch();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    const result = await apiCall(`/api/admin/entities/${deleteTarget.id}?confirm=true`, { method: 'DELETE' });
    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }
    setDeleteTarget(null);
    onRefetch();
  }

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b p-2">
        <span className="text-sm font-medium">엔티티</span>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="엔티티 추가">
              <Plus className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>엔티티 추가</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="예: 주문"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!createName.trim()}>
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {entities.length === 0 && (
          <p className="p-3 text-center text-xs text-muted-foreground">엔티티가 없습니다</p>
        )}
        {entities.map((entity) => (
          <div
            key={entity.id}
            className={cn(
              'group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent',
              selectedId === entity.id && 'bg-accent'
            )}
          >
            <button type="button" className="flex-1 truncate text-left" onClick={() => onSelect(entity.id)}>
              <div className="truncate font-medium">{entity.name}</div>
              <div className="text-xs text-muted-foreground">
                필드 {entity.fieldCount}개 · 행 {entity.rowCount}개
              </div>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" aria-label="더 보기">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameTarget(entity);
                    setRenameValue(entity.name);
                  }}
                >
                  <Pencil className="size-4" /> 이름 변경
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(entity)}>
                  <Trash2 className="size-4" /> 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이름 변경</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&quot;{deleteTarget?.name}&quot; 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 엔티티와 데이터 {deleteTarget?.rowCount}행이 app.db에서 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="px-6 text-sm text-destructive">{deleteError}</p>}
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
