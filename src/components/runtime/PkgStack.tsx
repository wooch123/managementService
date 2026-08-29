'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardPaste, ImagePlus, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * PKG Stack 정보 — Part ID 하나의 적층 구조를 적고, 적어 둔 것들을 갤러리로 편다.
 *
 * 양식(첨부 그림)은 두 부분이다: 위쪽에 CH·WAY·Chip 차수를 **최대 16줄**까지 적는 표, 아래쪽에
 * 구조 그림 한 장. 그 둘이 Part ID 하나에 묶여 한 장(카드)을 이룬다.
 *
 * 적층 줄은 개수가 정해지지 않은 값이라 칼럼 열여섯 벌 대신 JSON 한 칸에 담는다. 그림은 Tech
 * Report의 그림 저장소를 그대로 쓴다 — 판별·크기 제한처럼 틀리면 위험한 부분을 다시 짜지 않는다.
 *
 * 목록(갤러리)은 **바인딩이 준 데이터**를 그린다. 그래서 Part ID 검색은 이 컴포넌트가 아니라
 * 화면의 검색 상자가 주소에 남기고 서버가 걸러 준다 — 스무 장이 되든 이백 장이 되든 같다.
 */

const IMAGE_URL = (file: string) => `/api/runtime/tech-report/image?f=${encodeURIComponent(file)}`;
const MAX_LAYERS = 16;

export type StackLayer = { ch: string; way: string; chip: string };

/**
 * 저장할 때 액션이 집어 가는 값.
 *
 * `layers`는 **배열 그대로** 넘긴다 — JSON 칸에 넣는 일은 데이터 엔진이 한다(crud.ts). 여기서
 * 미리 문자열로 만들면 엔진이 그 문자열을 한 번 더 감싸 저장한다(실제로 그렇게 저장됐다).
 */
export type PkgStackValue = { part_id: string; layers: StackLayer[]; image: string; note: string };

const emptyLayer = (): StackLayer => ({ ch: '', way: '', chip: '' });

/** 표의 칸 — 화면에 보이는 이름과 값의 키를 한 곳에 묶어 둔다(읽어 주는 이름도 이것을 쓴다). */
const LAYER_COLUMNS = [
  { key: 'ch', label: 'CH' },
  { key: 'way', label: 'WAY' },
  { key: 'chip', label: 'Chip 차수' },
] as const;

/**
 * 저장된 JSON 한 칸 → 줄 목록.
 *
 * 조회 경로에 따라 **글자로 오기도 하고 이미 배열로 오기도 한다**(목록 바인딩은 저장된 글자를
 * 그대로 주고, 다른 창구는 풀어서 준다). 둘 다 받고, 모양이 다르면 빈 목록으로 물러난다 —
 * 여기서 던지면 갤러리 전체가 안 그려진다.
 */
function parseLayers(raw: unknown): StackLayer[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ ch: String(r.ch ?? ''), way: String(r.way ?? ''), chip: String(r.chip ?? '') }));
}

type GalleryCard = { id: string; partId: string; layers: StackLayer[]; image: string; note: string };

/** 바인딩 결과 → 갤러리 카드. 컬럼 이름은 설계가 정한 그대로다(site-schema.ts). */
function toCards(data: unknown): GalleryCard[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((row, i) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? i),
      partId: String(r.part_id ?? ''),
      layers: parseLayers(r.layers),
      image: String(r.image ?? ''),
      note: String(r.note ?? ''),
    };
  });
}

const inputClass =
  'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** 적층 표 — 읽기 전용(갤러리)과 편집(입력 양식)이 같은 모양을 쓴다. */
