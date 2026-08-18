'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconPicker } from '@/components/builder/IconPicker';
import type { PageTreeNode } from '@/lib/db/page-tree';
import type { ApiResult } from '@/types/auth';

type PageDetail = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  isVisible: boolean;
  isHome: boolean;
  asideVisible: boolean;
  rowHeight: number;
  gap: number;
};

function flattenRoots(tree: PageTreeNode[]) {
  return tree.map((p) => ({ id: p.id, title: p.title }));
}

function findPage(tree: PageTreeNode[], id: string): PageDetail | null {
  for (const root of tree) {
    if (root.id === id) {
      return {
        id: root.id,
        title: root.title,
        slug: root.slug,
        icon: root.icon,
        parentId: null,
        isVisible: root.isVisible,
        isHome: root.isHome,
        asideVisible: root.asideVisible,
        rowHeight: root.rowHeight,
        gap: root.gap,
      };
    }
    for (const child of root.children) {
      if (child.id === id) {
        return {
          id: child.id,
          title: child.title,
          slug: child.slug,
          icon: child.icon,
          parentId: root.id,
          isVisible: child.isVisible,
          isHome: child.isHome,
          asideVisible: child.asideVisible,
          rowHeight: child.rowHeight,
          gap: child.gap,
        };
      }
    }
  }
  return null;
}

async function patchPage(id: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/admin/pages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return (await res.json()) as ApiResult<unknown>;
}

export function PagePropertiesPanel({
  tree,
  selectedId,
  onChanged,
}: {
  tree: PageTreeNode[];
  selectedId: string | null;
  onChanged: () => void;
}) {
  const page = selectedId ? findPage(tree, selectedId) : null;

  if (!page) {
    return (
      <div className="flex h-full w-full items-center justify-center border-l p-4 text-center text-sm text-muted-foreground">
        왼쪽에서 페이지를 선택하세요
      </div>
    );
  }

  return <PropertiesForm key={page.id} page={page} tree={tree} onChanged={onChanged} />;
}

function PropertiesForm({
  page,
  tree,
  onChanged,
}: {
  page: PageDetail;
  tree: PageTreeNode[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roots = flattenRoots(tree).filter((r) => r.id !== page.id);
  // 자식이 있는 페이지를 다른 페이지의 하위로 옮기면 3단이 될 수 있으므로,
  // 부모 변경 UI는 "현재 root이고 자식이 없는 페이지"에서만 노출한다.
  const isRootItself = page.parentId === null;
  const currentNode = tree.find((r) => r.id === page.id);
  const canReparent = isRootItself && (currentNode?.children.length ?? 0) === 0;

  useEffect(() => {
    setTitle(page.title);
    setSlug(page.slug);
    setSlugError(null);
  }, [page.id, page.title, page.slug]);

  async function commitTitle(next: string) {
    setTitle(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await patchPage(page.id, { title: next });
      if (!result.ok) toast.error(result.error.message);
      else onChanged();
    }, 300);
  }

  async function commitSlug(next: string) {
    setSlug(next);
    setSlugError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const checkRes = await fetch(
        `/api/admin/pages/check-slug?slug=${encodeURIComponent(next)}&excludeId=${page.id}`
      );
      const check: ApiResult<{ available: boolean; reason: string | null }> = await checkRes.json();
      if (check.ok && !check.data.available) {
        setSlugError(
          check.data.reason === 'FORMAT'
            ? 'slug 형식이 올바르지 않습니다 (소문자/숫자/하이픈)'
            : '이미 사용 중인 slug입니다'
        );
        return;
      }
      const result = await patchPage(page.id, { slug: next });
      if (!result.ok) {
        setSlugError(result.error.message);
      } else {
        onChanged();
      }
    }, 300);
  }

  async function updateField(data: Record<string, unknown>) {
    const result = await patchPage(page.id, data);
    if (!result.ok) toast.error(result.error.message);
    else onChanged();
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto border-l p-4">
      <h3 className="text-sm font-medium">페이지 속성</h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-title">제목</Label>
        <Input id="page-title" value={title} onChange={(e) => commitTitle(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-slug">slug</Label>
        <Input
          id="page-slug"
          value={slug}
          onChange={(e) => commitSlug(e.target.value)}
          aria-invalid={!!slugError}
        />
        {slugError && <p className="text-xs text-destructive">{slugError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>아이콘</Label>
        <IconPicker value={page.icon} onChange={(icon) => updateField({ icon })} />
      </div>

      {canReparent && (
        <div className="flex flex-col gap-1.5">
          <Label>부모 페이지</Label>
          <Select
            value={page.parentId ?? '__root__'}
            onValueChange={(v) => updateField({ parentId: v === '__root__' ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">(최상위)</SelectItem>
              {roots.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor="page-visible">표시</Label>
        <Switch
          id="page-visible"
          checked={page.isVisible}
          onCheckedChange={(v) => updateField({ isVisible: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label htmlFor="page-aside">우측 지표 패널</Label>
          <span className="text-xs text-muted-foreground">끄면 운영 화면에서 패널이 사라지고 본문이 넓어집니다</span>
        </div>
        <Switch
          id="page-aside"
          checked={page.asideVisible}
          onCheckedChange={(v) => updateField({ asideVisible: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="page-home">홈으로 지정</Label>
        <Switch
          id="page-home"
          checked={page.isHome}
          onCheckedChange={(v) => {
            if (v) updateField({ isHome: true });
            else toast.info('다른 페이지를 홈으로 지정하면 자동으로 해제됩니다.');
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>행 높이 ({page.rowHeight}px)</Label>
        <Slider
          value={[page.rowHeight]}
          min={4}
          max={32}
          step={1}
          onValueChange={([v]) => updateField({ rowHeight: v })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>gap ({page.gap}px)</Label>
        <Slider
          value={[page.gap]}
          min={0}
          max={48}
          step={1}
          onValueChange={([v]) => updateField({ gap: v })}
        />
      </div>

      <p className="mt-auto font-mono text-[10px] text-muted-foreground">{page.id}</p>
    </div>
  );
}
