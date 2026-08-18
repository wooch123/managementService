import 'server-only';
import { getAppDb } from '@/lib/db/app-db';
import { computeSchemaDiff, type EntityDraft, type SchemaChange } from '@/lib/data-engine/diff';
import type { DraftEntity } from '@/lib/validation/types';
import type { DataType } from '@/types/entity';

/**
 * §2.3 4단계 "스키마 diff 계산". P4에서 승인된 즉시 적용 모델(PROGRESS.md P4/P7 참고) 하에서는
 * 엔티티/필드 CRUD가 app.db DDL을 그 자리에서 실행하므로, 배포 시점의 app.db는 이미 드래프트와
 * 거의 일치한 상태다 — 그래서 "이전 활성 리비전의 엔티티 정의 vs 드래프트"(스펙 문구)가 실질적으로
 * "app.db 실제 스키마 vs 드래프트"(computeSchemaDiff가 원래 하던 비교)와 같은 결과를 낸다. 이미
 * §6.5 표대로 구현되어 있는 그 함수를 그대로 재사용한다 — 별도의 마이그레이션 SQL 생성기는
 * 만들지 않는다(정상 경로에서는 diff가 대부분 비어 있어야 하고, 그렇지 않다면 즉시 적용 모델의
 * 불변식이 깨진 드리프트 상황이라 §2.3 5단계의 "실행"이 아니라 §11.5의 검증 실패로 처리한다).
 */
export function computeDeploySchemaDiff(entities: DraftEntity[]): SchemaChange[] {
  const drafts: EntityDraft[] = entities.map((e) => ({
    tableName: e.tableName,
    fields: e.fields.map((f) => ({
      columnName: f.columnName,
      dataType: f.dataType as DataType,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      defaultVal: f.defaultVal,
    })),
  }));
  return computeSchemaDiff(getAppDb(), drafts);
}

/** §11.5 E-DEP-001이 참조하는 식별자 있는 파괴적 변경 목록으로 변환 — 이 id를 그대로
 * 관리자가 체크한 acceptDestructive 배열에 실어 보내면 다시 매칭된다. */
export function toDestructiveDescriptor(change: SchemaChange): { id: string; description: string } {
  const id = `${change.kind}:${change.tableName}:${change.columnName ?? ''}`;
  const target = change.columnName ? `${change.tableName}.${change.columnName}` : change.tableName;
  const suffix = change.affectedRows != null ? ` (영향 행 ${change.affectedRows}건)` : '';
  return { id, description: `${target} — ${describeChangeKind(change.kind)}${suffix}` };
}

function describeChangeKind(kind: SchemaChange['kind']): string {
  switch (kind) {
    case 'field_type_change':
      return '컬럼 타입 변경';
    case 'field_delete':
      return '컬럼 삭제';
    case 'entity_delete':
      return '테이블 삭제';
    default:
      return kind;
  }
}
