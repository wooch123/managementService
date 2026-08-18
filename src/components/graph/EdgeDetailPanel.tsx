'use client';

import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RFEdge } from '@/components/graph/types';

export function EdgeDetailPanel({
  edge,
  onClose,
  onSave,
  onDelete,
}: {
  edge: RFEdge | null;
  onClose: () => void;
  onSave: (id: string, patch: { labelText: string | null; cardinality: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [cardinality, setCardinality] = useState<string>('');

  useEffect(() => {
    setLabel(edge?.data?.labelText ?? '');
    setCardinality(edge?.data?.cardinality ?? '');
  }, [edge]);

  if (!edge || !edge.data) return null;
  if (edge.data.derived) return null;

  return (
    <Card className="absolute bottom-4 right-4 w-72 shadow-lg">
      <CardHeader className="flex-row items-center justify-between space-y-0 py-2">
        <CardTitle className="text-sm">{edge.data.kind} 연결 편집</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">라벨</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
        </div>
        {edge.data.kind === 'REFERENCES' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">카디널리티</label>
            <Select value={cardinality || undefined} onValueChange={setCardinality}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONE_TO_ONE">1:1</SelectItem>
                <SelectItem value="ONE_TO_MANY">1:N</SelectItem>
                <SelectItem value="MANY_TO_MANY">N:M</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex justify-between pt-1">
          <Button variant="destructive" size="sm" onClick={() => onDelete(edge.id)}>
            <Trash2 className="size-4" /> 삭제
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(edge.id, { labelText: label || null, cardinality: cardinality || null })}
          >
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
