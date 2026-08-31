'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  FileDown,
  FileSearch,
  ImagePlus,
  MoveUpRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  IMAGE_SLOTS,
  META_SLOTS,
  NAND_LOT_COLUMNS,
  PERF_ROWS,
  PRODUCT_COLUMNS,
  RTBB_COLUMNS,
  highestSlotNumber,
  type SampleStack,
  type TechReportDoc,
  type TechReportSample,
} from '@/lib/far/tech-report-fields';
import { PasteImageButton } from '@/components/runtime/PasteImageButton';
import type { ApiResult } from '@/types/auth';

/**
 * Tech Report 작성 화면 — 양식(`sample page/tech report page.html`)의 배치를 그대로 옮긴 것이다.
 *
 * 왜 한 덩어리인가: 이 화면은 카드 여러 장이 아니라 **문서 하나**다. FAR No 하나를 불러오면
 * 모든 탭이 함께 채워지고, 어느 칸을 고치든 같은 문서가 저장되며, 내보내기는 탭 전체를 한 번에
 * 인쇄한다. 이 셋은 전부 화면을 가로지르는 동작이라 컴포넌트를 스무 개로 쪼개면 어디에도
 * 담을 자리가 없다(게시판·Reball 단가와 같은 이유).
 *
 * 저장은 **고칠 때마다** 일어난다(입력이 멈추고 0.8초). 문서 전체를 보낸다 — 칸 단위로 보내면
 * 표에 줄을 더하고 지우는 동안 "어느 줄의 몇 번째 칸"을 서로 계속 맞춰야 한다.
 */

const AUTOSAVE_DELAY_MS = 800;

/** 붙여넣을 HTML에 값을 넣기 전에 — 값 안의 <, & 가 태그로 읽히면 안 된다. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 큰따옴표·쉼표·줄바꿈이 든 칸은 감싼다(RFC 4180). */
function csvCell(value: string): string {
  const needsQuotes = /["\n\r,]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

const IMAGE_URL = (file: string) => `/api/runtime/tech-report/image?f=${encodeURIComponent(file)}`;

// ── 양식의 낱개 조각들 ──────────────────────────────────────────────────────

/** 양식의 카드 — 제목 줄과 내용. */
function Card({ title, span, children, className }: { title: string; span: 6 | 12; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('tr-card', span === 6 ? 'tr-span-6' : 'tr-span-12', className)}>
      {title && <h4 className="tr-card-title">{title}</h4>}
      {children}
    </section>
  );
}

/** 목록에서 한 자리만 바꾼다 / 뺀다 — 그림 칸을 늘리고 줄이는 데 쓴다. */
function replaceAt(list: string[] | undefined, index: number, value: string): string[] {
  const next = [...(list ?? [])];
  next[index] = value;
  return next;
}
function removeAt(list: string[] | undefined, index: number): string[] {
  return (list ?? []).filter((_, i) => i !== index);
}

/**
 * 그림 칸을 하나 더 붙이는 자리(사용자 지정, 2026-08-31).
 *
 * 양식이 정한 칸 수로는 모자란 sample이 있다. 빈 칸을 미리 잔뜩 깔아 두면 대부분의 보고서에서
 * 빈 상자만 늘어서므로, **필요할 때 눌러 늘린다**. 그림 칸과 같은 크기로 두어 늘어선 자리에
 * 그대로 이어 붙는다.
 */
function AddImageButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="tr-card tr-span-6 flex min-h-[120px] flex-col items-center justify-center gap-1.5 border-dashed text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="size-5" />
      {label}
    </button>
  );
}

/**
 * 늘려 쓸 그림 칸의 이름들 — 양식이 정한 칸 **다음 번호**부터 이어 붙인다.
 *
 * 보여 줄 개수는 둘 중 큰 쪽이다: 이미 저장된 것 중 가장 큰 번호(다시 불러와도 그대로 보이게)와,
 * 이번에 눌러서 늘린 수. 저장된 것만 보면 방금 늘린 빈 칸이 사라지고, 늘린 수만 보면 불러온
 * 그림이 안 보인다.
 */
