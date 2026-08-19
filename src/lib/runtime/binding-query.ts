import 'server-only';
import { runListQuery, runAggregateQuery, runGroupQuery, runSingleQuery, type ResolvedEntity } from '@/lib/data-engine/query';
import { isIsoDate } from '@/lib/period';
import type { BindingSpec, Filter } from '@/types/binding';
import type { ComponentNodeSpec, PublishedSpec } from '@/types/spec';

/** 주소의 쿼리에서 온 값들 — 바인딩 필터가 `source: 'query'` + `ref`로 이름을 지목해 쓴다. */
export type RuntimeParams = Record<string, string>;

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

/**
 * 하루 전체를 포함하도록 상한을 그 날의 끝으로 올린다.
 *
 * WHY: 기간 필터가 주는 값은 '2026-08-19' 같은 날짜다. 대상 컬럼이 DATETIME이면 저장된 값이
 * '2026-08-19T22:38:44.039Z'라 `<= '2026-08-19'` 비교에서 그날 하루가 통째로 빠진다.
 * 날짜(DATE) 컬럼은 값이 그대로 'YYYY-MM-DD'라 손댈 필요가 없다.
 */
function upperBoundFor(entity: ResolvedEntity, filter: Filter, value: string): string {
  if (filter.op !== 'lte' || !isIsoDate(value)) return value;
  const field = entity.fields.find((f) => f.id === filter.fieldId);
  return field?.dataType === 'DATETIME' ? `${value}T23:59:59.999Z` : value;
}

/**
 * 필터의 값 소스를 실제 값으로 바꾼다 — §6.4 필터 `source`의 실행부.
 *
 * - `fixed`   : 설계에 박아 둔 값을 그대로.
 * - `query`   : 주소의 쿼리에서 `ref` 이름으로 가져온다. **값이 없으면 조건 자체를 빼버린다** —
 *               비어 있는 값을 그대로 바인딩하면 "아무것도 해당하지 않음"이 되어, 기간을 안 고른
 *               사용자에게 빈 화면을 보여주게 된다. 조건을 빼는 쪽이 "제한 없음"이라는 의도에 맞다.
 * - `component`: 서버가 초기 데이터를 만드는 시점에는 화면 입력값이 아직 없으므로 역시 뺀다.
 */
export function resolveRuntimeFilters(entity: ResolvedEntity, filters: Filter[], params: RuntimeParams): Filter[] {
  const resolved: Filter[] = [];
  for (const filter of filters) {
    if (filter.source === 'fixed') {
      resolved.push(filter);
      continue;
    }
    if (filter.source === 'query') {
      const raw = filter.ref ? params[filter.ref] : undefined;
      if (raw === undefined || raw === '') continue;
      resolved.push({ ...filter, value: upperBoundFor(entity, filter, raw) });
    }
  }
  return resolved;
}

/** 노드 하나의 바인딩을 실제로 실행해 초기 렌더에 필요한 데이터를 만든다 — §12.2 "바인딩
 * 데이터는 서버에서 미리 조회해 초기 렌더에 포함한다"의 실행부. static/field 모드는 여기서
 * 조회할 게 없다(field는 컴포넌트 자신의 현재 값이라 런타임 상태로 다룬다). */
export async function resolveBindingData(
  spec: PublishedSpec,
  binding: BindingSpec | null,
  page = 1,
  params: RuntimeParams = {}
): Promise<unknown> {
  if (!binding || binding.mode === 'static' || binding.mode === 'field') return null;

  try {
    if (binding.mode === 'list') {
      const entity = findPublishedEntity(spec, binding.entityId);
      return await runListQuery({ ...binding, filters: resolveRuntimeFilters(entity, binding.filters, params) }, page, entity);
    }
    if (binding.mode === 'group') {
      // 항목별 집계는 DB가 전부 세어 결과만 돌려준다(원시 행을 표본으로 가져오지 않는다).
      const entity = findPublishedEntity(spec, binding.entityId);
      return await runGroupQuery({ ...binding, filters: resolveRuntimeFilters(entity, binding.filters, params) }, entity);
    }
    if (binding.mode === 'aggregate') {
      const entity = findPublishedEntity(spec, binding.entityId);
      const value = await runAggregateQuery({ ...binding, filters: resolveRuntimeFilters(entity, binding.filters, params) }, entity);

      // 직전 같은 길이의 기간과 견준다 — 기간 필터가 넣어 둔 prevFrom/prevTo로 한 번 더 센다.
      // 기간이 한쪽이라도 열려 있으면(전체 등) 비교 구간이 없어 그냥 숫자만 돌려준다.
      if (!binding.compare || !params.prevFrom || !params.prevTo) return value;
      const previous = await runAggregateQuery(
        {
          ...binding,
          filters: resolveRuntimeFilters(entity, binding.filters, { ...params, from: params.prevFrom, to: params.prevTo }),
        },
        entity
      );
      return { value, previous };
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
