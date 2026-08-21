import { AdminHeader } from '@/components/shell/AdminHeader';
import { ValidateShell } from '@/components/validate/ValidateShell';
import { prisma } from '@/lib/db/prisma';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { computeSpecHash } from '@/lib/validation/spec-hash';
import { countSpecItems } from '@/lib/validation/helpers';
import type { ValidationIssue } from '@/lib/validation/types';

export const metadata = { title: '구성 검증' };

export default async function ValidatePage() {
  const [latest, spec] = await Promise.all([prisma.validationRun.findFirst({ orderBy: { startedAt: 'desc' } }), loadDraftSpec()]);

  const checkedCount = countSpecItems(spec);
  const stale = !latest || latest.specHash !== computeSpecHash(spec);
  const issues: ValidationIssue[] = latest ? (JSON.parse(latest.resultJson) as ValidationIssue[]) : [];

  // §8.5 "대상 링크" — COMPONENT/FIELD 이슈는 자기 자신의 id만 갖고 있어, 편집 화면 URL을
  // 만들려면 각각의 pageId/entityId가 필요하다. 매 요청마다 드래프트 스펙을 이미 로드하는
  // 김에 여기서 조회용 맵을 함께 만들어 클라이언트로 내려준다(별도 API 없이).
  const nodePageMap = Object.fromEntries(spec.nodes.map((n) => [n.id, n.pageId]));
  const fieldEntityMap = Object.fromEntries(spec.entities.flatMap((e) => e.fields.map((f) => [f.id, e.id])));

  return (
    <>
      <AdminHeader pageLabel="구성 검증" />
      <ValidateShell
        initialRun={latest}
        initialIssues={issues}
        initialStale={stale}
        initialCheckedCount={checkedCount}
        nodePageMap={nodePageMap}
        fieldEntityMap={fieldEntityMap}
      />
    </>
  );
}
