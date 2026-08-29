'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardPaste, FileDown, FileSearch, ImagePlus, MoveUpRight, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  IMAGE_SLOTS,
  META_SLOTS,
  NAND_LOT_COLUMNS,
  PERF_ROWS,
  RTBB_COLUMNS,
  type TechReportDoc,
  type TechReportSample,
} from '@/lib/far/tech-report-fields';
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
 * 클립보드를 직접 읽어 그림을 꺼낸다.
 *
 * `supported: false`는 **읽을 수 없는 브라우저**라는 뜻이고, `supported: true, file: null`은
 * 읽었는데 그림이 없었다는 뜻이다. 둘을 나누는 이유: 앞은 다른 길(Ctrl+V)로 넘어가야 하고,
 * 뒤는 기다려도 달라지지 않아 그 자리에서 알려 줘야 한다.
 */
type ClipboardRead = { supported: false } | { supported: true; file: File | null };

async function imageFromClipboard(): Promise<ClipboardRead> {
  // read()는 안전한 문맥(https·localhost)에서만 있고 브라우저가 물어본 뒤에야 준다.
  // 타입 정의상으로는 늘 있는 것으로 되어 있어 런타임 값으로 확인한다.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const read = clipboard?.read as Clipboard['read'] | undefined;
  if (typeof read !== 'function') return { supported: false };

  const items = await read.call(clipboard!);
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    return { supported: true, file: new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type }) };
  }
  return { supported: true, file: null };
}

/** paste 이벤트에 실려 온 그림 — 위 방법이 막혔을 때 쓰는 길. */
function imageFromPasteEvent(event: ClipboardEvent): File | null {
  const files = Array.from(event.clipboardData?.files ?? []);
  const picked = files.find((f) => f.type.startsWith('image/'));
  if (picked) return picked;
  const items = Array.from(event.clipboardData?.items ?? []);
  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
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
  /** Ctrl+V를 기다리는 중 — 클립보드를 직접 읽지 못하는 브라우저에서만 켜진다. */
  const [waitingPaste, setWaitingPaste] = useState(false);

  /**
   * 클립보드의 그림을 **이 칸에** 붙인다.
   *
   * 그냥 Ctrl+V로 두지 않은 이유(사용자 지정): 그림 칸이 한 화면에 아홉 개라 어디에 붙을지가
   * 눌러 보기 전에는 알 수 없다. 칸마다 단추를 두면 "이 칸에 붙는다"가 눈으로 정해진다.
   *
   * 먼저 클립보드를 직접 읽어 본다. 브라우저가 그 권한을 주지 않거나 아예 그 기능이 없으면
   * (파이어폭스 계열) **이 칸을 붙여넣기 대상으로 잡아 두고** 다음 Ctrl+V 한 번만 받는다 —
   * 그래도 "어디에 붙는지"는 여전히 정해져 있다.
   */
  const pasteHere = useCallback(async () => {
    try {
      const result = await imageFromClipboard();
      if (result.supported) {
        if (result.file) onPick(result.file);
        else toast.error('클립보드에 그림이 없습니다.');
        return;
      }
    } catch {
      // 권한을 거절했거나 읽다 실패했다 — 아래 Ctrl+V 대기로 넘어간다.
    }
    setWaitingPaste(true);
    toast.info(`${label} 칸에 붙여넣습니다 — Ctrl+V를 누르세요.`);
  }, [label, onPick]);

  useEffect(() => {
    if (!waitingPaste) return;
    const onPaste = (event: ClipboardEvent) => {
      const picked = imageFromPasteEvent(event);
      setWaitingPaste(false);
      if (!picked) {
        toast.error('붙여넣은 것에 그림이 없습니다.');
        return;
      }
      event.preventDefault();
      onPick(picked);
    };
    // 한 번 받고 스스로 내려간다 — 켜 둔 채로 두면 다른 칸에 붙이려 할 때 이 칸이 가로챈다.
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWaitingPaste(false);
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', cancel);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', cancel);
    };
  }, [waitingPaste, onPick]);

  return (
    <section className="tr-card tr-span-6">
      <div className="flex items-center justify-between gap-2">
        <h4 className="tr-card-title">{label}</h4>
        <div className="flex items-center gap-1">
          {!disabled && (
            <button
              type="button"
              className="tr-icon-button"
              onClick={() => void pasteHere()}
              aria-label={`${label}에 클립보드 그림 붙여넣기`}
              title="클립보드의 그림을 이 칸에 붙여넣기"
            >
              <ClipboardPaste className="size-3.5" />
            </button>
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

  const disabled = doc === null;
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

      {/* ④ Secure Smart report — sample 탭 */}
      <Divider label="Secure Smart report" />
      <div className="tr-span-12 flex flex-col gap-3">
        <div className="tr-tablist" role="tablist" aria-label="Sample 탭">
          {(doc?.samples ?? [{ sample_no: '1' }, { sample_no: '2' }, { sample_no: '3' }]).map((s, index) => (
            <button
              key={s.sample_no}
              type="button"
              role="tab"
              aria-selected={index === active}
              disabled={disabled}
              onClick={() => setActive(index)}
              className={cn('tr-tab', index === active && 'tr-tab-active')}
            >
              Sample {s.sample_no}
            </button>
          ))}
        </div>

        {(doc?.samples ?? []).map((s, index) => (
          <div key={s.sample_no} hidden={index !== active} className="tech-report-tabpanel" role="tabpanel">
            <div className="tr-grid">
              {/* Performance table — 라벨 | 값 세로 표 */}
              <Card title="Performance table" span={12}>
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

              {IMAGE_SLOTS.map((slot) => (
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
