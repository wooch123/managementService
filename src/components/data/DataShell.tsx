'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { EntityList } from '@/components/data/EntityList';
import { FieldEditor } from '@/components/data/FieldEditor';
import { EntityDataTab } from '@/components/data/EntityDataTab';
import { apiCall } from '@/lib/api-client';
import type { EntityListItem } from '@/lib/db/entities';
import { BUILDER_NARROW_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
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
  const narrow = useMediaQuery(BUILDER_NARROW_QUERY);

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
      {/* 좁은 창에서는 목록과 상세를 한 화면에 같이 두지 않는다 — 375px에서 상세가 135px로 줄어
          필드 표를 전혀 읽을 수 없었다. 고르기 전에는 목록만, 고른 뒤에는 상세만 보여준다. */}
      <div className="flex flex-1 overflow-hidden">
        {(!narrow || !selected) && (
          <EntityList
            entities={entities}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              refetchDiff();
            }}
            onRefetch={refetchEntities}
          />
        )}

        <div className={cn('flex-1 overflow-y-auto', narrow && !selected && 'hidden')}>
          {narrow && selected && (
            <div className="border-b p-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <ChevronLeft className="size-4" /> 엔티티 목록
              </Button>
            </div>
          )}
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
