'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSearch, ImagePlus, MoveUpRight, Plus, Printer, Trash2, X } from 'lucide-react';
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

/** 그림 칸 — 없으면 놓는 자리를, 있으면 그림을 보여 준다. */
function ImageSlot({
  label,
  file,
  hint,
  onPick,
  onClear,
  disabled,
}: {
  label: string;
  file: string;
  hint?: string;
  onPick: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <section className="tr-card tr-span-6">
      <div className="flex items-center justify-between gap-2">
        <h4 className="tr-card-title">{label}</h4>
        {file && !disabled && (
          <button type="button" className="tr-icon-button tech-report-noprint" onClick={onClear} aria-label={`${label} 지우기`}>
            <X className="size-3.5" />
          </button>
        )}
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
          className={cn('tr-dropzone', over && 'tr-dropzone-over', disabled && 'opacity-50')}
        >
          <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-xs text-muted-foreground">{disabled ? 'FAR No를 먼저 불러오세요' : '이미지를 끌어다 놓거나 눌러서 고르세요'}</span>
          {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
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
              <th className="tech-report-noprint w-8" aria-label="줄 지우기" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="tr-empty">
                  줄이 없습니다 — 아래 &lsquo;줄 추가&rsquo;로 채웁니다
                </td>
              </tr>
            )}
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
                <td className="tech-report-noprint">
                  <button
                    type="button"
                    className="tr-icon-button"
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
        className="tr-ghost-button tech-report-noprint"
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
  /** 인쇄하는 동안만 참 — 이때는 모든 sample 탭을 펼쳐 둔다(exportPdf 주석 참고). */
  const [printing, setPrinting] = useState(false);

  const disabled = doc === null;
  const rootRef = useRef<HTMLDivElement>(null);
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
      const filled = result.data.samples.reduce((n, s) => n + (s.prefilled?.length ?? 0), 0);
      toast.success(
        result.data.saved
          ? `저장된 Tech Report를 불러왔습니다 — sample ${result.data.samples.length}개`
          : `FAR 원장에서 ${filled}개 칸을 채웠습니다 — sample ${result.data.samples.length}개`
      );
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
   * PDF로 발행한다 — 브라우저의 인쇄 기능으로 낸다(대상에서 'PDF로 저장'을 고른다).
   *
   * 별도의 PDF 라이브러리를 들이지 않은 이유: 이 저장소는 쓰는 라이브러리를 정해 두고 새로
   * 더할 때는 먼저 상의하도록 되어 있다(CLAUDE.md §2). 인쇄 경로는 의존성 없이 어느 브라우저에서나
   * 같은 결과를 낸다.
   *
   * **지금 보고 있지 않은 sample 탭도 함께 나가야 한다.** 그런데 그 탭들은 `hidden` 속성으로
   * 감춰져 있고, Tailwind가 깔아 두는 기본 규칙이 `@layer base`에서 `[hidden] { display: none
   * !important }`를 건다 — 중요 선언끼리는 **레이어 안이 레이어 밖을 이긴다**. 그래서 인쇄용 CSS로
   * 되살리는 것은 애초에 불가능하다(실측으로 확인했다). 대신 인쇄하는 동안만 `hidden`을 떼고
   * 다시 그린 뒤에 인쇄 창을 연다.
   */
  function exportPdf() {
    if (doc) setPrinting(true);
  }

  useEffect(() => {
    if (!printing) return;
    const html = document.documentElement;
    const previousTitle = document.title;
    html.classList.add('tech-report-printing');
    // 인쇄물의 파일 이름 기본값이 문서 제목이다 — FAR No가 들어가면 찾기 쉽다.
    document.title = `Tech Report ${docRef.current?.far_no ?? ''}`;

    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      html.classList.remove('tech-report-printing');
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
      setPrinting(false);
    };
    window.addEventListener('afterprint', restore);
    // 모든 탭이 펼쳐진 화면이 실제로 그려진 다음에 인쇄 창을 연다.
    const frame = requestAnimationFrame(() => {
      window.print();
      // afterprint를 내지 않는 브라우저가 있어 안전망을 둔다.
      setTimeout(restore, 1000);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', restore);
    };
  }, [printing]);

  return (
    <div ref={rootRef} className="tech-report tech-report-print-root flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
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
          <button type="button" className="tr-primary-button tech-report-noprint" disabled={loading} onClick={() => void load(farInput)}>
            {loading ? '불러오는 중…' : '불러오기'}
            <MoveUpRight className="size-3" aria-hidden />
          </button>
          {doc && (
            <span className="text-xs text-muted-foreground">
              {doc.far_no} · {saving ? '저장 중…' : savedAt ? `저장됨 ${savedAt.replace('T', ' ').slice(0, 16)}` : '아직 저장 전'}
            </span>
          )}
        </div>
        {!doc && (
          <p className="text-xs text-muted-foreground">
            FAR No를 넣고 불러오면 원장의 분석값이 sample 탭에 자동으로 채워집니다. 이미 작성한 보고서가 있으면 그 내용이 그대로 열립니다.
          </p>
        )}
      </Card>

      {/* ② 종합 분석 의견 */}
      <Card title="종합 분석 의견" span={12}>
        <textarea
          className="tr-textarea"
          style={{ height: 128 }}
          value={doc?.overall_opinion ?? ''}
          disabled={disabled}
          placeholder={disabled ? 'FAR No를 먼저 불러오세요' : '종합 분석 의견을 적습니다'}
          onChange={(e) => setDoc((prev) => (prev ? { ...prev, overall_opinion: e.target.value } : prev))}
        />
      </Card>

      {/* ③ Visual Inspection */}
      <Divider label="Visual Inspection" />
      <ImageSlot
        label="상단부 사진"
        file={doc?.visual_top ?? ''}
        hint={doc?.visual_top_path || undefined}
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
        hint={doc?.visual_bottom_path || undefined}
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
        <div className="tr-tablist tech-report-noprint" role="tablist" aria-label="Sample 탭">
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
          <div key={s.sample_no} hidden={!printing && index !== active} className="tech-report-tabpanel" role="tabpanel">
            {/* 인쇄할 때는 모든 탭이 펼쳐지므로 어느 sample인지 밝혀 둔다. */}
            <div className="tr-print-only tr-print-sample-title">Sample {s.sample_no}</div>
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
                <p className="tr-note tech-report-noprint">
                  옅게 표시된 칸은 FAR 원장에서 자동으로 채운 값입니다 — 고치면 고친 값이 저장됩니다.
                </p>
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

        {!doc && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            FAR No를 불러오면 sample별 탭이 여기에 나타납니다.
          </p>
        )}
      </div>

      {/* ⑤ 내보내기 */}
      <Card title="tech report export" span={12} className="tech-report-noprint">
        <button type="button" className="tr-primary-button w-full justify-center" disabled={disabled} onClick={exportPdf}>
          <Printer className="size-4" aria-hidden /> export to pdf
        </button>
        <p className="tr-note">
          브라우저 인쇄 창에서 대상을 &lsquo;PDF로 저장&rsquo;으로 고르면 파일로 발행됩니다. 지금 보고 있지 않은 sample 탭도 함께 나갑니다.
        </p>
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
      <p className="text-xs text-muted-foreground">운영 화면에서 FAR No를 불러오면 원장 값이 자동으로 채워집니다.</p>
    </div>
  );
}
