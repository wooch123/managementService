import 'server-only';
import { publishedSpecSchema, type PublishedSpec } from '@/types/spec';
import type { DraftSpec } from '@/lib/validation/types';

/** §3.2 고정 디자인 토큰 — 관리자가 테마를 커스터마이징하는 기능은 스펙 어디에도 없어 상수로 둔다. */
const THEME = { radius: 0.625, baseColor: 'neutral' };

/**
 * 드래프트(메타 DB) → §2.4 PublishedSpec 변환. 호출부(publish.ts)가 이미 loadDraftSpec()으로
 * 읽어둔 DraftSpec을 그대로 받는다(스키마 diff 계산에도 같은 draft가 필요해 중복 조회를
 * 피한다) — 필드 구성이 거의 같아 형태(레이아웃 중첩, 노드를 페이지별로 묶기)만 맞춘다.
 * 마지막의 publishedSpecSchema.parse가 §2.3 배포 트랜잭션 1단계("드래프트 스펙 로드 → zod
 * 파싱, 구조 무효 시 즉시 중단")를 그대로 수행한다 — binding이 DraftNode에서는 unknown이었던
 * 것과 action.config가 unknown이었던 것이 여기서 각각 bindingSpecSchema/actionConfigSchema로
 * 실제 검증된다.
 */
export function buildPublishedSpec(draft: DraftSpec, revisionNo: number): PublishedSpec {
  const raw = {
    specVersion: 1 as const,
    revisionNo,
    publishedAt: new Date().toISOString(),
    pages: draft.pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      icon: p.icon,
      parentId: p.parentId,
      order: p.order,
      isVisible: p.isVisible,
      isHome: p.isHome,
      layout: { cols: 12 as const, rowHeight: p.rowHeight, gap: p.gap },
      nodes: draft.nodes
        .filter((n) => n.pageId === p.id)
        .map((n) => ({
          id: n.id,
          type: n.type,
          parentNodeId: n.parentNodeId,
          order: n.order,
          region: n.region,
          grid: n.grid,
          props: n.props,
          binding: n.binding,
          events: n.events,
          label: n.label,
        })),
    })),
    entities: draft.entities.map((e) => ({
      id: e.id,
      name: e.name,
      tableName: e.tableName,
      description: e.description,
      order: e.order,
      fields: e.fields,
    })),
    actions: draft.actions.map((a) => ({
      id: a.id,
      name: a.name,
      config: a.config,
      description: a.description,
    })),
    relations: draft.relations,
    theme: THEME,
  };

  return publishedSpecSchema.parse(raw);
}
