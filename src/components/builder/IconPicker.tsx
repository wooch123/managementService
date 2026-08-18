'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Ban } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DynamicIcon } from '@/components/shell/DynamicIcon';
import { ICON_CATEGORIES, categorizeIcon, type IconCategory } from '@/lib/registry/icon-categories';

const ALL_ICON_NAMES = Object.keys(dynamicIconImports).sort();
const COLUMNS = 8;
const CELL_HEIGHT = 76;
const RECENT_KEY = 'webapp-v1:recent-icons';
const RECENT_MAX = 12;

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(name: string) {
  const current = loadRecent().filter((n) => n !== name);
  const next = [name, ...current].slice(0, RECENT_MAX);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<IconCategory>('전체');
  const [recent, setRecent] = useState<string[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_ICON_NAMES.filter((name) => {
      if (q && !name.includes(q)) return false;
      if (category !== '전체' && categorizeIcon(name) !== category) return false;
      return true;
    });
  }, [search, category]);

  const rowCount = Math.ceil(filtered.length / COLUMNS);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_HEIGHT,
    overscan: 6,
  });

  function select(name: string | null) {
    if (name) pushRecent(name);
    onChange(name);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="justify-start gap-2">
          {value ? <DynamicIcon name={value} className="size-4" /> : <Ban className="size-4 text-muted-foreground" />}
          {value ?? '아이콘 선택'}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[560px] w-[720px] max-w-none flex-col sm:max-w-none">
        <DialogHeader>
          <DialogTitle>아이콘 선택</DialogTitle>
          <DialogDescription>lucide-react 전체 아이콘에서 검색하거나 카테고리로 좁혀보세요.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="아이콘 이름 검색 (예: cart)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => select(null)}>
              없음
            </Button>
          </div>
          <ToggleGroup
            type="single"
            value={category}
            onValueChange={(v) => v && setCategory(v as IconCategory)}
            className="flex-wrap justify-start"
            size="sm"
          >
            {ICON_CATEGORIES.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {recent.length > 0 && !search && category === '전체' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">최근 사용</span>
              <div className="flex flex-wrap gap-1">
                {recent.map((name) => (
                  <IconCell key={name} name={name} onSelect={select} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const rowStart = virtualRow.index * COLUMNS;
              const rowIcons = filtered.slice(rowStart, rowStart + COLUMNS);
              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 grid w-full grid-cols-8 gap-1"
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  {rowIcons.map((name) => (
                    <IconCell key={name} name={name} onSelect={select} />
                  ))}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">일치하는 아이콘이 없습니다.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconCell({ name, onSelect }: { name: string; onSelect: (name: string) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(name)}
          className="flex flex-col items-center justify-center gap-1 rounded-md p-2 text-center hover:bg-accent"
        >
          <DynamicIcon name={name} className="size-6" />
          <span className="w-full truncate text-[10px] text-muted-foreground">{name}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}
