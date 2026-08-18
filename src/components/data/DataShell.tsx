'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { EntityList } from '@/components/data/EntityList';
import { FieldEditor } from '@/components/data/FieldEditor';
import { EntityDataTab } from '@/components/data/EntityDataTab';
import { apiCall } from '@/lib/api-client';
import type { EntityListItem } from '@/lib/db/entities';
import type { SchemaChange } from '@/lib/data-engine/diff';

export function DataShell({
  initialEntities,
  initialSelectedId,
}: {
  initialEntities: EntityListItem[];
  /** 검증 화면의 "대상 링크"로 넘어올 때 지정되는 엔티티 id. 목록에 없으면 첫 엔티티로 대체한다. */
  initialSelectedId?: string | null;
}) {
  const [entities, setEntities] = useState(initialEntities);
  const [selectedId, setSelectedId] = useState<string | null>(
    (initialSelectedId && initialEntities.some((e) => e.id === initialSelectedId) ? initialSelectedId : null) ?? initialEntities[0]?.id ?? null
  );
  const [diff, setDiff] = useState<SchemaChange[] | null>(null);

  async function refetchEntities() {
    const result = await apiCall<EntityListItem[]>('/api/admin/entities');
    if (result.ok) setEntities(result.data);
    refetchDiff();
  }

  async function refetchDiff() {
    const result = await apiCall<SchemaChange[]>('/api/admin/schema/diff');
    if (result.ok) setDiff(result.data);
  }

  useEffect(() => {
    refetchDiff();
  }, []);

  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const safeCount = diff?.filter((c) => c.risk === 'safe').length ?? 0;
  const destructiveCount = diff?.filter((c) => c.risk === 'destructive').length ?? 0;
  const blockedCount = diff?.filter((c) => c.risk === 'blocked').length ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <EntityList
          entities={entities}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            refetchDiff();
          }}
          onRefetch={refetchEntities}
        />

        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex h-full items-center justify-center p-8">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>엔티티를 선택하세요</EmptyTitle>
                  <EmptyDescription>좌측에서 엔티티를 선택하거나 새로 추가하세요</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <Tabs defaultValue="schema" className="flex h-full flex-col">
              <TabsList className="m-2 w-fit">
                <TabsTrigger value="schema">스키마</TabsTrigger>
                <TabsTrigger value="data">데이터</TabsTrigger>
              </TabsList>
              <TabsContent value="schema" className="flex-1 overflow-y-auto">
                <FieldEditor
                  key={selected.id}
                  entityId={selected.id}
                  allEntities={entities}
                />
              </TabsContent>
              <TabsContent value="data" className="flex-1 overflow-y-auto">
                <EntityDataTab key={selected.id} entityId={selected.id} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          스키마 변경 요약: 안전 {safeCount} · 파괴적 {destructiveCount}
          {blockedCount > 0 && ` · 차단됨 ${blockedCount}`}
        </span>
        <span className="text-muted-foreground/70">
          (P4는 즉시 적용 모델을 사용합니다 — 엔티티/필드 변경이 app.db에 바로 반영되며, 이 요약은 주로 드리프트 감지용입니다)
        </span>
      </div>
    </div>
  );
}
