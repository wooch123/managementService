'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardPaste } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 클립보드의 그림을 **바로 이 칸에** 붙이는 단추.
 *
 * 그냥 Ctrl+V로 두지 않은 이유(사용자 지정): 그림 칸이 한 화면에 여럿이라 어디에 붙을지가 눌러
 * 보기 전에는 알 수 없다. 칸마다 단추를 두면 "이 칸에 붙는다"가 눈으로 정해진다.
 *
 * 두 갈래로 시도한다. 먼저 클립보드를 **직접 읽어** 본다. 브라우저가 그 권한을 주지 않거나 아예
 * 그 기능이 없으면(파이어폭스 계열) 이 칸을 붙여넣기 대상으로 잡아 두고 다음 Ctrl+V 한 번만
 * 받는다 — 그래도 "어디에 붙는지"는 여전히 정해져 있다.
 *
 * Tech Report에만 있던 것을 여기로 옮겼다 — 그림을 올릴 수 있는 자리가 다섯 곳으로 늘면서,
 * 같은 코드를 다섯 벌 두는 대신 한 벌만 둔다(사용자 지정, 2026-08-31).
 */

/**
 * `supported: false`는 **읽을 수 없는 브라우저**라는 뜻이고, `supported: true, file: null`은
 * 읽었는데 그림이 없었다는 뜻이다. 둘을 나누는 이유: 앞은 다른 길(Ctrl+V)로 넘어가야 하고,
 * 뒤는 기다려도 달라지지 않아 그 자리에서 알려 줘야 한다.
 */
export type ClipboardRead = { supported: false } | { supported: true; file: File | null };

export async function imageFromClipboard(): Promise<ClipboardRead> {
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
export function imageFromPasteEvent(event: ClipboardEvent): File | null {
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

export function PasteImageButton({
  label,
  disabled,
  className,
  onPick,
  onWaitingChange,
}: {
  /** 어느 칸인지 — 안내 글과 읽어 주는 이름에 쓴다. */
  label: string;
  disabled?: boolean;
  className?: string;
  onPick: (file: File) => void;
  /** Ctrl+V를 기다리는지 — 빈 칸이 '지금 여기에 붙는다'를 함께 알리는 데 쓴다. */
  onWaitingChange?: (waiting: boolean) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => onWaitingChange?.(waiting), [waiting, onWaitingChange]);

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
    setWaiting(true);
    toast.info(`${label}에 붙여넣습니다 — Ctrl+V를 누르세요.`);
  }, [label, onPick]);

  useEffect(() => {
    if (!waiting) return;
    const onPaste = (event: ClipboardEvent) => {
      const picked = imageFromPasteEvent(event);
      setWaiting(false);
      if (!picked) {
        toast.error('붙여넣은 것에 그림이 없습니다.');
        return;
      }
      event.preventDefault();
      onPick(picked);
    };
    // 한 번 받고 스스로 내려간다 — 켜 둔 채로 두면 다른 칸에 붙이려 할 때 이 칸이 가로챈다.
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWaiting(false);
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', cancel);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', cancel);
    };
  }, [waiting, onPick]);

  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40',
        waiting && 'bg-primary/15 text-primary',
        className
      )}
      onClick={() => void pasteHere()}
      disabled={disabled}
      aria-label={`${label}에 클립보드 그림 붙여넣기`}
      title={waiting ? 'Ctrl+V를 누르세요 (Esc로 취소)' : '클립보드의 그림을 이 칸에 붙여넣기'}
    >
      <ClipboardPaste className="size-3.5" />
    </button>
  );
}
