'use client';

import { useEffect, useRef } from 'react';

/**
 * 방문 기록 신호 — 운영 화면이 열릴 때 한 번만 서버에 알린다. 아무것도 그리지 않는다.
 *
 * 서버 렌더 중에 기록하지 않는 이유: 같은 요청이 프리페치·재검증으로 여러 번 실행될 수 있어
 * 사람이 한 번 본 화면이 여러 건으로 세어진다. **화면이 실제로 브라우저에 뜬 순간**을 세는 것이
 * "접속자"의 뜻에 맞다.
 *
 * `slug`가 같은 동안에는 다시 보내지 않는다 — 목록에서 항목을 고르면 주소의 쿼리만 바뀌는데,
 * 그것까지 새 방문으로 세면 표를 많이 눌러 본 사람이 열 명처럼 보인다.
 */
export function VisitTracker({ slug }: { slug: string }) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || sent.current === slug) return;
    sent.current = slug;
    void fetch('/api/stats/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {
      // 통계가 실패해도 화면은 아무 영향을 받지 않는다.
    });
  }, [slug]);

  return null;
}
