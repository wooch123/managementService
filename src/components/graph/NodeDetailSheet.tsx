'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiCall } from '@/lib/api-client';
import { ACTION_KINDS } from '@/types/graph';
import type { RFNode } from '@/components/graph/types';

export function NodeDetailSheet({
  node,
  onClose,
  onActionUpdated,
}: {
  node: RFNode | null;
  onClose: () => void;
  onActionUpdated: (refId: string, patch: { name: string; kind: string; description: string | null }) => void;
}) {
  const open = node != null;
  const data = node?.data;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        {data?.refType === 'PAGE' && (
          <>
            <SheetHeader>
              <SheetTitle>{data.title}</SheetTitle>
            </SheetHeader>
            <div className="space-y-2 px-4 text-sm">
              <div>slug: {data.slug}</div>
              <div>자식 컴포넌트: {data.childCount}개</div>
            </div>
            <SheetFooter>
              <Button asChild>
                <Link href={`/admin/builder?pageId=${data.refId}`}>빌더에서 편집</Link>
              </Button>
            </SheetFooter>
          </>
        )}

        {data?.refType === 'COMPONENT' && (
          <>
            <SheetHeader>
              <SheetTitle>{data.label ?? data.type}</SheetTitle>
            </SheetHeader>
            <div className="space-y-2 px-4 text-sm">
              <div>타입: {data.type}</div>
              <div>바인딩: {data.hasBinding ? '연결됨' : '없음'}</div>
              <div>연결된 이벤트: {data.eventCount}개</div>
            </div>
            <SheetFooter>
              <Button asChild>
                <Link href={`/admin/builder?pageId=${data.pageId}`}>빌더에서 편집</Link>
              </Button>
            </SheetFooter>
          </>
        )}

        {data?.refType === 'ENTITY' && (
          <>
            <SheetHeader>
              <SheetTitle>{data.name}</SheetTitle>
            </SheetHeader>
            <div className="space-y-1 px-4 text-sm">
              {data.fields.map((f) => (
                <div key={f.name} className="flex items-center justify-between">
                  <span>
                    {f.name}: {f.dataType}
                  </span>
                  <span className="flex gap-1">
                    {f.isPrimary && <Badge variant="outline">PK</Badge>}
                    {f.isUnique && <Badge variant="outline">UQ</Badge>}
                    {f.isRequired && <Badge variant="outline">NN</Badge>}
                  </span>
                </div>
              ))}
            </div>
            <SheetFooter>
              <Button asChild>
                <Link href="/admin/data">DB 설계에서 편집</Link>
              </Button>
            </SheetFooter>
          </>
        )}

        {data?.refType === 'ACTION' && <ActionEditForm data={data} onSaved={onActionUpdated} />}
      </SheetContent>
    </Sheet>
  );
}

function ActionEditForm({
  data,
  onSaved,
}: {
  data: { refId: string; name: string; kind: string; description: string | null };
  onSaved: (refId: string, patch: { name: string; kind: string; description: string | null }) => void;
}) {
  const [name, setName] = useState(data.name);
  const [kind, setKind] = useState(data.kind);
  const [description, setDescription] = useState(data.description ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(data.name);
    setKind(data.kind);
    setDescription(data.description ?? '');
    setError(null);
  }, [data]);

  async function handleSave() {
    setError(null);
    const result = await apiCall(`/api/admin/actions/${data.refId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, kind, description: description || null }),
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(data.refId, { name, kind, description: description || null });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>액션 편집</SheetTitle>
      </SheetHeader>
      <div className="space-y-3 px-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">이름</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">종류</label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">설명</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <p className="text-xs text-muted-foreground">
          세부 실행 조건(필드 매핑 등)은 P6(액션 시스템)의 전용 편집기에서 구성합니다.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <SheetFooter>
        <Button onClick={handleSave}>저장</Button>
      </SheetFooter>
    </>
  );
}