function extraKeys(prefix: 'dist' | 'meta', images: Record<string, string>, added: number): string[] {
  const base = prefix === 'dist' ? IMAGE_SLOTS.filter((s) => s.key.startsWith('dist')).length : META_SLOTS.length;
  const count = Math.max(added, Math.max(0, highestSlotNumber(images, prefix) - base));
  return Array.from({ length: count }, (_, i) => `${prefix}${base + i + 1}`);
}

/** 양식의 구분선 — 가운데 제목이 놓인 가로줄. */
function Divider({ label }: { label: string }) {
  return (
    <div className="tr-divider tr-span-12">
      <span />
      <span className="tr-divider-label">{label}</span>
      <span />
    </div>
  );
}

/**
 * 제품정보 — 초도 분석 앞에 놓이는 표(사용자 지정).
 *
 * 값은 전부 원장에서 오므로 **읽기 전용**이다. 여기서 고칠 수 있게 하면 보고서와 원장이
 * 서서히 어긋나고 나중에 어느 쪽이 맞는지 물을 곳이 없어진다(적층 정보와 같은 규칙).
 *
 * sample마다 한 줄을 둔다. 한 FAR 안에서도 Part ID는 sample마다 다르고 DRAM·Ctrl·NAND도
 * 갈리는 일이 있어, 한 줄로 접으면 어느 sample 것인지 모를 값 하나만 남는다.
 */
