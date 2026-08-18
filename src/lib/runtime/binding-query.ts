import 'server-only';
import { runListQuery, runAggregateQuery, runSingleQuery, type ResolvedEntity } from '@/lib/data-engine/query';
import type { BindingSpec } from '@/types/binding';
import type { ComponentNodeSpec, PublishedSpec } from '@/types/spec';

/** §10.7 nodeId → 활성 스펙의 노드. 클라이언트가 보낸 nodeId 자체는 그저 조회 키일 뿐이고,
 * 실제 쿼리에 쓰이는 테이블/컬럼명은 이 노드의 binding을 거쳐서만 나온다. */
export function findPublishedNode(spec: PublishedSpec, nodeId: string): ComponentNodeSpec | undefined {
  for (const page of spec.pages) {
    const node = page.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  return undefined;
}

/** §6.4 "entityId/fieldId는 반드시 활성 스펙에서 조회" — 운영 런타임은 드래프트가 아니라
 * 지금 이 페이지가 속한 PublishedSpec.entities에서만 엔티티를 찾는다. data-engine/query.ts의
 * SQL 빌더들은 ResolvedEntity 모양(tableName + fields[].columnName/dataType)만 쓰므로 그대로
 * 재사용할 수 있다 — Prisma의 createdAt류 부가 필드가 없을 뿐 구조적으로는 충분하다. */
export function findPublishedEntity(spec: PublishedSpec, entityId: string): ResolvedEntity {
  const entity = spec.entities.find((e) => e.id === entityId);
  if (!entity) throw new Error(`활성 스펙에 없는 엔티티입니다: ${entityId}`);
  return entity as unknown as ResolvedEntity;
}

/** 노드 하나의 바인딩을 실제로 실행해 초기 렌더에 필요한 데이터를 만든다 — §12.2 "바인딩
 * 데이터는 서버에서 미리 조회해 초기 렌더에 포함한다"의 실행부. static/field 모드는 여기서
 * 조회할 게 없다(field는 컴포넌트 자신의 현재 값이라 런타임 상태로 다룬다). */
export async function resolveBindingData(spec: PublishedSpec, binding: BindingSpec | null, page = 1): Promise<unknown> {
  if (!binding || binding.mode === 'static' || binding.mode === 'field') return null;

  try {
    if (binding.mode === 'list') {
      const entity = findPublishedEntity(spec, binding.entityId);
      return await runListQuery(binding, page, entity);
    }
    if (binding.mode === 'aggregate') {
      const entity = findPublishedEntity(spec, binding.entityId);
      return await runAggregateQuery(binding, entity);
    }
    if (binding.mode === 'single') {
      if (binding.keySource !== 'fixed' || !binding.keyValue) return null; // route/selection은 클라이언트에서 §10.7 재조회
      const entity = findPublishedEntity(spec, binding.entityId);
      return await runSingleQuery(binding, binding.keyValue, entity);
    }
  } catch {
    // §12.2 "알 수 없는 컴포넌트 타입은 앱을 깨뜨리지 않는다"와 같은 원칙 — 바인딩이 깨져도
    // (예: 배포 이후 app.db가 수동으로 바뀐 극단 케이스) 해당 노드만 빈 데이터로 렌더한다.
    return null;
  }
  return null;
}
