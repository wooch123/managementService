import 'server-only';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { buildValidationCtx } from '@/lib/validation/context';
import { runValidation } from '@/lib/validation/registry';
import { buildPublishedSpec } from '@/lib/deploy/build-spec';
import { computeDeploySchemaDiff, toDestructiveDescriptor } from '@/lib/deploy/migrate';
import { backupAppDb, restoreAppDb } from '@/lib/deploy/backup';
import type { ValidationIssue } from '@/lib/validation/types';
import type { PublishedSpec } from '@/types/spec';

export type PublishStep = 'parse' | 'validate' | 'revision';

export type PublishResult =
  | { ok: true; revisionNo: number; revisionId: string }
  | { ok: false; step: PublishStep; message: string; issues?: ValidationIssue[] };

/**
 * §2.3 배포 트랜잭션. 8단계를 순서대로 실행하고 어느 단계든 실패하면 되돌린다:
 *   1 드래프트 로드+zod 파싱  2 검증 엔진(error 0건 필수)  3 app.db 백업
 *   4 스키마 diff 계산  5 마이그레이션 적용  6 Revision 생성  7 activeRevisionId 교체
 *   8 revalidateTag('published-spec')
 *
 * 4번(diff)은 2번(검증)이 파괴적 변경 확인 여부를 판단하는 데 필요한 입력이라 실제 호출
 * 순서는 앞당겨진다 — 매번 재계산하지 않고 한 번의 loadDraftSpec() 결과를 diff/파싱/검증
 * 전부에 공유한다.
 *
 * 5번(마이그레이션 적용)은 P4에서 승인된 즉시 적용 모델(PROGRESS.md P4 참고) 하에서는 대체로
 * 할 일이 없다 — 엔티티/필드 CRUD가 이미 app.db DDL을 그 자리에서 실행했으므로, 이 시점의
 * diff는 이미 반영된 변경들의 "감사 기록"에 가깝다. 그래서 여기서는 별도로 SQL을 실행하지
 * 않고 migrationSql 컬럼에 diff 결과를 그대로 직렬화해 남긴다.
 */
export async function publish(opts: {
  note?: string;
  acceptDestructiveIds: string[];
  publishedBy: string;
}): Promise<PublishResult> {
  const draft = await loadDraftSpec();

  const schemaChanges = computeDeploySchemaDiff(draft.entities);
  const destructive = schemaChanges.filter((c) => c.risk === 'destructive');
  const blocked = schemaChanges.filter((c) => c.risk === 'blocked');
  const acceptedIds = new Set(opts.acceptDestructiveIds);

  const lastRevision = await prisma.revision.findFirst({ orderBy: { revisionNo: 'desc' } });
  const previousRevisionPageSlugs = lastRevision
    ? ((JSON.parse(lastRevision.specJson) as PublishedSpec).pages.map((p) => p.slug))
    : null;

  const ctx = buildValidationCtx({
    pendingDestructiveChanges: destructive.map(toDestructiveDescriptor),
    acceptedDestructiveIds: acceptedIds,
    migrationDryRunError: blocked.length > 0 ? blocked.map((b) => b.reason ?? b.kind).join('; ') : null,
    previousRevisionPageSlugs,
    // 진짜 "직전 배포 대비 변경 여부" 비교(specHash 등)는 P8 범위에서 단순화했다 — 정보성
    // 규칙(I-DEP-005)에만 쓰이고 배포를 막지 않는다.
    hasChangesSincePublish: true,
  });
  const issues = runValidation(draft, ctx);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  if (errorCount > 0) {
    return { ok: false, step: 'validate', message: `오류 ${errorCount}건이 있어 배포할 수 없습니다.`, issues };
  }

  const revisionNo = (lastRevision?.revisionNo ?? 0) + 1;

  let spec: PublishedSpec;
  try {
    spec = buildPublishedSpec(draft, revisionNo);
  } catch (e) {
    // §13.4 "에러 응답에 스택 트레이스/SQL이 노출되지 않는다" — 원본 예외는 서버 로그에만
    // 남기고, 관리자에게는 어떤 스펙 파싱이 실패했는지만 알려준다(zod 에러 메시지가 필드값을
    // 그대로 반사할 수 있어 사용자 입력을 그대로 되돌려주지 않는다).
    console.error('[deploy] PublishedSpec 파싱 실패:', e);
    return { ok: false, step: 'parse', message: '드래프트 스펙이 유효하지 않습니다. 구성 검증 화면에서 오류를 다시 확인하세요.' };
  }

  const backupPath = backupAppDb(revisionNo);

  try {
    const revision = await prisma.$transaction(async (tx) => {
      const rev = await tx.revision.create({
        data: {
          revisionNo,
          specJson: JSON.stringify(spec),
          migrationSql: JSON.stringify(schemaChanges),
          note: opts.note,
          publishedBy: opts.publishedBy,
        },
      });
      await tx.deployment.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', activeRevisionId: rev.id },
        update: { activeRevisionId: rev.id },
      });
      return rev;
    });

    // 캐시 무효화는 **트랜잭션이 끝난 뒤의 뒷정리**다. 여기서 실패한다고 배포를 되돌리면
    // meta.db는 이미 커밋된 리비전을 갖고 app.db만 예전으로 복원돼 둘이 어긋난다.
    // 게다가 활성 리비전 포인터는 캐시하지 않고 매번 읽으므로(spec-cache.ts), 무효화가 없어도
    // 새 리비전은 새 캐시 키라 곧바로 보인다 — 실패를 남기되 배포는 성공으로 끝낸다.
    try {
      revalidateTag('published-spec');
    } catch (e) {
      console.warn('[deploy] 스펙 캐시 무효화 실패(배포 자체는 완료됨):', e);
    }
    return { ok: true, revisionNo, revisionId: revision.id };
  } catch (e) {
    // Prisma $transaction은 실패 시 meta.db 쪽(Revision/Deployment)을 자동 롤백한다 — 여기서는
    // app.db 백업까지 복원해 "리비전 미생성 + 활성 리비전 불변"이 두 DB 모두에서 참이 되게 한다.
    restoreAppDb(backupPath);
    console.error('[deploy] 리비전 생성 실패, 롤백함:', e);
    return { ok: false, step: 'revision', message: '배포 중 오류가 발생해 롤백했습니다. 잠시 후 다시 시도하거나 서버 로그를 확인하세요.' };
  }
}
