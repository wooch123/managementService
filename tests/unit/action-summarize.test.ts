import { describe, it, expect } from 'vitest';
import { summarizeAction, type SummarizeCtx } from '@/lib/actions/summarize';
import type { ActionConfig } from '@/lib/actions/schema';

const ctx: SummarizeCtx = {
  entityName: (id) => (id === 'e-order' ? '주문' : id),
  fieldName: (entityId, fieldId) => ({ 'f-customer': '고객명', 'f-amount': '금액' })[fieldId] ?? fieldId,
  actionName: (id) => (id === 'a-toast' ? "토스트 '저장되었습니다'" : id),
};

describe('summarizeAction — §9.2 사람이 읽는 요약 문장', () => {
  it('CREATE: 스펙 예시와 동일한 형태로 생성된다', () => {
    const config: ActionConfig = {
      kind: 'CREATE',
      entityId: 'e-order',
      fieldMap: {
        'f-customer': { from: 'component', nodeId: 'node-0003' },
        'f-amount': { from: 'component', nodeId: 'node-0004' },
      },
      onSuccess: 'a-toast',
    };
    const summary = summarizeAction(config, ctx);
    expect(summary).toContain('주문 테이블에 새 행을 만든다.');
    expect(summary).toContain('고객명 ← 입력#0003');
    expect(summary).toContain('금액 ← 입력#0004');
    expect(summary).toContain("성공 시: 토스트 '저장되었습니다'.");
  });

  it('CREATE: 리터럴 값은 따옴표로 표시된다', () => {
    const config: ActionConfig = { kind: 'CREATE', entityId: 'e-order', fieldMap: { 'f-customer': { from: 'literal', value: '홍길동' } } };
    expect(summarizeAction(config, ctx)).toContain('고객명 ← "홍길동"');
  });

  it('DELETE: 확인 문구가 포함된다', () => {
    const config: ActionConfig = { kind: 'DELETE', entityId: 'e-order', keySource: { from: 'selection', nodeId: 'table1', field: 'id' }, confirmText: '정말 삭제하시겠습니까?' };
    const summary = summarizeAction(config, ctx);
    expect(summary).toContain('주문 테이블에서');
    expect(summary).toContain('삭제한다');
    expect(summary).toContain('정말 삭제하시겠습니까?');
  });

  it('TOAST: variant와 message가 그대로 드러난다', () => {
    const config: ActionConfig = { kind: 'TOAST', variant: 'destructive', message: '오류가 발생했습니다' };
    expect(summarizeAction(config, ctx)).toBe('토스트(destructive)를 표시한다: "오류가 발생했습니다".');
  });

  it('COMPOSITE: 스텝 순서와 실패 정책이 드러난다', () => {
    const config: ActionConfig = { kind: 'COMPOSITE', steps: ['a-toast'], stopOnError: true };
    const summary = summarizeAction(config, ctx);
    expect(summary).toContain('1단계를 순서대로 실행한다');
    expect(summary).toContain('전체 롤백');
  });

  it('COMPOSITE: stopOnError=false면 계속 진행으로 표시된다', () => {
    const config: ActionConfig = { kind: 'COMPOSITE', steps: [], stopOnError: false };
    expect(summarizeAction(config, ctx)).toContain('계속 진행');
  });
});
