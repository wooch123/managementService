'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const STEPS = [
  { href: '/admin/builder', label: '① layout 구성' },
  { href: '/admin/graph', label: '② 관계도' },
  { href: '/admin/validate', label: '③ 구성 검증' },
  { href: '/admin/deploy', label: '④ 수정본 배포' },
] as const;

export type ValidationBadgeState = 'not-run' | 'passed' | { errorCount: number };

export function Stepper({
  validationBadge = 'not-run',
  canDeploy = false,
}: {
  validationBadge?: ValidationBadgeState;
  /** ③ 검증 에러 0건 + 드래프트 변경 존재 시에만 true. §1.3 — ④ 스텝만 조건부 비활성. */
  canDeploy?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {STEPS.map((step, i) => {
        const isActive = pathname.startsWith(step.href);
        const isValidateStep = step.href === '/admin/validate';
        const isDeployStep = step.href === '/admin/deploy';
        const disabled = isDeployStep && !canDeploy;

        const content = (
          <>
            {step.label}
            {isValidateStep && <ValidationBadge state={validationBadge} />}
          </>
        );

        return (
          <div key={step.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
            {disabled ? (
              <span
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground/50"
                title="검증을 통과하고 드래프트 변경 사항이 있어야 배포할 수 있습니다"
              >
                {content}
              </span>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {content}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function ValidationBadge({ state }: { state: ValidationBadgeState }) {
  if (state === 'not-run') {
    return <span className="text-xs text-muted-foreground">–</span>;
  }
  if (state === 'passed') {
    return (
      <Badge variant="secondary" className="px-1.5 text-xs">
        ✓
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="px-1.5 text-xs">
      ● {state.errorCount}
    </Badge>
  );
}
