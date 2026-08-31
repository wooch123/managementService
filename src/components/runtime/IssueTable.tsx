'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PasteImageButton } from '@/components/runtime/PasteImageButton';
import type { ApiResult } from '@/types/auth';

/**
 * Issue 화면의 표 — 양식(첨부 표)의 칸을 그대로 옮긴 입력 표(사용자 지정, 2026-08-31).
 *
 * DRAM LF 평가표와 같은 뼈대다: 줄 단위로 적어 넣고, 줄을 펼치면 코멘트와 그림이 나온다.
 * 다른 점은 **칸마다 찾고 정렬한다**는 것이다 — 칸이 열여섯이라 한 줄 검색으로는 "어느 칸에서
 * 찾은 것인지"를 알 수 없고, 불량 Location이나 진행 상황처럼 같은 값이 반복되는 칸은 그 칸만
 * 좁혀 보는 일이 잦다.
 *
 * 찾기·정렬은 **받아 온 줄 안에서** 한다. 이 표는 이슈 하나에 딸린 줄만 보므로(수백 줄을 넘지
 * 않는다) 서버를 다시 부르는 것보다 그 자리에서 거르는 편이 빠르고, 타자마다 화면이 따라온다.
 */

/** 양식의 칸 — 순서도 그대로다. */
export const ISSUE_COLUMNS = [
  { col: 'no', label: 'No', width: 56 },
  { col: 'fail_location', label: '불량 Location', width: 120 },
  { col: 'fail_mode', label: '불량 모드', width: 100 },
  { col: 'fail_type', label: '불량 유형', width: 120 },
  { col: 'pjt', label: 'PJT', width: 72 },
  { col: 'week_code', label: 'Week Code', width: 100 },
  { col: 'slc_max_ec', label: 'SLC Max EC', width: 100 },
  { col: 'mlc_max_ec', label: 'MLC Max EC', width: 100 },
  { col: 'tbw', label: 'TBW', width: 88 },
  { col: 'far_no', label: 'FAR No', width: 110 },
  { col: 'sample_no', label: 'Sample No', width: 92 },
  { col: 'cust_symptom', label: '고객 불량 현상', width: 130 },
  { col: 'fail_analysis', label: '불량 분석 현황', width: 130 },
  { col: 'stack', label: 'Stack', width: 100 },
  { col: 'wafer_map', label: 'Wafer Map', width: 100 },
  { col: 'progress', label: '진행 상황', width: 100 },
] as const;

const DEFAULT_IMAGE_SLOTS = 2;
const IMAGE_URL = (file: string) => `/api/runtime/tech-report/image?f=${encodeURIComponent(file)}`;

type IssueRow = {
  id?: string;
  values: Record<string, string>;
  comment: string;
  images: string[];
};

function emptyRow(nextNo: number): IssueRow {
  const values = Object.fromEntries(ISSUE_COLUMNS.map((c) => [c.col, ''])) as Record<string, string>;
  // No는 대개 순번이라 미리 채워 둔다 — 지우고 다른 값을 적어도 된다.
  values.no = String(nextNo);
  return { values, comment: '', images: [] };
}

function parseList(value: unknown): string[] {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  return Array.isArray(raw) ? raw.map((v) => String(v ?? '')).filter((v) => v !== '') : [];
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toRows(data: unknown): IssueRow[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id ? String(row.id) : undefined,
      values: Object.fromEntries(ISSUE_COLUMNS.map((c) => [c.col, String(row[c.col] ?? '')])) as Record<string, string>,
      comment: String(row.comment ?? ''),
      images: parseList(row.images),
    };
  });
}

const CELL_INPUT =
  'h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-input focus:border-ring focus:bg-background';

