import 'server-only';
import { createHash } from 'node:crypto';
import type { DraftSpec } from '@/lib/validation/types';

/** §11.6/§7.6 "드래프트 변경 감지"에 쓰는 해시 — 순서에 안정적이도록 id로 정렬한 뒤 직렬화한다. */
export function computeSpecHash(spec: DraftSpec): string {
  const stable = {
    pages: [...spec.pages].sort((a, b) => a.id.localeCompare(b.id)),
    nodes: [...spec.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    entities: [...spec.entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ ...e, fields: [...e.fields].sort((a, b) => a.id.localeCompare(b.id)) })),
    actions: [...spec.actions].sort((a, b) => a.id.localeCompare(b.id)),
    relations: [...spec.relations].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
