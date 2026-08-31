'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, ImagePlus, Loader2, Minus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiResult } from '@/types/auth';

/**
 * DRAM LF 평가표 — 양식(첨부 표)의 칸을 그대로 옮긴 입력 표(사용자 지정, 2026-08-31).
 *
 * 왜 표 하나가 통째로 컴포넌트인가: 이 화면은 칸마다 따로 저장하는 폼이 아니라 **줄 단위로 적어
 * 넣는 표**다. 한 줄이 sample 하나이고, 판정·측정값·불량 정보·Signature·그림이 그 한 줄에
 * 함께 붙는다. 칸을 따로 떼면 "몇 번째 줄의 어느 칸"을 서로 계속 맞춰야 한다(Reball 의뢰표와
 * 같은 이유).
 *
 * 세 가지가 양식과 다르게 처리된다.
 *   · 판정 칸(Result·Open·Short·ATE)은 **Pass/Fail 둘뿐**이라 고르는 상자로 두고 기본값을
 *     Pass로 둔다 — 대부분의 줄이 Pass라 적는 손이 그만큼 줄어든다.
 *   · Signature는 최대 여덟 줄이다. 표 안에 여덟 줄을 늘어놓으면 한 줄이 표 전체를 밀어내므로,
 *     칸에는 **몇 줄 적혔는지**만 보이고 실제 입력은 아래로 펼쳐지는 자리에서 한다.
 *   · 그림은 그 펼친 자리에 함께 둔다. 두 칸으로 시작하고 `+`로 늘린다 — 장수가 정해진 값이
 *     아니라서다.
 */

/** 판정 칸이 가질 수 있는 값. 양식에 적힌 그대로 둘뿐이다. */
const VERDICTS = ['Pass', 'Fail'] as const;
type Verdict = (typeof VERDICTS)[number];

/** Signature는 여덟 줄까지. 양식의 칸 높이가 그만큼이다. */
const MAX_SIGNATURES = 8;
/** 펼쳤을 때 처음 보이는 그림 칸 수 — 사용자 지정. 모자라면 `+`로 늘린다. */
const DEFAULT_IMAGE_SLOTS = 2;

const IMAGE_URL = (file: string) => `/api/runtime/tech-report/image?f=${encodeURIComponent(file)}`;

export type DramRow = {
  /** 이미 저장된 줄이면 그 줄의 id — 고칠 때 이것으로 찾는다. */
  id?: string;
  far_no: string;
  sample_no: string;
  result: Verdict;
  dc_open: Verdict;
  dc_short: Verdict;
  pin_lkg: string;
  idd2p: string;
  ate: Verdict;
  fail_symptom: string;
  fail_type: string;
  fail_address: string;
  signatures: string[];
  images: string[];
};

function emptyRow(): DramRow {
  return {
    far_no: '',
    sample_no: '',
    // 대부분의 줄이 Pass다 — 기본값을 Pass로 두면 Fail인 줄만 손대면 된다(사용자 지정).
    result: 'Pass',
    dc_open: 'Pass',
    dc_short: 'Pass',
    pin_lkg: '',
    idd2p: '',
    ate: 'Pass',
    fail_symptom: '',
    fail_type: '',
    fail_address: '',
    signatures: [],
    images: [],
  };
}

/** 저장된 값은 무엇이든 올 수 있다 — 판정은 아는 값만 받고 나머지는 Pass로 본다. */
function toVerdict(value: unknown): Verdict {
  return value === 'Fail' ? 'Fail' : 'Pass';
}

function toStringList(value: unknown, max: number): string[] {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? '')).slice(0, max);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** 조회 결과(list 바인딩) → 표의 줄. */
function toRows(data: unknown): DramRow[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    const text = (k: string) => String(row[k] ?? '');
    return {
      id: row.id ? String(row.id) : undefined,
      far_no: text('far_no'),
      sample_no: text('sample_no'),
      result: toVerdict(row.result),
      dc_open: toVerdict(row.dc_open),
      dc_short: toVerdict(row.dc_short),
      pin_lkg: text('pin_lkg'),
      idd2p: text('idd2p'),
      ate: toVerdict(row.ate),
      fail_symptom: text('fail_symptom'),
      fail_type: text('fail_type'),
      fail_address: text('fail_address'),
      signatures: toStringList(row.signatures, MAX_SIGNATURES),
      images: toStringList(row.images, 99),
    };
  });
}

const CELL_INPUT =
  'h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 text-center text-xs outline-none hover:border-input focus:border-ring focus:bg-background';

