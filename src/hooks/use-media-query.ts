'use client';

import { useEffect, useState } from 'react';

/**
 * 미디어 질의 결과를 React 상태로. 서버에는 창 크기가 없으므로 **첫 렌더는 항상 false**이고,
 * 마운트 직후 실제 값으로 맞춘다(하이드레이션 불일치를 만들지 않기 위한 표준 처리 —
 * `use-mobile.ts`도 같은 방식이다). 그래서 넓은 배치가 기본이고 좁은 화면에서만 한 번 바뀐다.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 관리자 화면이 4분할을 유지할 수 없는 폭 — 이 아래에서는 칸을 탭으로 접는다. */
export const BUILDER_NARROW_QUERY = '(max-width: 1023px)';