function ProductInfo({ samples }: { samples: TechReportSample[] }) {
  const rows = samples.filter((s) => PRODUCT_COLUMNS.some((c) => (s.product?.[c.col] ?? '') !== ''));
  return (
    <section className="tr-card tr-span-12">
      {/* tr-table-vertical은 쓰지 않는다 — 그쪽은 라벨|값 두 칸짜리라 th 폭을 40%로 못 박는다. */}
      <div className="tr-table-wrap">
        <table className="tr-table">
          <thead>
            <tr>
              <th>Sample</th>
              {PRODUCT_COLUMNS.map((c) => (
                <th key={c.col}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={PRODUCT_COLUMNS.length + 1} className="text-muted-foreground">
                  원장에 제품 정보가 아직 없습니다
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.sample_no}>
                  <td>{s.sample_no}</td>
                  {PRODUCT_COLUMNS.map((c) => (
                    <td key={c.col}>{s.product?.[c.col] || '—'}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * PKG Stack 표에서 끌어온 Stack 정보 — **표 다음에 그림** 순서로 보여 준다(사용자 지정).
 *
 * 사람이 올리는 칸이 아니라 **보여 주기만 하는 칸**이다. 고칠 곳은 PKG Stack 화면 하나뿐이라
 * 두 곳이 어긋날 일이 없다. 그래서 올리기·지우기 단추를 두지 않고, 어디서 온 값인지만 밝힌다.
 */
function StackFromDb({ label, stack }: { label: string; stack: SampleStack }) {
  return (
    <section className="tr-card tr-span-6">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="tr-card-title">{label}</h4>
        <span className="truncate text-[11px] text-muted-foreground" title={stack.part_id}>
          {stack.part_id}
        </span>
      </div>
      {stack.layers.length > 0 && (
        <table className="tr-table">
          <thead>
            <tr>
              <th>CH</th>
              <th>WAY</th>
              <th>Chip 차수</th>
            </tr>
          </thead>
          <tbody>
            {stack.layers.map((row, i) => (
              <tr key={i}>
                <td>{row.ch || '—'}</td>
                <td>{row.way || '—'}</td>
                <td>{row.chip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {stack.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={IMAGE_URL(stack.image)} alt={`${stack.part_id} 적층 구조`} className="tr-image" />
      ) : (
        <p className="text-[11px] text-muted-foreground">PKG Stack에 등록된 그림이 없습니다.</p>
      )}
    </section>
  );
}

/**
 * sample 탭 줄 — 탭이 많아 한 줄에 다 들어가지 않으면 **옆으로 넘겨** 본다(사용자 지정).
 *
 * 세 가지로 넘길 수 있다: 좌우 화살표, 마우스로 끌기, 그리고 원래부터 되던 휠·터치 스크롤.
 * 화살표만 두면 마우스를 쥔 채 여러 번 눌러야 하고, 끌기만 두면 있는 줄도 모른다.
 *
 * 도구 단추(SSR Copy·CSV)는 **넘겨도 제자리에 있다**(사용자 지정) — 넘기는 것은 탭이지
 * 그 줄 전체가 아니다. 그래서 스크롤되는 것은 가운데 띠뿐이고 단추는 그 바깥에 둔다.
 */
function SampleTabs({
  samples,
  active,
  disabled,
  onSelect,
  tools,
}: {
  samples: { sample_no: string }[];
  active: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  tools: React.ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ overflow: false, atStart: true, atEnd: true });
  /** 끌어서 움직인 뒤의 pointerup은 탭 선택으로 치지 않는다 — 끌다 멈춘 자리의 탭이 눌린다. */
  const draggedRef = useRef(false);
  const dragRef = useRef<{ x: number; left: number } | null>(null);

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // 1px 여유 — 소수점 폭 때문에 끝에 닿아도 미세하게 남는 경우가 있다.
    const overflow = el.scrollWidth - el.clientWidth > 1;
    setEdge({
      overflow,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    measure();
    // 탭 수가 바뀌거나 창 폭이 바뀌면 다시 잰다 — 넘길 수 있는지가 그때 달라진다.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, samples.length]);

  /** 고른 탭이 화면 밖이면 끌어온다 — 화살표로 넘기다 다른 탭을 골랐을 때. */
  useEffect(() => {
    stripRef.current?.children[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const nudge = (dir: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    // 한 번에 보이는 폭의 3분의 2씩 — 한 탭씩이면 답답하고, 한 화면씩이면 어디였는지 놓친다.
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.66), behavior: 'smooth' });
  };

  return (
    <div className="tr-tabbar">
      {edge.overflow && (
        <button type="button" className="tr-tab-nav" onClick={() => nudge(-1)} disabled={edge.atStart} aria-label="이전 sample 탭">
          <ChevronLeft className="size-4" />
        </button>
      )}

      <div
        ref={stripRef}
        className={cn('tr-tabstrip', dragRef.current && 'tr-tabstrip-dragging')}
        role="tablist"
        aria-label="Sample 탭"
        onScroll={measure}
        onPointerDown={(e) => {
          if (!edge.overflow || e.button !== 0) return;
          dragRef.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
          draggedRef.current = false;
        }}
        onPointerMove={(e) => {
          const start = dragRef.current;
          if (!start) return;
          const moved = e.clientX - start.x;
          // 몇 픽셀 흔들린 것은 누른 것이다 — 그 이상 움직여야 끌기로 본다.
          if (Math.abs(moved) > 4) draggedRef.current = true;
          e.currentTarget.scrollLeft = start.left - moved;
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          dragRef.current = null;
        }}
      >
        {samples.map((s, index) => (
          <button
            key={s.sample_no}
            type="button"
            role="tab"
            aria-selected={index === active}
            disabled={disabled}
            onClick={() => {
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              onSelect(index);
            }}
            className={cn('tr-tab', index === active && 'tr-tab-active')}
          >
            Sample {s.sample_no}
          </button>
        ))}
      </div>

      {edge.overflow && (
        <button type="button" className="tr-tab-nav" onClick={() => nudge(1)} disabled={edge.atEnd} aria-label="다음 sample 탭">
          <ChevronRight className="size-4" />
        </button>
      )}

      {tools && <span className="tr-tabbar-tools">{tools}</span>}
    </div>
  );
}

/** 그림 칸 — 없으면 놓는 자리를, 있으면 그림을 보여 준다. */
function ImageSlot({
  label,
  file,
  onPick,
  onClear,
  disabled,
}: {
  label: string;
  file: string;
  onPick: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  /** 붙여넣기 단추가 Ctrl+V를 기다리는 중 — 빈 칸의 안내 글이 그때 바뀐다. */
  const [waitingPaste, setWaitingPaste] = useState(false);

  return (
    <section className="tr-card tr-span-6">
      <div className="flex items-center justify-between gap-2">
        <h4 className="tr-card-title">{label}</h4>
        <div className="flex items-center gap-1">
          {!disabled && (
            <PasteImageButton label={`${label} 칸`} className="tr-icon-button" onPick={onPick} onWaitingChange={setWaitingPaste} />
          )}
          {file && !disabled && (
            <button type="button" className="tr-icon-button tr-icon-button--danger" onClick={onClear} aria-label={`${label} 지우기`}>
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {file ? (
        // 인쇄 때도 그대로 나가야 하므로 배경 이미지가 아니라 <img>로 둔다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={IMAGE_URL(file)} alt={label} className="tr-image" />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onPick(dropped);
          }}
          className={cn('tr-dropzone', (over || waitingPaste) && 'tr-dropzone-over', disabled && 'opacity-50')}
        >
          <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          {/* 빈 칸에서는 붙여넣기 길을 여기서도 알려 준다 — 위 단추는 작아서 눈에 늦게 띈다. */}
          <span className="text-xs text-muted-foreground">
            {waitingPaste ? 'Ctrl+V를 누르세요 (Esc로 취소)' : '그림을 끌어다 놓거나 눌러서 고르기'}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          e.target.value = '';
        }}
      />
    </section>
  );
}

/** 줄을 더하고 지울 수 있는 표. */
function EditableGrid({
  title,
  columns,
  rows,
  span,
  disabled,
  onChange,
}: {
  title: string;
  columns: readonly string[];
  rows: Record<string, string>[];
  span: 6 | 12;
  disabled: boolean;
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const setCell = (index: number, column: string, value: string) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [column]: value } : row));
    onChange(next);
  };
  return (
    <Card title={title} span={span}>
      <div className="tr-table-wrap">
        <table className="tr-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
              <th className="w-8" aria-label="줄 지우기" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((c) => (
                  <td key={c}>
                    <input
                      className="tr-cell-input"
                      value={row[c] ?? ''}
                      disabled={disabled}
                      onChange={(e) => setCell(index, c, e.target.value)}
                      aria-label={`${title} ${index + 1}행 ${c}`}
                    />
                  </td>
                ))}
                <td >
                  <button
                    type="button"
                    className="tr-icon-button tr-icon-button--danger"
                    disabled={disabled}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    aria-label={`${index + 1}행 지우기`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="tr-ghost-button"
        disabled={disabled}
        onClick={() => onChange([...rows, Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>])}
      >
        <Plus className="size-3.5" /> 줄 추가
      </button>
    </Card>
  );
}

// ── 화면 ────────────────────────────────────────────────────────────────────

export function TechReport({ title, description }: { title: string; description: string }) {
  const [farInput, setFarInput] = useState('');
  const [doc, setDoc] = useState<TechReportDoc | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ssrCopied, setSsrCopied] = useState(false);
  /** 이번에 눌러서 늘린 그림 칸 수 — 'sample자리:무리' 별로 센다. */
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({});

  const disabled = doc === null;

  /**
   * 주소에 FAR No가 실려 오면 **스스로 불러온다**(사용자 지정, 2026-08-31).
   *
   * FAR List에서 'Tech Report 작성'을 누르면 `?far_no=…`로 이 화면에 온다. 그렇게 와 놓고
   * 다시 번호를 적어 넣고 불러오기를 눌러야 한다면, 단추가 화면만 바꾼 셈이라 아무것도 줄여
   * 주지 못한다.
   *
   * 값이 바뀔 때만 부른다 — 같은 주소로 다시 그려질 때(저장 알림 등)마다 불러오면 사람이
   * 고치던 내용이 원장 값으로 되돌아간다. 그래서 '무엇을 이미 불러왔는지'를 따로 들고 본다.
   */
  const fromUrl = useSearchParams().get('far_no') ?? '';
  const loadedFromUrl = useRef('');
  useEffect(() => {
    const target = fromUrl.trim();
    if (target === '' || loadedFromUrl.current === target) return;
    loadedFromUrl.current = target;
    setFarInput(target);
    void load(target);
    // load는 렌더마다 새로 만들어지는 함수라 의존성에 넣지 않는다 — 넣으면 매 렌더마다 다시
    // 불러온다. 실제로 봐야 하는 것은 주소의 값 하나뿐이고, 그 값은 loadedFromUrl이 지킨다.
  }, [fromUrl]);

  /**
   * sample 전부의 Smart Report를 **한 표로** 편다 — 줄이 항목, 칸이 sample이다.
   *
   * 화면의 세로 표와 같은 방향이라 눈으로 옮겨 적던 것을 그대로 옮긴 셈이고, sample을 나란히
   * 놓아 서로 견주기도 쉽다.
   */
  function ssrTable(): { head: string[]; body: string[][] } {
    const samples = doc?.samples ?? [];
    return {
      head: ['항목', ...samples.map((s) => `Sample ${s.sample_no}`)],
      body: PERF_ROWS.map((row) => [row.label.toUpperCase(), ...samples.map((s) => s.perf?.[row.col] ?? '')]),
    };
  }

  /**
   * 클립보드에 두 벌을 담는다 — 글자(TSV)와 표(HTML).
   *
   * 글자만 담으면 메일 편집기에서 한 줄로 뭉개진다. HTML을 함께 담으면 아웃룩·지메일·워드가
   * 그쪽을 골라 진짜 표로 붙인다(Reball 의뢰 표의 '표 복사'와 같은 방식).
   */
  async function copySsr() {
    const { head, body } = ssrTable();
    const cell = (v: string) => `<td style="border:1px solid #d4d4d8;padding:4px 8px;font-size:12px">${escapeHtml(v)}</td>`;
    const html =
      `<p style="font-family:sans-serif;font-size:12px;margin:0 0 6px">${escapeHtml(doc?.far_no ?? '')} Smart Report</p>` +
      `<table style="border-collapse:collapse;font-family:sans-serif"><thead><tr>${head
        .map((h) => `<th style="border:1px solid #d4d4d8;padding:4px 8px;background:#f4f4f5;text-align:left;font-size:12px">${escapeHtml(h)}</th>`)
        .join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
    const text = [`${doc?.far_no ?? ''} Smart Report`, head.join('\t'), ...body.map((r) => r.join('\t'))].join('\n');

    try {
      if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setSsrCopied(true);
      setTimeout(() => setSsrCopied(false), 1600);
    } catch {
      toast.error('클립보드에 담지 못했습니다.');
    }
  }

  function downloadSsrCsv() {
    const { head, body } = ssrTable();
    const csv = [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
    // 엑셀은 BOM이 없으면 UTF-8을 시스템 코드페이지로 읽어 한글이 깨진다.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc?.far_no ?? 'tech-report'} Smart Report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  /** 불러오기 직후에는 저장하지 않는다 — 방금 읽은 것을 그대로 되쓸 이유가 없다. */
  const skipNextSave = useRef(true);

  async function load(farNo: string) {
    const target = farNo.trim();
    if (!target) {
      toast.error('FAR No를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/runtime/tech-report?far_no=${encodeURIComponent(target)}`);
      const result = (await res.json()) as ApiResult<TechReportDoc>;
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      skipNextSave.current = true;
      setDoc(result.data);
      setActive(0);
      setSavedAt(result.data.updated_at ?? null);
      toast.success(`${result.data.far_no} · sample ${result.data.samples.length}`);
    } catch {
      toast.error('불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // 값이 바뀌면 잠시 뒤 저장한다. 타자를 치는 동안에는 보내지 않는다.
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => {
    if (!doc) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      const current = docRef.current;
      if (!current) return;
      setSaving(true);
      try {
        const res = await fetch('/api/runtime/tech-report', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(current),
        });
        const result = (await res.json()) as ApiResult<{ updated_at: string }>;
        if (result.ok) setSavedAt(result.data.updated_at);
        else toast.error(result.error.message);
      } catch {
        toast.error('저장하지 못했습니다.');
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc]);

  const patchSample = useCallback((index: number, patch: Partial<TechReportSample>) => {
    setDoc((prev) =>
      prev ? { ...prev, samples: prev.samples.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : prev
    );
  }, []);

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

  /**
   * PDF로 발행한다 — **서버가 그린 파일을 그대로 내려받는다**.
   *
   * 브라우저 인쇄로 내던 것을 바꾼 이유(사용자 요구): 인쇄는 받는 사람의 테마·글꼴·확대율·인쇄
   * 설정을 타서 사람마다 다른 문서가 나오고, 인쇄 창을 한 번 더 거쳐야 한다. 서버가 한 번 그려
   * 주면 누가 받아도 같은 문서이고 누르는 즉시 파일이 떨어진다. 모양은 서버의
   * tech-report-html.ts 한 곳에서만 정해진다.
   *
   * 주소로 바로 이동하지 않고 fetch로 받는 이유: 실패했을 때 화면에 이유를 말해 줄 수 있어야
   * 한다(주소로 열면 JSON 오류가 새 탭에 그대로 뜬다).
   */
  async function exportPdf() {
    if (!doc || exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/runtime/tech-report/pdf?far_no=${encodeURIComponent(doc.far_no)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiResult<never> | null;
        toast.error(body && !body.ok ? body.error.message : 'PDF를 만들지 못했습니다.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${doc.far_no} Tech Report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('PDF를 내려받았습니다');
    } catch {
      toast.error('PDF를 내려받지 못했습니다.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="tech-report flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      {(title || description) && (
        <div className="shrink-0">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

      {/* ① Tech Report — FAR No 입력과 불러오기 */}
      <Card title="Tech Report" span={12}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="tr-input-wrap min-w-0 flex-1">
            <FileSearch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              className="tr-input"
              placeholder="FAR No."
              value={farInput}
              onChange={(e) => setFarInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load(farInput);
              }}
              aria-label="FAR No."
            />
          </label>
          <button type="button" className="tr-primary-button" disabled={loading} onClick={() => void load(farInput)}>
            {loading ? '불러오는 중…' : '불러오기'}
            <MoveUpRight className="size-3" aria-hidden />
          </button>
          {doc && (
            <span className="text-xs text-muted-foreground">
              {doc.far_no} · {saving ? '저장 중…' : savedAt ? `저장됨 ${savedAt.replace('T', ' ').slice(0, 16)}` : '아직 저장 전'}
            </span>
          )}
        </div>
      </Card>

      {/* ② 종합 분석 의견 */}
      <Card title="종합 분석 의견" span={12}>
        <textarea
          className="tr-textarea"
          style={{ height: 128 }}
          value={doc?.overall_opinion ?? ''}
          disabled={disabled}
          onChange={(e) => setDoc((prev) => (prev ? { ...prev, overall_opinion: e.target.value } : prev))}
        />
      </Card>

      {/* ③ Visual Inspection */}
      <Divider label="Visual Inspection" />
      <ImageSlot
        label="상단부 사진"
        file={doc?.visual_top ?? ''}
        disabled={disabled}
        onPick={async (file) => {
          const stored = await upload(file);
          if (stored) setDoc((prev) => (prev ? { ...prev, visual_top: stored } : prev));
        }}
        onClear={() => setDoc((prev) => (prev ? { ...prev, visual_top: '' } : prev))}
      />
      <ImageSlot
        label="하단부 사진"
        file={doc?.visual_bottom ?? ''}
        disabled={disabled}
        onPick={async (file) => {
          const stored = await upload(file);
          if (stored) setDoc((prev) => (prev ? { ...prev, visual_bottom: stored } : prev));
        }}
        onClear={() => setDoc((prev) => (prev ? { ...prev, visual_bottom: '' } : prev))}
      />
      {/*
        상·하단부 말고 더 붙이는 그림(사용자 지정). 두 장은 뜻이 정해진 자리라 그대로 두고,
        그 밖의 장수는 정해지지 않아 목록으로 늘린다.
      */}
      {(doc?.visual_extra ?? []).map((file, i) => (
        <ImageSlot
          key={`visual-extra-${i}`}
          label={`추가 사진 ${i + 1}`}
          file={file}
          disabled={disabled}
          onPick={async (picked) => {
            const stored = await upload(picked);
            if (stored) setDoc((prev) => (prev ? { ...prev, visual_extra: replaceAt(prev.visual_extra, i, stored) } : prev));
          }}
          // 지우면 칸까지 걷어낸다 — 빈 칸이 줄줄이 남으면 다시 접을 방법이 없다.
          onClear={() => setDoc((prev) => (prev ? { ...prev, visual_extra: removeAt(prev.visual_extra, i) } : prev))}
        />
      ))}
      <AddImageButton
        label="사진 추가"
        disabled={disabled}
        onClick={() => setDoc((prev) => (prev ? { ...prev, visual_extra: [...(prev.visual_extra ?? []), ''] } : prev))}
      />

      {/* ④ 제품정보 — 원장에서 읽어 오는 표(고칠 수 없다) */}
      <Divider label="제품정보" />
      <ProductInfo samples={doc?.samples ?? []} />

      {/* ⑤ 초도 분석 — sample 탭 */}
      <Divider label="초도 분석" />
      <div className="tr-span-12 flex flex-col gap-3">
        <SampleTabs
          samples={doc?.samples ?? [{ sample_no: '1' }, { sample_no: '2' }, { sample_no: '3' }]}
          active={active}
          disabled={disabled}
          onSelect={setActive}
          tools={
            /*
              sample 전부의 Smart Report 값을 한 번에 꺼내는 자리(사용자 지정). 탭마다 표를 열어
              손으로 옮겨 적을 이유가 없다. 붙여넣기와 파일 둘 다 둔다: 메일·문서에는 붙여넣기가,
              다시 계산해 볼 때는 CSV가 편하다.
            */
            doc ? (
              <>
                <button type="button" className="tr-tool-button" onClick={() => void copySsr()} title="모든 sample의 Smart Report를 클립보드로">
                  {ssrCopied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                  {ssrCopied ? '복사됨' : 'SSR Copy'}
                </button>
                <button type="button" className="tr-tool-button" onClick={downloadSsrCsv} title="모든 sample의 Smart Report를 CSV 파일로">
                  <FileDown className="size-3.5" />
                  CSV
                </button>
              </>
            ) : null
          }
        />

        {(doc?.samples ?? []).map((s, index) => (
          <div key={s.sample_no} hidden={index !== active} className="tech-report-tabpanel" role="tabpanel">
            <div className="tr-grid">
              {/* Smart Report — 라벨 | 값 세로 표. 칸 이름은 대문자·가운데(사용자 지정). */}
              <Card title="Smart Report" span={12}>
                <div className="tr-table-wrap">
                  <table className="tr-table tr-table-vertical">
                    <tbody>
                      {PERF_ROWS.map((row) => (
                        <tr key={row.col}>
                          <th>{row.label}</th>
                          <td>
                            <input
                              className={cn('tr-cell-input', s.prefilled?.includes(row.col) && 'tr-cell-prefilled')}
                              value={s.perf[row.col] ?? ''}
                              disabled={disabled}
                              onChange={(e) =>
                                patchSample(index, {
                                  perf: { ...s.perf, [row.col]: e.target.value },
                                  prefilled: (s.prefilled ?? []).filter((c) => c !== row.col),
                                })
                              }
                              aria-label={row.label}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Divider label="rtbb information" />

              <Card title="NAND 분석 의견" span={6}>
                <textarea
                  className="tr-textarea"
                  style={{ height: 220 }}
                  value={s.nand_opinion}
                  disabled={disabled}
                  onChange={(e) => patchSample(index, { nand_opinion: e.target.value })}
                />
              </Card>

              <EditableGrid
                title="RTBB List"
                columns={RTBB_COLUMNS}
                rows={s.rtbb_list}
                span={6}
                disabled={disabled}
                onChange={(rows) => patchSample(index, { rtbb_list: rows })}
              />

              <EditableGrid
                title="NAND Lot ID"
                columns={NAND_LOT_COLUMNS}
                rows={s.nand_lot_list}
                span={12}
                disabled={disabled}
                onChange={(rows) => patchSample(index, { nand_lot_list: rows })}
              />

              {IMAGE_SLOTS.map((slot) =>
                // Stack 정보 칸은 Part ID로 찾은 적층 정보가 있으면 **그것을 그대로 보여 준다** —
                // 같은 내용을 PKG Stack 화면에 이미 적어 두는데 보고서마다 다시 올릴 이유가 없다.
                // 맞는 Part ID가 없으면 지금까지처럼 사람이 올리는 칸이 나온다.
                slot.key === 'stack' && s.stack ? (
                  <StackFromDb key={slot.key} label={slot.label} stack={s.stack} />
                ) : (
                  <ImageSlot
                    key={slot.key}
                    label={slot.label}
                    file={s.images[slot.key] ?? ''}
                    disabled={disabled}
                    onPick={async (file) => {
                      const stored = await upload(file);
                      if (stored) patchSample(index, { images: { ...s.images, [slot.key]: stored } });
                    }}
                    onClear={() => patchSample(index, { images: { ...s.images, [slot.key]: '' } })}
                  />
                )
              )}
              {/* 양식의 산포 넷으로 모자랄 때 더 붙인다(사용자 지정) — dist5, dist6 … */}
              {extraKeys('dist', s.images, extraSlots[`${index}:dist`] ?? 0).map((key, i) => (
                <ImageSlot
                  key={key}
                  label={`산포 ${IMAGE_SLOTS.filter((x) => x.key.startsWith('dist')).length + i + 1}`}
                  file={s.images[key] ?? ''}
                  disabled={disabled}
                  onPick={async (file) => {
                    const stored = await upload(file);
                    if (stored) patchSample(index, { images: { ...s.images, [key]: stored } });
                  }}
                  onClear={() => patchSample(index, { images: { ...s.images, [key]: '' } })}
                />
              ))}
              <AddImageButton
                label="산포 추가"
                disabled={disabled}
                onClick={() => setExtraSlots((prev) => ({ ...prev, [`${index}:dist`]: (prev[`${index}:dist`] ?? 0) + 1 }))}
              />

              <Divider label="FW 분석 내용" />

              <Card title="FW 분석 의견" span={6}>
                <textarea
                  className="tr-textarea"
                  style={{ height: 220 }}
                  value={s.fw_opinion}
                  disabled={disabled}
                  onChange={(e) => patchSample(index, { fw_opinion: e.target.value })}
                />
              </Card>

              {META_SLOTS.map((slot) => (
                <ImageSlot
                  key={slot.key}
                  label={slot.label}
                  file={s.images[slot.key] ?? ''}
                  disabled={disabled}
                  onPick={async (file) => {
                    const stored = await upload(file);
                    if (stored) patchSample(index, { images: { ...s.images, [slot.key]: stored } });
                  }}
                  onClear={() => patchSample(index, { images: { ...s.images, [slot.key]: '' } })}
                />
              ))}
              {/* Meta 셋으로 모자랄 때 더 붙인다(사용자 지정) — meta4, meta5 … */}
              {extraKeys('meta', s.images, extraSlots[`${index}:meta`] ?? 0).map((key, i) => (
                <ImageSlot
                  key={key}
                  label={`Meta ${META_SLOTS.length + i + 1}`}
                  file={s.images[key] ?? ''}
                  disabled={disabled}
                  onPick={async (file) => {
                    const stored = await upload(file);
                    if (stored) patchSample(index, { images: { ...s.images, [key]: stored } });
                  }}
                  onClear={() => patchSample(index, { images: { ...s.images, [key]: '' } })}
                />
              ))}
              <AddImageButton
                label="Meta 추가"
                disabled={disabled}
                onClick={() => setExtraSlots((prev) => ({ ...prev, [`${index}:meta`]: (prev[`${index}:meta`] ?? 0) + 1 }))}
              />
            </div>
          </div>
        ))}

      </div>

      {/* ⑤ 내보내기 */}
      <Card title="tech report export" span={12} >
        <button
          type="button"
          className="tr-primary-button w-full justify-center"
          disabled={disabled || exporting}
          onClick={() => void exportPdf()}
        >
          <FileDown className="size-4" aria-hidden /> {exporting ? 'PDF 만드는 중…' : 'export to pdf'}
        </button>
      </Card>
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기 — 편집 중에 조회·저장이 나가지 않게 한다. */
export function TechReportPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="rounded-lg border p-3 text-sm font-medium">Tech Report · FAR No 불러오기</div>
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">종합 분석 의견</div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border p-3 text-xs text-muted-foreground">Sample 1</div>
        <div className="flex-1 rounded-lg border p-3 text-xs text-muted-foreground">Sample 2</div>
        <div className="flex-1 rounded-lg border p-3 text-xs text-muted-foreground">Sample 3</div>
      </div>
    </div>
  );
}
