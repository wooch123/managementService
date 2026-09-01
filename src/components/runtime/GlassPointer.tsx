'use client';

import { useEffect, useRef } from 'react';

/**
 * 마우스를 따라다니는 빛 한 덩이 — 유리 화면의 조명(사용자 지정, 2026-09-01).
 *
 * 배경에 깔아 두던 빛무리를 걷어내고 이것만 남겼다. 빛이 **카드 뒤**에 있으므로, 마우스가
 * 있는 자리의 카드만 그 빛을 머금어 유리처럼 비치고 나머지는 그냥 카드로 보인다. 화면 전체가
 * 늘 화려한 것보다, 보고 있는 자리만 살아나는 편이 대시보드에 맞다.
 *
 * ── 두 가지를 갱신한다 ──────────────────────────────────────────────────────────
 *   · 이 요소의 `transform` — 빛덩이 자체를 옮긴다. 합성 단계에서 처리되어 다시 칠하지 않는다.
 *   · `--mx` / `--my` (문서 뿌리) — 카드가 자기 표면의 광택을 그릴 때 쓴다. 카드마다 좌표를
 *     따로 계산하지 않고 **뷰포트 좌표 하나**를 모두가 나눠 쓴다(globals.css 참고).
 *
 * ── 왜 곧바로 따라가지 않는가 ───────────────────────────────────────────────────
 * 마우스에 정확히 붙이면 빛이 커서처럼 딱딱하게 움직인다. 매 프레임 조금씩 다가가게 하면
 * (lerp) 무거운 것이 끌려오듯 뒤따르고, 그 지연이 '빛'처럼 보이게 한다.
 *
 * 마우스가 멈추면 곧 따라잡히므로 **루프를 멈춘다** — 가만히 있는 화면에서 프레임마다 깨어날
 * 이유가 없다. 다시 움직이면 그때 깨운다.
 */

/** 한 프레임에 남은 거리의 몇 할을 따라갈지. 낮을수록 느긋하게 끌려온다. */
const EASE = 0.14;
/** 이만큼 가까워지면 따라잡은 것으로 보고 루프를 멈춘다(px). */
const SETTLE = 0.4;

export function GlassPointer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 움직임을 줄이도록 설정했다면 지연 없이 곧바로 붙인다 — 끌려오는 연출이 그 설정의 취지에
    // 어긋난다. 빛 자체를 없애지는 않는다(그건 '움직임'이 아니라 '생김새'다).
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let seen = false;

    const paint = () => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const root = document.documentElement.style;
      root.setProperty('--mx', `${x}px`);
      root.setProperty('--my', `${y}px`);
    };

    const step = () => {
      const dx = targetX - x;
      const dy = targetY - y;
      x += dx * EASE;
      y += dy * EASE;
      paint();
      // 따라잡았으면 멈춘다. 다음 움직임이 다시 깨운다.
      raf = Math.abs(dx) < SETTLE && Math.abs(dy) < SETTLE ? 0 : requestAnimationFrame(step);
    };

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!seen) {
        // 첫 등장은 그 자리에서 켠다 — 화면 구석(0,0)에서 날아오면 눈에 거슬린다.
        seen = true;
        x = targetX;
        y = targetY;
        el.dataset.on = 'true';
        paint();
        return;
      }
      if (reduceMotion.matches) {
        x = targetX;
        y = targetY;
        paint();
        return;
      }
      if (!raf) raf = requestAnimationFrame(step);
    };

    // 창 밖으로 나가면 빛도 끈다 — 마우스가 없는데 빛만 남아 있으면 무엇을 가리키는지 모른다.
    const onLeave = () => {
      el.dataset.on = 'false';
      seen = false;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="glass-pointer" data-on="false" aria-hidden="true" />;
}
