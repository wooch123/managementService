'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPicker } from '@/components/builder/IconPicker';
import { getComponentDef } from '@/lib/registry/catalog';
import { describeSchema, type FieldDescriptor } from '@/lib/registry/introspect';
import { useCanvasStore } from '@/components/builder/canvas-store';

export function PropertyForm() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const node = nodes.find((n) => n.id === selectedId);

  const [local, setLocal] = useState<Record<string, unknown>>(node?.props ?? {});
  const pendingRef = useRef<Record<string, unknown>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(node?.props ?? {});
    pendingRef.current = {};
  }, [node?.id, node?.props]);

  if (!node) {
    return <p className="p-4 text-center text-xs text-muted-foreground">캔버스에서 컴포넌트를 선택하세요</p>;
  }

  const def = getComponentDef(node.type);
  if (!def) {
    return <p className="p-4 text-center text-xs text-destructive">알 수 없는 컴포넌트 타입: {node.type}</p>;
  }

  const fields = describeSchema(def.propsSchema);

  function commit(key: string, value: unknown) {
    setLocal((p) => ({ ...p, [key]: value }));
    pendingRef.current[key] = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!node) return;
      updateNode(node.id, { props: pendingRef.current });
      pendingRef.current = {};
    }, 300);
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <h3 className="text-sm font-medium">{def.label} 속성</h3>
      {Object.entries(fields).map(([key, desc]) => (
        <FieldRow
          key={key}
          fieldKey={key}
          descriptor={desc}
          value={local[key]}
          description={(def.propsSchema.shape[key] as { description?: string } | undefined)?.description}
          onChange={(v) => commit(key, v)}
        />
      ))}
    </div>
  );
}

function FieldLabelRow({ fieldKey, description }: { fieldKey: string; description?: string }) {
  const label = <Label htmlFor={fieldKey}>{fieldKey}</Label>;
  if (!description) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

function FieldRow({
  fieldKey,
  descriptor,
  value,
  description,
  onChange,
}: {
  fieldKey: string;
  descriptor: FieldDescriptor;
  value: unknown;
  description?: string;
  onChange: (v: unknown) => void;
}) {
  switch (descriptor.kind) {
    case 'string':
      if (descriptor.special === 'icon') {
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabelRow fieldKey={fieldKey} description={description} />
            <IconPicker value={(value as string) ?? null} onChange={(v) => onChange(v ?? '')} />
          </div>
        );
      }
      if (descriptor.special === 'color') {
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabelRow fieldKey={fieldKey} description={description} />
            <input
              type="color"
              value={(value as string) || '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-full rounded-md border border-input"
            />
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <Input id={fieldKey} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );

    case 'enum':
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <Select value={(value as string) ?? descriptor.options[0]} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {descriptor.options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'number': {
      const numValue = typeof value === 'number' ? value : 0;
      if (descriptor.min !== null && descriptor.max !== null) {
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabelRow fieldKey={fieldKey} description={description} />
            <Slider
              value={[numValue]}
              min={descriptor.min}
              max={descriptor.max}
              onValueChange={([v]) => onChange(v)}
            />
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <Input
            id={fieldKey}
            type="number"
            value={numValue}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      );
    }

    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <Switch id={fieldKey} checked={!!value} onCheckedChange={onChange} />
        </div>
      );

    case 'string[]':
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <TagInput value={(value as string[]) ?? []} onChange={onChange} />
        </div>
      );

    case 'object[]':
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabelRow fieldKey={fieldKey} description={description} />
          <ObjectArrayEditor
            itemShape={descriptor.itemShape}
            value={(value as Record<string, unknown>[]) ?? []}
            onChange={onChange}
          />
        </div>
      );

    default:
      return null;
  }
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder="입력 후 Enter"
        className="h-7 text-xs"
      />
    </div>
  );
}

function ObjectArrayEditor({
  itemShape,
  value,
  onChange,
}: {
  itemShape: Record<string, FieldDescriptor>;
  value: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  const keys = Object.keys(itemShape);

  function updateRow(index: number, key: string, v: unknown) {
    const next = value.map((row, i) => (i === index ? { ...row, [key]: v } : row));
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    const blank: Record<string, unknown> = {};
    for (const key of keys) {
      const d = itemShape[key];
      blank[key] = d.kind === 'boolean' ? false : d.kind === 'number' ? 0 : d.kind === 'enum' ? d.options[0] : '';
    }
    onChange([...value, blank]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-end gap-1 border-b pb-2 last:border-b-0 last:pb-0">
          <div className="grid flex-1 grid-cols-2 gap-1">
            {keys.map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{key}</span>
                <RowFieldInput descriptor={itemShape[key]} value={row[key]} onChange={(v) => updateRow(i, key, v)} />
              </div>
            ))}
          </div>
          <Button variant="ghost" size="icon-xs" onClick={() => removeRow(i)} aria-label="행 삭제">
            <X className="size-3" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-3.5" /> 행 추가
      </Button>
    </div>
  );
}

function RowFieldInput({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (descriptor.kind === 'enum') {
    return (
      <Select value={(value as string) ?? descriptor.options[0]} onValueChange={onChange}>
        <SelectTrigger className="h-6 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {descriptor.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (descriptor.kind === 'boolean') {
    return <Switch checked={!!value} onCheckedChange={onChange} />;
  }
  if (descriptor.kind === 'number') {
    return (
      <Input
        type="number"
        className="h-6 text-xs"
        value={typeof value === 'number' ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  return (
    <Input
      className="h-6 text-xs"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
