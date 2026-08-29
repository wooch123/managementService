'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, ClipboardCopy, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BALL_THRESHOLD, perSampleCost, type CostRow } from '@/components/runtime/ReballCost';

/**
 * Reball 의뢰서 — **표 한 장에 여러 줄을 적고 한 번에 등록한다**(사용자 지정).
 *
 * 예전에는 한 건씩 폼을 채워 등록했다. 실제 의뢰는 한 번에 서너 건이 함께 나가는데, 그때마다
 * 같은 반출 번호·담당자·일정을 다시 적어야 했다. 표로 두면 위 줄을 복제해 다른 곳만 고치면 된다.
 *
 * 금액 칸은 **적는 곳이 아니라 나오는 곳**이다 — 고른 작업과 Ball 수, 시료 수에서 단가표를 따라
 * 그 자리에서 계산된다. 사람이 적을 수 있게 두면 단가표와 어긋난 숫자가 그대로 남는다.
 *
 * 등록은 줄마다 **기존 등록 액션을 한 번씩** 실행한다. 표 전용 저장 경로를 새로 파지 않은 이유:
 * 어떤 칸이 어느 컬럼으로 가는지는 설계(배포된 스펙)가 갖고 있어야 하고, 그 매핑을 클라이언트가
 * 다시 적으면 두 곳이 어긋난다. 여기서는 줄 하나를 값으로 넘길 뿐이다.
 */

export type ReballRow = {
  far_no: string;
  urgent: boolean;
  export_no: string;
  pjt: string;
  name: string;
  date: string;
  over_200ball: boolean;
  is_reball: boolean;
  is_component_detach: boolean;
  is_underfill: boolean;
  is_grinding: boolean;
  count: number;
};

const emptyRow = (): ReballRow => ({
  far_no: '',
  urgent: false,
  export_no: '',
  pjt: '',
  name: '',
  date: '',
  over_200ball: false,
  // 대부분의 의뢰가 Reball이라 처음부터 켜 둔다.
  is_reball: true,
  is_component_detach: false,
  is_underfill: false,
  is_grinding: false,
  count: 1,
});

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 표의 칸 순서 — 사용자가 지정한 그대로다. */
const CHECK_COLUMNS = [
  { key: 'is_reball', label: 'Reball' },
  { key: 'is_component_detach', label: 'Component detach' },
  { key: 'is_underfill', label: 'Underfill' },
  { key: 'is_grinding', label: 'Grinding' },
] as const;

const HEADERS = [
  'FAR No',
  '긴급',
  '반출번호',
  'PJT',
  '담당자',
  '날짜',
  `Ball 수(${BALL_THRESHOLD}↑)`,
  ...CHECK_COLUMNS.map((c) => c.label),
  '시료 수',
  '금액',
  '총금액',
] as const;

/**
 * 금액·총금액·지우기는 **오른쪽 끝에 붙여 둔다**.
 *
 * 칸이 열넷이라 어떤 폭에서도 표는 가로로 움직인다. 그런데 금액은 이 표에서 사람이 확인하려고
 * 보는 값이라, 옆으로 밀려 사라지면 표를 오른쪽 끝까지 끌고 가야 보인다. 붙여 두면 어느 칸을
 * 고치든 계산 결과가 늘 눈에 있다. 붙이려면 폭이 정해져 있어야 해서 픽셀로 잡는다.
 */
const STICKY = { del: 40, total: 116, per: 100 };
const stickyCell = 'sticky z-[1] bg-card';

const inputClass =
  'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Cell({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={cn('border-b p-1 align-middle', className)} style={style}>
      {children}
    </td>
  );
}

