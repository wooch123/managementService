'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 접수 직접 추가 — 자동으로 불러오지 못한 FA를 손으로 채워 넣는다.
 *
 * 원장은 외부 서버가 채우는 것이 원칙이지만 그 길로 들어오지 못한 건이 생긴다. 그때 담당자를
 * 지정하려면 목록에 줄이 있어야 하는데, 지금까지는 그럴 방법이 없었다(사용자 지정, 2026-08-30).
 *
 * FAR No 하나와 **sample 총 개수**를 받아 1번부터 그 수만큼 줄을 만든다 — 원장은 행 하나가
 * sample 하나라, 세 개짜리 FA는 세 줄이어야 담당자 지정도 표 집계도 제대로 돈다.
 *
 * 늘 펼쳐 두지 않는다: 가끔 쓰는 기능이라 접수 목록을 아래로 밀어낼 이유가 없다.
 */

/** 한 번에 만들 수 있는 sample 수 — 손으로 넣는 자리라 실수로 큰 수를 적었을 때를 막는다. */
const MAX_SAMPLES = 50;

const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** 오늘 날짜(YYYY-MM-DD) — 서버가 아니라 보는 사람의 날짜다. 접수일은 사람이 적는 값이라 그게 맞다. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ManualIntake({
  title,
  description,
  onSubmitRow,
}: {
  title: string;
  description: string;
  /** sample 한 줄을 만든다 — 성공 여부를 돌려준다. */
  onSubmitRow: (row: { far_no: string; sample_no: string; rcv_date: string }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [farNo, setFarNo] = useState('');
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(today());
  const [sending, setSending] = useState(false);

  async function submit() {
    const far = farNo.trim();
    if (far === '') {
      toast.error('FAR No를 적어 주세요.');
      return;
    }
    if (count < 1) {
      toast.error('Sample 총 개수는 1 이상이어야 합니다.');
      return;
    }

    setSending(true);
    let done = 0;
    // 1번부터 차례로 만든다 — 한꺼번에 던지면 어디서 멈췄는지 알 수 없다.
    for (let i = 1; i <= count; i += 1) {
      const ok = await onSubmitRow({ far_no: far, sample_no: String(i), rcv_date: date });
      if (!ok) break;
      done += 1;
    }
    setSending(false);

    if (done === count) {
      toast.success(`${far} · sample ${done}개를 넣었습니다.`);
      setFarNo('');
      setCount(1);
      setOpen(false);
      return;
    }
    toast.error(`${done}개까지 넣고 멈췄습니다. 목록을 확인한 뒤 나머지를 다시 넣어 주세요.`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="chart-title">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-medium',
            open ? 'border hover:bg-muted/50' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
          {open ? '닫기' : '접수 직접 추가'}
        </button>
      </div>

      {open && (
        <div className="grid items-end gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">FAR No</span>
            <input className={inputClass} placeholder="예: FAR-26-0001" value={farNo} onChange={(e) => setFarNo(e.target.value)} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Sample 총 개수</span>
            <input
              type="number"
              min={1}
              max={MAX_SAMPLES}
              className={cn(inputClass, 'tabular-nums')}
              value={count}
              onChange={(e) => setCount(Math.min(MAX_SAMPLES, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">접수일</span>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={sending}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {sending ? '넣는 중…' : `${count}줄 넣기`}
          </button>

          <p className="text-[11px] text-muted-foreground sm:col-span-4">
            sample 1번부터 적은 개수만큼 줄이 생깁니다. 나머지 칸(고객명·제품명·마감일 등)은 비어 있으니 분석 Tool이 채우거나 나중에 고치면 됩니다.
            {' '}같은 FAR No를 다시 넣으면 줄이 겹쳐 생기므로 목록에서 먼저 확인해 주세요.
          </p>
        </div>
      )}
    </div>
  );
}

/** 빌더 캔버스·팔레트용 정적 미리보기. */
export function ManualIntakePreview({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col gap-2">
      {title && <h3 className="chart-title">{title}</h3>}
      <span className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        <Plus className="size-4" /> 접수 직접 추가
      </span>
    </div>
  );
}