export function IssueTable({
  title,
  description,
  data,
  disabled,
  onSubmit,
  onUpdate,
}: {
  title: string;
  description: string;
  data?: unknown;
  disabled?: boolean;
  onSubmit?: (row: Record<string, unknown>) => Promise<boolean>;
  onUpdate?: (row: Record<string, unknown>) => Promise<boolean>;
}) {
  const saved = useMemo(() => toRows(data), [data]);
  const [rows, setRows] = useState<IssueRow[] | null>(null);
  const current = rows ?? saved;

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [slotCount, setSlotCount] = useState<Record<number, number>>({});
  /** 전체 찾기 — 어느 칸에든 있으면 남긴다. */
  const [globalQuery, setGlobalQuery] = useState('');
  /** 칸마다의 찾기. 비어 있는 칸은 거르지 않는다. */
  const [columnQuery, setColumnQuery] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<{ row: number; slot: number } | null>(null);
  const locked = disabled ?? false;

  function patch(index: number, next: Partial<IssueRow>) {
    setRows(current.map((r, i) => (i === index ? { ...r, ...next } : r)));
  }
  function patchValue(index: number, col: string, value: string) {
    patch(index, { values: { ...current[index].values, [col]: value } });
  }

  /**
   * 보여 줄 줄 — 거르고 정렬한다. **원래 자리(index)를 함께 들고 다닌다**: 고치고 지우는 것은
   * 거르기 전 목록을 기준으로 해야 한다. 걸러진 화면의 순번으로 고치면 엉뚱한 줄이 바뀐다.
   */
  const visible = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    let list = current.map((row, index) => ({ row, index }));
    if (q !== '') {
      list = list.filter(({ row }) =>
        ISSUE_COLUMNS.some((c) => (row.values[c.col] ?? '').toLowerCase().includes(q)) ||
        row.comment.toLowerCase().includes(q)
      );
    }
    for (const [col, value] of Object.entries(columnQuery)) {
      const needle = value.trim().toLowerCase();
      if (needle === '') continue;
      list = list.filter(({ row }) => (row.values[col] ?? '').toLowerCase().includes(needle));
    }
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = a.row.values[sort.col] ?? '';
        const y = b.row.values[sort.col] ?? '';
        // 수로 읽히면 수로 견준다 — No·EC·TBW가 글자 순서로 늘어서면 1 다음이 10이 된다.
        const nx = Number(x);
        const ny = Number(y);
        if (x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * dir;
        return x.localeCompare(y, 'ko') * dir;
      });
    }
    return list;
  }, [current, globalQuery, columnQuery, sort]);

  async function upload(file: File): Promise<string | null> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/runtime/tech-report/image', { method: 'POST', body: form });
    const result = (await res.json()) as ApiResult<{ file: string }>;
    if (!result.ok) {
      toast.error(result.error.message);
      return null;
    }
    return result.data.file;
  }

  async function onPicked(file: File | null) {
    const target = pickTarget.current;
    if (!file || !target) return;
    const stored = await upload(file);
    if (!stored) return;
    const images = [...current[target.row].images];
    images[target.slot] = stored;
    patch(target.row, { images });
  }


  /** 붙여넣기 단추가 준 그림 — 파일 고르기와 같은 자리로 들어간다. */
  async function pasteImage(rowIndex: number, slot: number, file: File) {
    const stored = await upload(file);
    if (!stored) return;
    const images = [...current[rowIndex].images];
    images[slot] = stored;
    patch(rowIndex, { images });
  }

  async function saveRow(index: number) {
    const row = current[index];
    const payload: Record<string, unknown> = {
      ...(row.id ? { id: row.id } : {}),
      ...row.values,
      comment: row.comment,
      images: row.images.filter((f) => f),
    };
    setSaving(true);
    const ok = row.id ? await onUpdate?.(payload) : await onSubmit?.(payload);
    setSaving(false);
    if (ok) {
      toast.success(`${row.values.no || index + 1}번 줄을 저장했습니다.`);
      // 서버가 다시 준 값으로 돌아간다 — 화면이 들고 있던 사본이 진실이 되지 않게.
      setRows(null);
      setOpenIndex(null);
    }
  }

  const headCell = 'border px-1.5 py-1 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground';
  const activeFilters = Object.values(columnQuery).filter((v) => v.trim() !== '').length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-56 rounded-md border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="모든 칸에서 찾기"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              aria-label="모든 칸에서 찾기"
            />
          </span>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={locked}
            onClick={() => {
              const nextNo = current.length + 1;
              setRows([...current, emptyRow(nextNo)]);
              setOpenIndex(current.length);
            }}
          >
            <Plus className="size-4" /> 줄 추가
          </button>
        </div>
      </div>

      {(globalQuery.trim() !== '' || activeFilters > 0) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {current.length}줄 중 {visible.length}줄
          </span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 hover:bg-muted"
            onClick={() => {
              setGlobalQuery('');
              setColumnQuery({});
            }}
          >
            조건 지우기
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className={headCell} />
              {ISSUE_COLUMNS.map((c) => (
                <th key={c.col} className={headCell} style={{ minWidth: c.width }}>
                  {/* 머리글을 누르면 그 칸으로 정렬한다 — 오름 → 내림 → 없음으로 돈다. */}
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1 whitespace-nowrap hover:text-foreground"
                    onClick={() =>
                      setSort((prev) =>
                        prev?.col !== c.col ? { col: c.col, dir: 'asc' } : prev.dir === 'asc' ? { col: c.col, dir: 'desc' } : null
                      )
                    }
                    title={`${c.label}으로 정렬`}
                  >
                    {c.label}
                    {sort?.col === c.col ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/40" />
                    )}
                  </button>
                </th>
              ))}
              <th className={headCell} />
            </tr>
            {/* 칸마다의 찾기 — 머리글 바로 아래에 둔다. 어느 칸을 좁히고 있는지 눈으로 이어진다. */}
            <tr>
              <th className="border bg-muted/60 px-1 py-0.5" />
              {ISSUE_COLUMNS.map((c) => (
                <th key={c.col} className="border bg-muted/60 px-1 py-0.5">
                  <input
                    className="h-6 w-full min-w-0 rounded border border-input/60 bg-background px-1.5 text-[11px] font-normal outline-none focus:border-ring"
                    placeholder="찾기"
                    value={columnQuery[c.col] ?? ''}
                    onChange={(e) => setColumnQuery({ ...columnQuery, [c.col]: e.target.value })}
                    aria-label={`${c.label} 칸에서 찾기`}
                  />
                </th>
              ))}
              <th className="border bg-muted/60 px-1 py-0.5" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="border px-2 py-6 text-center text-muted-foreground" colSpan={ISSUE_COLUMNS.length + 2}>
                  {current.length === 0 ? '아직 적은 줄이 없습니다. 오른쪽 위 ‘줄 추가’를 누르세요.' : '조건에 맞는 줄이 없습니다.'}
                </td>
              </tr>
            ) : (
              visible.map(({ row, index }) => {
                const open = openIndex === index;
                const usedImages = row.images.reduce((n, file, i) => (file ? i + 1 : n), 0);
                const slots = Math.max(slotCount[index] ?? DEFAULT_IMAGE_SLOTS, usedImages, DEFAULT_IMAGE_SLOTS);
                const lastFilled = Boolean(row.images[slots - 1]);
                return (
                  <RowPair
                    key={row.id ?? `new-${index}`}
                    row={row}
                    index={index}
                    open={open}
                    slots={slots}
                    canShrink={slots > DEFAULT_IMAGE_SLOTS && !lastFilled}
                    lastFilled={lastFilled}
                    locked={locked}
                    saving={saving}
                    onToggle={() => setOpenIndex(open ? null : index)}
                    onValue={(col, value) => patchValue(index, col, value)}
                    onComment={(value) => patch(index, { comment: value })}
                    onSave={() => void saveRow(index)}
                    onRemove={() => {
                      setRows(current.filter((_, i) => i !== index));
                      setOpenIndex(null);
                    }}
                    onAddSlot={() => setSlotCount({ ...slotCount, [index]: slots + 1 })}
                    onRemoveSlot={() => {
                      const next = Math.max(DEFAULT_IMAGE_SLOTS, slots - 1);
                      setSlotCount({ ...slotCount, [index]: next });
                      if (row.images.length > next) patch(index, { images: row.images.slice(0, next) });
                    }}
                    onClearImage={(i) => {
                      const images = [...row.images];
                      images[i] = '';
                      patch(index, { images });
                    }}
                    onPasteImage={(slot, file) => void pasteImage(index, slot, file)}
                    onPick={(slot) => {
                      pickTarget.current = { row: index, slot };
                      fileRef.current?.click();
                    }}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onPicked(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** 한 줄 + 그 아래 펼쳐지는 자리. */
function RowPair({
  row,
  index,
  open,
  slots,
  canShrink,
  lastFilled,
  locked,
  saving,
  onToggle,
  onValue,
  onComment,
  onSave,
  onRemove,
  onAddSlot,
  onRemoveSlot,
  onClearImage,
  onPasteImage,
  onPick,
}: {
  row: IssueRow;
  index: number;
  open: boolean;
  slots: number;
  canShrink: boolean;
  lastFilled: boolean;
  locked: boolean;
  saving: boolean;
  onToggle: () => void;
  onValue: (col: string, value: string) => void;
  onComment: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onAddSlot: () => void;
  onRemoveSlot: () => void;
  onClearImage: (slot: number) => void;
  onPasteImage: (slot: number, file: File) => void;
  onPick: (slot: number) => void;
}) {
  const filledImages = row.images.filter(Boolean).length;
  return (
    <>
      <tr className={cn('hover:bg-muted/30', open && 'bg-muted/40')}>
        <td className="border px-1 py-0.5 text-center">
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            onClick={onToggle}
            aria-label={open ? `${index + 1}행 접기` : `${index + 1}행 펼치기`}
            aria-expanded={open}
            title={filledImages > 0 || row.comment ? '코멘트·그림이 있습니다' : '코멘트와 그림을 적습니다'}
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        </td>
        {ISSUE_COLUMNS.map((c) => (
          <td key={c.col} className="border px-1 py-0.5">
            <input
              className={cn(CELL_INPUT, c.col === 'no' && 'text-center')}
              value={row.values[c.col] ?? ''}
              disabled={locked}
              onChange={(e) => onValue(c.col, e.target.value)}
              aria-label={`${index + 1}행 ${c.label}`}
            />
          </td>
        ))}
        <td className="border px-1 py-0.5 text-center whitespace-nowrap">
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
            onClick={onSave}
            disabled={locked || saving}
            aria-label={`${index + 1}행 저장`}
            title="저장"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </button>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            onClick={onRemove}
            disabled={locked}
            aria-label={`${index + 1}행 지우기`}
            title="이 줄을 화면에서 뺀다(저장된 줄은 지워지지 않는다)"
          >
            <Trash2 className="size-3.5" />
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td className="border bg-muted/20 px-3 py-3" colSpan={ISSUE_COLUMNS.length + 2}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">코멘트</p>
                <textarea
                  className="min-h-24 w-full rounded border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
                  value={row.comment}
                  disabled={locked}
                  placeholder="이 줄에 대해 남길 말"
                  onChange={(e) => onComment(e.target.value)}
                  aria-label={`${index + 1}행 코멘트`}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">그림</p>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] hover:bg-muted disabled:opacity-40"
                    onClick={onAddSlot}
                    disabled={locked}
                  >
                    <Plus className="size-3" /> 칸 추가
                  </button>
                  {/* 마지막 칸에 그림이 있으면 줄이지 않는다 — 줄이는 김에 그림을 버리지 않기 위해서다. */}
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] hover:bg-muted disabled:opacity-40"
                    onClick={onRemoveSlot}
                    disabled={locked || !canShrink}
                    title={
                      !canShrink && lastFilled
                        ? '마지막 칸의 그림을 먼저 지우면 줄일 수 있습니다'
                        : !canShrink
                          ? `기본 ${DEFAULT_IMAGE_SLOTS}칸보다 줄일 수는 없습니다`
                          : '마지막 빈 칸을 줄입니다'
                    }
                  >
                    <Minus className="size-3" /> 칸 줄이기
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: slots }, (_, i) => {
                    const file = row.images[i] ?? '';
                    return (
                      <div key={i} className="relative">
                        {file ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={IMAGE_URL(file)} alt={`${index + 1}행 그림 ${i + 1}`} className="h-24 w-full rounded border object-contain" />
                            <button
                              type="button"
                              className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded bg-background/80 text-muted-foreground hover:text-destructive"
                              onClick={() => onClearImage(i)}
                              disabled={locked}
                              aria-label={`${index + 1}행 그림 ${i + 1} 지우기`}
                            >
                              <X className="size-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded border border-dashed text-[11px] text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                              onClick={() => onPick(i)}
                              disabled={locked}
                            >
                              <ImagePlus className="size-4" />
                              눌러서 고르기
                            </button>
                            {/* 화면을 캡처해 붙이는 것이 가장 흔한 쓰임이라, 파일을 고르는 길 옆에 함께 둔다. */}
                            <PasteImageButton
                              label={`${index + 1}행 그림 ${i + 1}`}
                              disabled={locked}
                              className="absolute top-1 right-1 bg-background/80"
                              onPick={(file) => onPasteImage(i, file)}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기. */
export function IssueTablePreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-5 gap-px bg-border text-[11px]">
          {['No', '불량 Location', '불량 모드', 'FAR No', '진행 상황'].map((h) => (
            <div key={h} className="bg-muted px-2 py-1 font-semibold text-muted-foreground">
              {h}
            </div>
          ))}
          {['1', 'CH0 CS0', 'Read Fail', 'FAR-25-1251', '분석 중'].map((v, i) => (
            <div key={i} className="bg-card px-2 py-1">
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