export function ReballRequestTable({
  title,
  description,
  cost,
  disabled,
  onSubmitRow,
}: {
  title: string;
  description: string;
  cost: CostRow;
  disabled: boolean;
  /** 줄 하나를 등록한다(계산된 금액까지 함께) — 성공 여부를 돌려준다. */
  onSubmitRow: (row: ReballRow & { per_cost: number; total_cost: number }) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<ReballRow[]>([emptyRow()]);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  /** 줄마다 시료당 금액과 총금액 — 표에 그대로 나가고 복사에도 같은 값이 실린다. */
  const priced = useMemo(
    () =>
      rows.map((row) => {
        const per = perSampleCost(row, cost);
        return { row, per, total: per * (row.count || 0) };
      }),
    [rows, cost]
  );
  const grandTotal = priced.reduce((sum, p) => sum + p.total, 0);

  const patch = (index: number, part: Partial<ReballRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...part } : r)));

  const addRow = () =>
    setRows((prev) => {
      // 새 줄은 **마지막 줄을 본떠** 만든다 — 반출 번호·담당자·일정은 대개 그대로다.
      const last = prev[prev.length - 1];
      return [...prev, last ? { ...last, far_no: '' } : emptyRow()];
    });

  const cells = (p: (typeof priced)[number]): string[] => [
    p.row.far_no,
    p.row.urgent ? 'Y' : 'N',
    p.row.export_no,
    p.row.pjt,
    p.row.name,
    p.row.date,
    p.row.over_200ball ? `${BALL_THRESHOLD} 이상` : `${BALL_THRESHOLD} 미만`,
    ...CHECK_COLUMNS.map((c) => (p.row[c.key] ? 'Y' : 'N')),
    String(p.row.count),
    won(p.per),
    won(p.total),
  ];

  /**
   * 표를 클립보드에 담는다 — **메일 본문에 그대로 붙일 수 있게** 한다(사용자 지정).
   *
   * 글자(TSV)만 담으면 메일 편집기에서 한 줄로 뭉개진다. `text/html`을 함께 담으면 아웃룩·지메일·
   * 워드가 그쪽을 골라 진짜 표로 붙인다. 받는 쪽이 HTML을 못 읽으면 글자 쪽으로 자연스럽게 내려간다.
   * 그래서 두 벌을 한 번에 넣는다.
   */
  const copyTable = async () => {
    const head = HEADERS.map((h) => `<th style="border:1px solid #d4d4d8;padding:4px 8px;background:#f4f4f5;text-align:left;font-size:12px">${h}</th>`).join('');
    const body = priced
      .map(
        (p) =>
          `<tr>${cells(p)
            .map((v) => `<td style="border:1px solid #d4d4d8;padding:4px 8px;font-size:12px">${v}</td>`)
            .join('')}</tr>`
      )
      .join('');
    const foot = `<tr><td colspan="${HEADERS.length - 1}" style="border:1px solid #d4d4d8;padding:4px 8px;text-align:right;font-size:12px;font-weight:bold">총금액</td><td style="border:1px solid #d4d4d8;padding:4px 8px;font-size:12px;font-weight:bold">${won(grandTotal)}</td></tr>`;
    const html = `<table style="border-collapse:collapse;font-family:sans-serif"><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>`;
    const text = [HEADERS.join('\t'), ...priced.map((p) => cells(p).join('\t')), `총금액\t${won(grandTotal)}`].join('\n');

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('클립보드에 담지 못했습니다.');
    }
  };

  const submitAll = async () => {
    // FAR No가 비어 있는 줄은 아직 적는 중인 줄이다 — 건너뛴다.
    const ready = priced.filter((p) => p.row.far_no.trim() !== '');
    if (ready.length === 0) {
      toast.error('FAR No를 적은 줄이 없습니다.');
      return;
    }
    setSending(true);
    let done = 0;
    // 한 줄씩 차례로 보낸다 — 한꺼번에 던지면 어디서 멈췄는지 알 수 없다.
    for (const p of ready) {
      // 금액은 화면에 보이는 그 값을 그대로 보낸다 — 서버가 다시 계산하지 않으므로
      // 사람이 확인하고 등록한 숫자와 남는 숫자가 언제나 같다.
      const ok = await onSubmitRow({ ...p.row, per_cost: p.per, total_cost: p.total });
      if (!ok) break;
      done += 1;
    }
    setSending(false);
    if (done === ready.length) {
      toast.success(`${done}건을 등록했습니다.`);
      setRows([emptyRow()]);
      return;
    }
    toast.error(`${done}건까지 등록하고 멈췄습니다. 남은 줄은 표에 그대로 있습니다.`);
    // 이미 들어간 줄만 덜어 낸다 — 다시 누르면 남은 것부터 이어서 간다.
    const sent = new Set(ready.slice(0, done).map((p) => p.row));
    setRows((prev) => prev.filter((r) => !sent.has(r)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {(title || description) && (
        <div className="shrink-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

      {/* 칸이 열 몇 개라 좁은 화면에서는 표만 가로로 움직인다 — 화면 전체가 밀리지 않는다. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full min-w-[1320px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {HEADERS.map((h, i) => {
                // 뒤에서 둘(금액·총금액)은 몸통과 같은 자리에 붙어 있어야 한다.
                const fromEnd = HEADERS.length - i;
                const stick =
                  fromEnd === 2 ? { right: STICKY.del + STICKY.total } : fromEnd === 1 ? { right: STICKY.del } : null;
                return (
                  <th
                    key={h}
                    className={cn(
                      'border-b px-2 py-1.5 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase',
                      stick && 'sticky z-[2] bg-muted text-right',
                      fromEnd === 2 && 'border-l'
                    )}
                    style={stick ?? undefined}
                  >
                    {h}
                  </th>
                );
              })}
              <th className="sticky z-[2] border-b bg-muted px-2 py-1.5" style={{ right: 0, width: STICKY.del }} />
            </tr>
          </thead>
          <tbody>
            {priced.map((p, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <Cell className="min-w-36">
                  <input
                    className={inputClass}
                    placeholder="FAR-26-0001"
                    value={p.row.far_no}
                    disabled={disabled}
                    onChange={(e) => patch(i, { far_no: e.target.value })}
                  />
                </Cell>
                <Cell className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={p.row.urgent}
                    disabled={disabled}
                    onChange={(e) => patch(i, { urgent: e.target.checked })}
                    aria-label={`${i + 1}행 긴급`}
                  />
                </Cell>
                <Cell className="min-w-28">
                  <input className={inputClass} value={p.row.export_no} disabled={disabled} onChange={(e) => patch(i, { export_no: e.target.value })} />
                </Cell>
                <Cell className="min-w-32">
                  <input className={inputClass} value={p.row.pjt} disabled={disabled} onChange={(e) => patch(i, { pjt: e.target.value })} />
                </Cell>
                <Cell className="min-w-24">
                  <input className={inputClass} value={p.row.name} disabled={disabled} onChange={(e) => patch(i, { name: e.target.value })} />
                </Cell>
                <Cell className="min-w-36">
                  <input type="date" className={inputClass} value={p.row.date} disabled={disabled} onChange={(e) => patch(i, { date: e.target.value })} />
                </Cell>
                <Cell className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={p.row.over_200ball}
                    disabled={disabled}
                    onChange={(e) => patch(i, { over_200ball: e.target.checked })}
                    aria-label={`${i + 1}행 ${BALL_THRESHOLD}ball 이상`}
                  />
                </Cell>
                {CHECK_COLUMNS.map((c) => (
                  <Cell key={c.key} className="text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={p.row[c.key]}
                      disabled={disabled}
                      onChange={(e) => patch(i, { [c.key]: e.target.checked } as Partial<ReballRow>)}
                      aria-label={`${i + 1}행 ${c.label}`}
                    />
                  </Cell>
                ))}
                <Cell className="w-20 min-w-20">
                  <input
                    type="number"
                    min={1}
                    className={cn(inputClass, 'tabular-nums')}
                    value={p.row.count}
                    disabled={disabled}
                    onChange={(e) => patch(i, { count: Math.max(0, Number(e.target.value) || 0) })}
                    aria-label={`${i + 1}행 시료 수`}
                  />
                </Cell>
                {/* 아래 둘은 나오는 값이다 — 적는 곳이 아니라는 것이 눈에 보이게 입력 상자를 두지 않는다. */}
                <Cell
                  className={cn(stickyCell, 'border-l text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground')}
                  style={{ right: STICKY.del + STICKY.total, width: STICKY.per, minWidth: STICKY.per }}
                >
                  {won(p.per)}
                </Cell>
                <Cell
                  className={cn(stickyCell, 'text-right text-sm font-medium whitespace-nowrap tabular-nums')}
                  style={{ right: STICKY.del, width: STICKY.total, minWidth: STICKY.total }}
                >
                  {won(p.total)}
                </Cell>
                <Cell className={cn(stickyCell, 'text-center')} style={{ right: 0, width: STICKY.del, minWidth: STICKY.del }}>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                    disabled={disabled || rows.length === 1}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`${i + 1}행 지우기`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </Cell>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted">
              <td colSpan={HEADERS.length - 1} className="px-2 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">
                총금액
              </td>
              <td
                className="sticky z-[1] bg-muted px-2 py-2 text-right text-base font-semibold whitespace-nowrap tabular-nums"
                style={{ right: STICKY.del, width: STICKY.total }}
              >
                {won(grandTotal)}
              </td>
              <td className="sticky z-[1] bg-muted" style={{ right: 0, width: STICKY.del }} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus className="size-4" /> 행 추가
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
          onClick={() => void copyTable()}
          title="메일이나 문서에 표 그대로 붙여넣을 수 있게 복사합니다"
        >
          {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          {copied ? '복사됨' : '표 복사'}
        </button>
        <button
          type="button"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={() => void submitAll()}
          disabled={disabled || sending}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {sending ? '등록 중…' : `의뢰 등록 (${rows.filter((r) => r.far_no.trim() !== '').length}건)`}
        </button>
      </div>
    </div>
  );
}

/** 빌더 캔버스·팔레트에서 보여 줄 모양(값을 다루지 않는다). */
export function ReballRequestTablePreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="overflow-hidden rounded-md border">
        <div className="flex gap-2 border-b bg-muted/50 px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {['FAR No', '긴급', '반출번호', 'PJT', '담당자', '날짜'].map((h) => (
            <span key={h} className="truncate">
              {h}
            </span>
          ))}
          <span className="ml-auto">금액</span>
        </div>
        <div className="px-2 py-3 text-xs text-muted-foreground">여러 줄을 적고 한 번에 등록합니다 — 금액은 단가표에서 자동 계산됩니다.</div>
      </div>
    </div>
  );
}
