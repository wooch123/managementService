'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PropertyForm } from '@/components/builder/PropertyForm';
import { BindingEditor } from '@/components/builder/BindingEditor';
import { ActionsTab } from '@/components/builder/ActionsTab';
import { useCanvasStore } from '@/components/builder/canvas-store';
import { Trash2 } from 'lucide-react';

export function NodePropertyPanel() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const removeSubtree = useCanvasStore((s) => s.removeSubtree);

  if (!selectedId) return null;

  return (
    <div className="flex h-full flex-col border-l">
      <Tabs defaultValue="props" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="m-2">
          <TabsTrigger value="props" className="flex-1">
            속성
          </TabsTrigger>
          <TabsTrigger value="data" className="flex-1">
            데이터
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex-1">
            동작
          </TabsTrigger>
        </TabsList>
        <TabsContent value="props" className="flex-1 overflow-y-auto">
          <PropertyForm />
        </TabsContent>
        <TabsContent value="data" className="flex-1 overflow-y-auto">
          <BindingEditor />
        </TabsContent>
        <TabsContent value="actions" className="flex-1 overflow-y-auto">
          <ActionsTab />
        </TabsContent>
      </Tabs>
      <div className="flex items-center justify-between border-t p-2">
        <span className="truncate font-mono text-[10px] text-muted-foreground" title={selectedId}>
          {selectedId}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => removeSubtree(selectedId)} aria-label="컴포넌트 삭제">
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
