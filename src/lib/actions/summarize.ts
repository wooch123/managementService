import type { ActionConfig, ValueSource } from '@/lib/actions/schema';
import type { Field } from '@prisma/client';

export type SummarizeCtx = {
  entityName: (entityId: string) => string;
  fieldName: (entityId: string, fieldId: string) => string;
  actionName: (actionId: string) => string;
};

function describeSource(source: ValueSource): string {
  switch (source.from) {
    case 'literal':
      return `"${String(source.value)}"`;
    case 'component':
      return `입력#${source.nodeId.slice(-4)}`;
    case 'selection':
      return `선택된 행의 ${source.field}`;
    case 'route':
      return `경로 파라미터 ${source.param}`;
    case 'now':
      return '현재 시각';
    case 'user':
      return '현재 사용자';
  }
}

function describeFieldMap(entityId: string, fieldMap: Record<string, ValueSource>, ctx: SummarizeCtx): string {
  const parts = Object.entries(fieldMap).map(([fieldId, src]) => `${ctx.fieldName(entityId, fieldId)} ← ${describeSource(src)}`);
  return parts.length > 0 ? parts.join(', ') : '(매핑 없음)';
}

function describeFollowUp(label: string, actionId: string | null | undefined, ctx: SummarizeCtx): string {
  if (!actionId) return '';
  return ` ${label}: ${ctx.actionName(actionId)}.`;
}

/** §9.2 "하단 요약 문장" — 예시: "주문 테이블에 새 행을 만든다. 고객명 ← 입력#3, 금액 ← 입력#4. 성공 시: 토스트 '저장되었습니다'" */
export function summarizeAction(config: ActionConfig, ctx: SummarizeCtx): string {
  switch (config.kind) {
    case 'CREATE':
      return (
        `${ctx.entityName(config.entityId)} 테이블에 새 행을 만든다. ${describeFieldMap(config.entityId, config.fieldMap, ctx)}.` +
        describeFollowUp('성공 시', config.onSuccess, ctx) +
        describeFollowUp('실패 시', config.onError, ctx)
      );
    case 'UPDATE':
      return (
        `${ctx.entityName(config.entityId)} 테이블에서 ${describeSource(config.keySource)}에 해당하는 행을 수정한다. ${describeFieldMap(config.entityId, config.fieldMap, ctx)}.` +
        describeFollowUp('성공 시', config.onSuccess, ctx) +
        describeFollowUp('실패 시', config.onError, ctx)
      );
    case 'DELETE':
      return (
        `${ctx.entityName(config.entityId)} 테이블에서 ${describeSource(config.keySource)}에 해당하는 행을 삭제한다.` +
        (config.confirmText ? ` 확인 문구: "${config.confirmText}".` : '') +
        describeFollowUp('성공 시', config.onSuccess, ctx)
      );
    case 'QUERY':
      return `${ctx.entityName(config.entityId)} 테이블을 조회해 대상 컴포넌트를 갱신한다 (조건 ${config.filters.length}개).`;
    case 'NAVIGATE':
      return `지정한 페이지로 이동한다.`;
    case 'OPEN_MODAL':
      return `대상 컴포넌트를 연다.`;
    case 'CLOSE_MODAL':
      return `대상 컴포넌트를 닫는다.`;
    case 'TOAST':
      return `토스트(${config.variant})를 표시한다: "${config.message}".`;
    case 'EXPORT_CSV':
      return `${ctx.entityName(config.entityId)} 테이블을 "${config.filename}"로 CSV 내보내기한다 (조건 ${config.filters.length}개).`;
    case 'COMPOSITE':
      return `${config.steps.length}단계를 순서대로 실행한다: ${config.steps.map((s) => ctx.actionName(s)).join(' → ')}. 실패 시 ${config.stopOnError ? '전체 롤백' : '계속 진행'}.`;
  }
}

export function fieldLabelLookup(fieldsByEntity: Record<string, Field[]>): SummarizeCtx['fieldName'] {
  return (entityId, fieldId) => fieldsByEntity[entityId]?.find((f) => f.id === fieldId)?.name ?? fieldId;
}
