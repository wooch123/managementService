import { prisma } from '@/lib/db/prisma';
import { loadDraftSpec } from '@/lib/validation/load-spec';
import { computeSpecHash } from '@/lib/validation/spec-hash';
import { AppHeader } from '@/components/shell/AppHeader';
import { Stepper, type ValidationBadgeState } from '@/components/shell/Stepper';
import { ThemeToggleButton } from '@/components/shell/ThemeToggleButton';
import { Badge } from '@/components/ui/badge';

export async function AdminHeader({ pageLabel }: { pageLabel: string }) {
  const [latestRun, spec] = await Promise.all([prisma.validationRun.findFirst({ orderBy: { startedAt: 'desc' } }), loadDraftSpec()]);
  const currentHash = computeSpecHash(spec);
  const stale = !latestRun || latestRun.specHash !== currentHash;

  const validationBadge: ValidationBadgeState = !latestRun ? 'not-run' : stale ? 'not-run' : latestRun.errorCount === 0 ? 'passed' : { errorCount: latestRun.errorCount };

  const hasDraftContent = spec.pages.length > 0;
  // §8.0 "검증 통과 + 드래프트 변경 존재 시에만 활성". 재검증 전에 배포 버튼을 켜주면 오래된
  // 통과 결과로 배포를 허용하는 셈이라, 검증이 최신 상태(specHash 일치)일 때만 활성화한다.
  // P8(배포 파이프라인) 이전에는 "직전 배포 대비 변경"을 비교할 Revision이 없어, 드래프트에
  // 내용이 하나라도 있으면 "변경 존재"로 간주한다.
  const canDeploy = !stale && !!latestRun && latestRun.errorCount === 0 && hasDraftContent;

  return (
    <AppHeader
      breadcrumbItems={[{ label: '관리자' }, { label: pageLabel }]}
      rightSlot={
        <>
          <Stepper validationBadge={validationBadge} canDeploy={canDeploy} />
          <ThemeToggleButton />
          {/* 정보성 표시라 자리가 빠듯하면 가장 먼저 접는다 — 단계 이동과 테마 버튼이 우선이다. */}
          <Badge
            variant="outline"
            className="hidden whitespace-nowrap xl:inline-flex"
            title="P8(배포 파이프라인) 이전에는 직전 배포 대비 변경분을 계산할 리비전이 없어 임시로 드래프트 존재 여부만 표시합니다"
          >
            드래프트 {hasDraftContent ? '변경 있음' : '변경 0건'}
          </Badge>
        </>
      }
    />
  );
}