function VerdictCell({ value, disabled, onChange }: { value: Verdict; disabled: boolean; onChange: (v: Verdict) => void }) {
  return (
    <select
      // 화살표까지 들어갈 폭을 잡아 준다 — 좁으면 'Pass'가 'Pas…'로 잘려 무슨 값인지 안 보인다.
      className={cn(CELL_INPUT, 'min-w-[4.5rem] cursor-pointer px-0.5', value === 'Fail' && 'font-semibold text-destructive')}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Verdict)}
    >
      {VERDICTS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function DramEvalTable({
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
  /** 새 줄 하나를 만든다. */
  onSubmit?: (row: Record<string, unknown>) => Promise<boolean>;
  /** 이미 있는 줄 하나를 고친다. */
  onUpdate?: (row: Record<string, unknown>) => Promise<boolean>;
}) {
  const saved = useMemo(() => toRows(data), [data]);
  /** 화면에서 손대고 있는 줄들. 불러온 값으로 시작하고, 저장하면 서버가 다시 준다. */
  const [rows, setRows] = useState<DramRow[] | null>(null);
  const current = rows ?? saved;
  /** 펼쳐 둔 줄 — Signature와 그림은 여기서 적는다. 한 번에 하나만 편다. */
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [slotCount, setSlotCount] = useState<Record<number, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<{ row: number; slot: number } | null>(null);

  const locked = disabled ?? false;

  /**
   * 찾는 말은 **주소에 적는다** — 표가 이미 받아 온 줄들 안에서만 찾으면, 다음 쪽에 있는 줄은
   * 처음부터 대상이 아니라 "없다"로 읽힌다. 주소에 적으면 서버가 전체를 대상으로 다시 조회한다
   * (SearchFilter가 하던 일과 같고, 자리만 표 옆으로 옮긴 것이다).
   */
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => setQuery(urlQuery), [urlQuery]);
  useEffect(() => {
    if (query === urlQuery) return;
    // 글자마다 서버를 부르면 다섯 글자에 다섯 번 조회한다 — 잠깐 멈출 때만 보낸다.
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const value = query.trim();
      if (value === '') next.delete('q');
      else next.set('q', value);
      const qs = next.toString();
      router.push(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, urlQuery, router, searchParams]);

  function patch(index: number, next: Partial<DramRow>) {
    setRows(current.map((r, i) => (i === index ? { ...r, ...next } : r)));
  }

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
    const row = current[target.row];
    const images = [...row.images];
    images[target.slot] = stored;
    patch(target.row, { images });
  }

  async function saveRow(index: number) {
    const row = current[index];
    if (row.far_no.trim() === '' || row.sample_no.trim() === '') {
      toast.error('FAR No와 Sample No를 적어 주세요.');
      return;
    }
    const payload: Record<string, unknown> = {
      ...(row.id ? { id: row.id } : {}),
      far_no: row.far_no.trim(),
      sample_no: row.sample_no.trim(),
      result: row.result,
      dc_open: row.dc_open,
      dc_short: row.dc_short,
      pin_lkg: row.pin_lkg,
      idd2p: row.idd2p,
      ate: row.ate,
      fail_symptom: row.fail_symptom,
      fail_type: row.fail_type,
      fail_address: row.fail_address,
      // 배열 그대로 넘긴다 — JSON 칸은 데이터 엔진이 문자열로 바꿔 담는다(두 번 감싸면 깨진다).
      signatures: row.signatures.filter((s) => s.trim() !== ''),
      images: row.images.filter((s) => s !== ''),
    };
    setSaving(true);
    const ok = row.id ? await onUpdate?.(payload) : await onSubmit?.(payload);
    setSaving(false);
    if (ok) {
      toast.success(`${row.far_no} · sample ${row.sample_no} 저장했습니다.`);
      // 서버가 다시 준 값으로 돌아간다 — 화면에 들고 있던 사본이 진실이 되지 않게 한다.
      setRows(null);
      setOpenIndex(null);
    }
  }

  const headCell = 'border px-2 py-1 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {/*
          찾기는 표 바로 옆에 둔다(사용자 지정) — 예전에는 화면 위에 카드 하나를 통째로 차지했다.
          카드 한 장이 검색칸 하나를 담느라 표를 아래로 밀어냈고, 찾는 대상(표)과도 떨어져 있었다.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-52 rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="FAR No로 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="FAR No로 찾기"
            />
          </span>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={locked}
            onClick={() => {
              setRows([...current, emptyRow()]);
              setOpenIndex(current.length);
            }}
          >
            <Plus className="size-4" /> 줄 추가
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          {/* 양식처럼 DC가 다섯 칸을 거느린다 — 머리글이 두 줄이다. */}
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className={headCell} rowSpan={2} />
              <th className={headCell} rowSpan={2}>FAR No</th>
              <th className={headCell} rowSpan={2}>Sample No</th>
              <th className={headCell} rowSpan={2}>Result</th>
              <th className={headCell} colSpan={5}>DC</th>
              <th className={headCell} rowSpan={2}>불량 현상</th>
              <th className={headCell} rowSpan={2}>불량 유형</th>
              <th className={headCell} rowSpan={2}>불량 Address</th>
              <th className={headCell} rowSpan={2}>Signature</th>
              <th className={headCell} rowSpan={2} />
            </tr>
            <tr>
              <th className={headCell}>Open</th>
              <th className={headCell}>Short</th>
              <th className={headCell}>Pin Lkg</th>
              <th className={headCell}>IDD2P</th>
              <th className={headCell}>ATE</th>
            </tr>
          </thead>
          <tbody>
            {current.length === 0 ? (
              <tr>
                <td className="border px-2 py-6 text-center text-muted-foreground" colSpan={14}>
                  아직 적은 줄이 없습니다. 오른쪽 위 &lsquo;줄 추가&rsquo;를 누르세요.
                </td>
              </tr>
            ) : (
              current.map((row, index) => {
                const open = openIndex === index;
                /**
                 * 실제로 그림이 든 마지막 칸까지의 길이. `images.length`를 쓰면 안 된다 — 가운데
                 * 그림을 지우면 그 자리에 빈 값이 남아 길이는 그대로라, 칸을 줄일 수 없게 된다.
                 */
                const usedImages = row.images.reduce((n, file, i) => (file ? i + 1 : n), 0);
                const slots = Math.max(slotCount[index] ?? DEFAULT_IMAGE_SLOTS, usedImages, DEFAULT_IMAGE_SLOTS);
                return (
                  <FragmentRow
                    key={row.id ?? `new-${index}`}
                    row={row}
                    index={index}
                    open={open}
                    slots={slots}
                    locked={locked}
                    saving={saving}
                    onToggle={() => setOpenIndex(open ? null : index)}
                    onPatch={(next) => patch(index, next)}
                    onSave={() => void saveRow(index)}
                    onRemove={() => {
                      setRows(current.filter((_, i) => i !== index));
                      setOpenIndex(null);
                    }}
                    onAddSlot={() => setSlotCount({ ...slotCount, [index]: slots + 1 })}
                    onRemoveSlot={() => {
                      const next = Math.max(DEFAULT_IMAGE_SLOTS, slots - 1);
                      setSlotCount({ ...slotCount, [index]: next });
                      // 뒤에 남은 빈 자리는 함께 걷어낸다 — 안 그러면 저장본에 빈 값이 쌓인다.
                      if (row.images.length > next) patch(index, { images: row.images.slice(0, next) });
                    }}
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

/** 한 줄 + 그 아래 펼쳐지는 자리. 표의 줄 두 개라 조각으로 묶는다. */
function FragmentRow({
  row,
  index,
  open,
  slots,
  locked,
  saving,
  onToggle,
  onPatch,
  onSave,
  onRemove,
  onAddSlot,
  onRemoveSlot,
  onPick,
}: {
  row: DramRow;
  index: number;
  open: boolean;
  slots: number;
  locked: boolean;
  saving: boolean;
  onToggle: () => void;
  onPatch: (next: Partial<DramRow>) => void;
  onSave: () => void;
  onRemove: () => void;
  onAddSlot: () => void;
  onRemoveSlot: () => void;
  onPick: (slot: number) => void;
}) {
  const cell = 'border px-1 py-0.5';
  const filled = row.signatures.filter((s) => s.trim() !== '').length;
  /** 마지막 칸에 그림이 들어 있으면 줄이지 않는다 — 줄이는 김에 그림을 버리지 않기 위해서다. */
  const lastSlotFilled = Boolean(row.images[slots - 1]);
  const canShrink = slots > DEFAULT_IMAGE_SLOTS && !lastSlotFilled;

  return (
    <>
      <tr className={cn('hover:bg-muted/30', open && 'bg-muted/40')}>
        <td className={cn(cell, 'text-center')}>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            onClick={onToggle}
            aria-label={open ? `${index + 1}행 접기` : `${index + 1}행 펼치기`}
            aria-expanded={open}
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} value={row.far_no} disabled={locked} onChange={(e) => onPatch({ far_no: e.target.value })} aria-label={`${index + 1}행 FAR No`} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} value={row.sample_no} disabled={locked} onChange={(e) => onPatch({ sample_no: e.target.value })} aria-label={`${index + 1}행 Sample No`} />
        </td>
        <td className={cell}>
          <VerdictCell value={row.result} disabled={locked} onChange={(result) => onPatch({ result })} />
        </td>
        <td className={cell}>
          <VerdictCell value={row.dc_open} disabled={locked} onChange={(dc_open) => onPatch({ dc_open })} />
        </td>
        <td className={cell}>
          <VerdictCell value={row.dc_short} disabled={locked} onChange={(dc_short) => onPatch({ dc_short })} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} placeholder="800uA" value={row.pin_lkg} disabled={locked} onChange={(e) => onPatch({ pin_lkg: e.target.value })} aria-label={`${index + 1}행 Pin Lkg`} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} placeholder="200uA" value={row.idd2p} disabled={locked} onChange={(e) => onPatch({ idd2p: e.target.value })} aria-label={`${index + 1}행 IDD2P`} />
        </td>
        <td className={cell}>
          <VerdictCell value={row.ate} disabled={locked} onChange={(ate) => onPatch({ ate })} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} placeholder="N/A" value={row.fail_symptom} disabled={locked} onChange={(e) => onPatch({ fail_symptom: e.target.value })} aria-label={`${index + 1}행 불량 현상`} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} placeholder="N/A" value={row.fail_type} disabled={locked} onChange={(e) => onPatch({ fail_type: e.target.value })} aria-label={`${index + 1}행 불량 유형`} />
        </td>
        <td className={cell}>
          <input className={CELL_INPUT} placeholder="N/A" value={row.fail_address} disabled={locked} onChange={(e) => onPatch({ fail_address: e.target.value })} aria-label={`${index + 1}행 불량 Address`} />
        </td>
        {/* 여덟 줄을 표 안에 늘어놓으면 한 줄이 표 전체를 밀어낸다 — 몇 줄인지만 보이고 펼쳐서 적는다. */}
        <td className={cn(cell, 'text-center')}>
          <button type="button" className="w-full rounded px-1 py-1 text-xs hover:bg-muted" onClick={onToggle}>
            {filled > 0 ? (
              <span className="tabular-nums">{filled}줄</span>
            ) : (
              <span className="text-muted-foreground">적기</span>
            )}
            {row.images.filter(Boolean).length > 0 && (
              <span className="ml-1 text-muted-foreground">· 그림 {row.images.filter(Boolean).length}</span>
            )}
          </button>
        </td>
        <td className={cn(cell, 'whitespace-nowrap text-center')}>
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
          <td className="border bg-muted/20 px-3 py-3" colSpan={14}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Signature <span className="normal-case">(최대 {MAX_SIGNATURES}줄)</span>
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {Array.from({ length: MAX_SIGNATURES }, (_, i) => (
                    <input
                      key={i}
                      className="h-7 w-full min-w-0 rounded border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                      placeholder={`CH0 CS0 Signature_01_0${i + 1}`}
                      value={row.signatures[i] ?? ''}
                      disabled={locked}
                      aria-label={`${index + 1}행 Signature ${i + 1}`}
                      onChange={(e) => {
                        const next = Array.from({ length: MAX_SIGNATURES }, (_, k) => row.signatures[k] ?? '');
                        next[i] = e.target.value;
                        onPatch({ signatures: next });
                      }}
                    />
                  ))}
                </div>
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
                  {/*
                    늘린 칸은 되돌릴 수 있어야 한다(사용자 지정). 다만 **마지막 칸에 그림이 들어
                    있으면 줄이지 않는다** — 줄이는 김에 그림까지 조용히 버리면, 되돌릴 수 없는 일을
                    실수로 하게 된다. 먼저 그림을 지우면(칸 위 x) 그때 줄일 수 있다.
                  */}
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] hover:bg-muted disabled:opacity-40"
                    onClick={onRemoveSlot}
                    disabled={locked || !canShrink}
                    title={
                      slots <= DEFAULT_IMAGE_SLOTS
                        ? `기본 ${DEFAULT_IMAGE_SLOTS}칸보다 줄일 수는 없습니다`
                        : lastSlotFilled
                          ? '마지막 칸의 그림을 먼저 지우면 줄일 수 있습니다'
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
                              onClick={() => {
                                const images = [...row.images];
                                images[i] = '';
                                onPatch({ images });
                              }}
                              disabled={locked}
                              aria-label={`${index + 1}행 그림 ${i + 1} 지우기`}
                            >
                              <X className="size-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded border border-dashed text-[11px] text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                            onClick={() => onPick(i)}
                            disabled={locked}
                          >
                            <ImagePlus className="size-4" />
                            눌러서 고르기
                          </button>
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
export function DramEvalTablePreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-6 gap-px bg-border text-[11px]">
          {['FAR No', 'Sample', 'Result', 'Open', 'Short', 'Signature'].map((h) => (
            <div key={h} className="bg-muted px-2 py-1 font-semibold text-muted-foreground">
              {h}
            </div>
          ))}
          {['KR260001', '1', 'Pass', 'Pass', 'Pass', '8줄'].map((v, i) => (
            <div key={i} className="bg-card px-2 py-1">
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