function LayerTable({
  layers,
  onChange,
}: {
  layers: StackLayer[];
  /** 없으면 읽기 전용. */
  onChange?: (rows: StackLayer[]) => void;
}) {
  const editable = typeof onChange === 'function';
  const set = (i: number, part: Partial<StackLayer>) => onChange?.(layers.map((r, j) => (i === j ? { ...r, ...part } : r)));

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {LAYER_COLUMNS.map(({ label: h }) => (
            <th key={h} className="border bg-muted px-2 py-1 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {h}
            </th>
          ))}
          {editable && <th className="w-9 border bg-muted" />}
        </tr>
      </thead>
      <tbody>
        {layers.map((row, i) => (
          <tr key={i}>
            {LAYER_COLUMNS.map(({ key, label }) => (
              <td key={key} className={cn('border p-1 text-center', !editable && 'px-2 py-1 tabular-nums')}>
                {editable ? (
                  <input
                    className={cn(inputClass, 'text-center tabular-nums')}
                    value={row[key]}
                    onChange={(e) => set(i, { [key]: e.target.value } as Partial<StackLayer>)}
                    aria-label={`${i + 1}행 ${label}`}
                  />
                ) : (
                  (row[key] || '—')
                )}
              </td>
            ))}
            {editable && (
              <td className="border p-1 text-center">
                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-40"
                  disabled={layers.length === 1}
                  onClick={() => onChange?.(layers.filter((_, j) => j !== i))}
                  aria-label={`${i + 1}행 지우기`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PkgStack({
  title,
  description,
  data,
  onSubmit,
}: {
  title: string;
  description: string;
  /** 저장된 목록(list 바인딩). 검색은 주소의 조건으로 서버가 이미 걸러 준 것이다. */
  data: unknown;
  onSubmit: (value: PkgStackValue) => Promise<boolean>;
}) {
  const cards = useMemo(() => toCards(data), [data]);

  const [openForm, setOpenForm] = useState(false);
  const [partId, setPartId] = useState('');
  const [layers, setLayers] = useState<StackLayer[]>([emptyLayer()]);
  const [image, setImage] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPartId('');
    setLayers([emptyLayer()]);
    setImage('');
    setNote('');
  };

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/runtime/tech-report/image', { method: 'POST', body: form });
      const result = (await res.json()) as { ok: boolean; data?: { file: string }; error?: { message: string } };
      if (!result.ok || !result.data) {
        toast.error(result.error?.message ?? '그림을 올리지 못했습니다.');
        return;
      }
      setImage(result.data.file);
    } catch {
      toast.error('그림을 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  }

  /** 클립보드의 그림을 이 칸에 붙인다 — Tech Report의 붙여넣기 단추와 같은 방식이다. */
  async function pasteImage() {
    try {
      const clipboard = navigator.clipboard as Clipboard | undefined;
      const read = clipboard?.read as Clipboard['read'] | undefined;
      if (typeof read !== 'function') {
        toast.error('이 브라우저는 클립보드 읽기를 지원하지 않습니다. 파일로 올려 주세요.');
        return;
      }
      for (const item of await read.call(clipboard!)) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        await upload(new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type }));
        return;
      }
      toast.error('클립보드에 그림이 없습니다.');
    } catch {
      toast.error('클립보드를 읽지 못했습니다.');
    }
  }

  async function save() {
    if (partId.trim() === '') {
      toast.error('Part ID를 적어 주세요.');
      return;
    }
    // 세 칸이 모두 빈 줄은 적다 만 줄이다 — 저장하지 않는다.
    const filled = layers.filter((r) => r.ch.trim() || r.way.trim() || r.chip.trim());
    setSaving(true);
    const ok = await onSubmit({ part_id: partId.trim(), layers: filled, image, note: note.trim() });
    setSaving(false);
    if (!ok) return;
    toast.success(`${partId.trim()} 을(를) 저장했습니다.`);
    reset();
    setOpenForm(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => setOpenForm((v) => !v)}
        >
          {openForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {openForm ? '입력 닫기' : '추가하기'}
        </button>
      </div>

      {/* ── 입력 양식 — '추가하기'를 눌렀을 때만 나온다 ── */}
      {openForm && (
        <div className="shrink-0 rounded-lg border bg-muted/20 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Part ID</span>
                <input className={inputClass} value={partId} onChange={(e) => setPartId(e.target.value)} placeholder="예: PN-682D0" />
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">입력 칸</span>
                <span className="text-[11px] text-muted-foreground">
                  {layers.length} / {MAX_LAYERS}칸
                </span>
              </div>
              <LayerTable layers={layers} onChange={setLayers} />
              <button
                type="button"
                className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted/50 disabled:opacity-50"
                disabled={layers.length >= MAX_LAYERS}
                onClick={() => setLayers((prev) => [...prev, emptyLayer()])}
                title={layers.length >= MAX_LAYERS ? `최대 ${MAX_LAYERS}칸까지 입력할 수 있습니다` : undefined}
              >
                <Plus className="size-3.5" /> 칸 추가
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">그림</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void pasteImage()}
                    title="클립보드의 그림을 붙여넣기"
                    aria-label="클립보드 그림 붙여넣기"
                  >
                    <ClipboardPaste className="size-3.5" />
                  </button>
                  {image && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => setImage('')}
                      aria-label="그림 지우기"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={IMAGE_URL(image)} alt="PKG 구조" className="max-h-72 w-full rounded-md border object-contain" />
              ) : (
                <button
                  type="button"
                  className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed hover:bg-muted/40"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) void upload(dropped);
                  }}
                >
                  {uploading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">{uploading ? '올리는 중…' : '그림을 끌어다 놓거나 눌러서 고르기'}</span>
                </button>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">메모</span>
                <textarea
                  className="min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              저장
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void upload(picked);
          e.target.value = '';
        }}
      />

      {/* ── 갤러리 ── */}
      {cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          저장된 PKG Stack이 없습니다. 위 &lsquo;추가하기&rsquo;로 적어 두세요.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 overflow-y-auto">
          {cards.map((card) => (
            <article key={card.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <h4 className="truncate text-sm font-semibold" title={card.partId}>
                {card.partId || '(Part ID 없음)'}
              </h4>
              {card.layers.length > 0 && <LayerTable layers={card.layers} />}
              {card.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={IMAGE_URL(card.image)} alt={`${card.partId} 구조`} className="max-h-64 w-full rounded-md border object-contain" />
              ) : (
                <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">그림 없음</div>
              )}
              {card.note && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{card.note}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트에서 보여 줄 모양(값을 다루지 않는다). */
export function PkgStackPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border p-2">
            <span className="text-xs font-semibold">PN-00000</span>
            <span className="text-[11px] text-muted-foreground">CH · WAY · Chip 차수</span>
            <div className="h-12 rounded border border-dashed" />
          </div>
        ))}
      </div>
    </div>
  );
}
