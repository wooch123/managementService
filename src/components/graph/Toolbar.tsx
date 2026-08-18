'use client';

import { useState } from 'react';
import {
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Grid3x3,
  Workflow,
  Search,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import type { RefType } from '@/types/graph';
import type { LayoutDensity } from '@/components/graph/type-band-layout';
import { TYPE_LABEL, TYPE_COLOR } from '@/components/graph/types';

const ALL_TYPES: RefType[] = ['PAGE', 'COMPONENT', 'ENTITY', 'ACTION'];

const EDGE_LEGEND: { kind: string; desc: string; style: string }[] = [
  { kind: 'CONTAINS', desc: '포함 (파생, 편집 불가)', style: '실선 + 다이아몬드' },
  { kind: 'READS', desc: '컴포넌트 → 엔티티 조회', style: '실선 화살표' },
  { kind: 'WRITES', desc: '액션 → 엔티티 기록', style: '굵은 실선 화살표' },
  { kind: 'TRIGGERS', desc: '컴포넌트 → 액션 실행', style: '점선 화살표' },
  { kind: 'NAVIGATES', desc: '페이지 이동', style: '점선 곡선 화살표' },
  { kind: 'REFERENCES', desc: '엔티티 참조 (파생, 편집 불가)', style: '실선 + 까마귀발' },
];

export function Toolbar({
  visibleTypes,
  onToggleType,
  orphanOnly,
  onToggleOrphanOnly,
  selectedCount,
  onAlign,
  onDistribute,
  onSnapAll,
  onAutoLayout,
  onOpenSearch,
}: {
  visibleTypes: Set<RefType>;
  onToggleType: (t: RefType) => void;
  orphanOnly: boolean;
  onToggleOrphanOnly: () => void;
  selectedCount: number;
  onAlign: (dir: 'left' | 'right' | 'top' | 'bottom') => void;
  onDistribute: (dir: 'horizontal' | 'vertical') => void;
  onSnapAll: () => void;
  onAutoLayout: (direction: 'TB' | 'LR', density: LayoutDensity) => void;
  onOpenSearch: () => void;
}) {
  const [layoutConfirmOpen, setLayoutConfirmOpen] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [layoutDensity, setLayoutDensity] = useState<LayoutDensity>('comfortable');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-background p-2">
      <div className="flex items-center gap-0.5 rounded-md border p-0.5">
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 2} onClick={() => onAlign('left')} aria-label="왼쪽 정렬">
          <AlignStartVertical className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 2} onClick={() => onAlign('right')} aria-label="오른쪽 정렬">
          <AlignEndVertical className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 2} onClick={() => onAlign('top')} aria-label="위쪽 정렬">
          <AlignStartHorizontal className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 2} onClick={() => onAlign('bottom')} aria-label="아래쪽 정렬">
          <AlignEndHorizontal className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 3} onClick={() => onDistribute('horizontal')} aria-label="가로 균등 배분">
          <AlignHorizontalDistributeCenter className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={selectedCount < 3} onClick={() => onDistribute('vertical')} aria-label="세로 균등 배분">
          <AlignVerticalDistributeCenter className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onSnapAll} aria-label="전체 그리드 스냅">
          <Grid3x3 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setLayoutConfirmOpen(true)} aria-label="자동 레이아웃">
          <Workflow className="size-4" />
        </Button>
      </div>

      <ToggleGroup type="multiple" value={ALL_TYPES.filter((t) => visibleTypes.has(t))} size="sm">
        {ALL_TYPES.map((t) => (
          <ToggleGroupItem key={t} value={t} onClick={() => onToggleType(t)}>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: TYPE_COLOR[t] }} />
            {TYPE_LABEL[t]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Toggle pressed={orphanOnly} onPressedChange={onToggleOrphanOnly} size="sm">
        고아 노드만 강조
      </Toggle>

      <Button variant="outline" size="sm" onClick={onOpenSearch}>
        <Search className="size-4" /> 검색 (Ctrl+K)
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="범례">
            <Info className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <Card className="border-0 shadow-none">
            <CardContent className="space-y-1.5 p-0 text-xs">
              {EDGE_LEGEND.map((l) => (
                <div key={l.kind} className="flex justify-between gap-2">
                  <span className="font-medium">{l.kind}</span>
                  <span className="text-muted-foreground">{l.style}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>

      <AlertDialog open={layoutConfirmOpen} onOpenChange={setLayoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>자동 레이아웃 실행</AlertDialogTitle>
            <AlertDialogDescription>
              지금 보이는 범위(전체 구조 또는 선택한 페이지)의 노드 좌표가 덮어써집니다. 계속할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">배치 방향</span>
            <ToggleGroup type="single" value={layoutDirection} onValueChange={(v) => v && setLayoutDirection(v as 'TB' | 'LR')} size="sm">
              <ToggleGroupItem value="TB">세로 (9:16)</ToggleGroupItem>
              <ToggleGroupItem value="LR">가로 (16:9)</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">배치 밀도</span>
            <ToggleGroup type="single" value={layoutDensity} onValueChange={(v) => v && setLayoutDensity(v as LayoutDensity)} size="sm">
              <ToggleGroupItem value="comfortable">기본 간격</ToggleGroupItem>
              <ToggleGroupItem value="compact">밀집 배치</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              종류별 밴드(페이지 · 컴포넌트 · 엔티티 · 액션) 순서로 오와 열을 맞춰 배치합니다. 가로는 왼→오 열, 세로는 위→아래 행이며
              전체 배열이 각각 16:9 · 9:16에 가장 가까워지도록 칸 수를 자동으로 정합니다. 밀집 배치는 같은 규칙에서 간격만 좁힙니다.
            </p>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setLayoutConfirmOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                onAutoLayout(layoutDirection, layoutDensity);
                setLayoutConfirmOpen(false);
              }}
            >
              실행
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
