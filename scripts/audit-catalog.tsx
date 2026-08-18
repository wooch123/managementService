/**
 * 카탈로그 88종 전수 점검.
 *  1) defaultProps가 propsSchema를 통과하는가(스키마와 기본값이 어긋나 있지 않은가)
 *  2) props를 통째로 비운 채(예전 노드 상황) 렌더해도 터지지 않는가
 *  3) 기본값으로 렌더해도 터지지 않는가
 *  4) 바인딩 데이터가 null/빈 결과일 때 터지지 않는가
 */
import { renderToString } from 'react-dom/server';
import { catalog } from '@/lib/registry/catalog';
import type { RenderContext } from '@/lib/registry/types';

type Case = { name: string; props: Record<string, unknown>; data: unknown };

const results: { key: string; check: string; error: string }[] = [];

for (const [key, def] of Object.entries(catalog)) {
  // 1) 스키마 ↔ 기본값
  const parsed = def.propsSchema.safeParse(def.defaultProps);
  if (!parsed.success) {
    results.push({
      key,
      check: '기본값이 스키마를 통과하지 못함',
      error: JSON.stringify(parsed.error.issues.slice(0, 2)),
    });
  }

  const cases: Case[] = [
    { name: 'props 없음(예전 노드)', props: {}, data: undefined },
    { name: '기본값', props: def.defaultProps as Record<string, unknown>, data: undefined },
    { name: '바인딩 null', props: def.defaultProps as Record<string, unknown>, data: null },
    { name: '빈 결과', props: def.defaultProps as Record<string, unknown>, data: { rows: [], columns: [] } },
    { name: '집계 0', props: def.defaultProps as Record<string, unknown>, data: 0 },
  ];

  for (const c of cases) {
    // 런타임과 같은 방식: 기본값을 깔고 저장된 props를 덮어쓴다
    const ctx = {
      node: { id: 'audit-node', type: key },
      props: { ...(def.defaultProps as Record<string, unknown>), ...c.props },
      data: c.data,
      children: def.isContainer ? null : undefined,
    } as unknown as RenderContext;
    try {
      renderToString(def.render(ctx) as React.ReactElement);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // recharts는 SSR에서 크기를 못 재 경고성 예외를 낼 수 있어 구분해 표시한다
      results.push({ key, check: c.name, error: msg.slice(0, 160) });
    }
  }
}

console.log(`점검한 컴포넌트: ${Object.keys(catalog).length}종`);
if (results.length === 0) {
  console.log('문제 없음 ✅');
} else {
  console.log(`발견: ${results.length}건`);
  for (const r of results) console.log(` - [${r.key}] ${r.check}: ${r.error}`);
  process.exitCode = 1;
}
