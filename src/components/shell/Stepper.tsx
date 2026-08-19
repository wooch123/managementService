'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// 번호와 이름을 나눠 둔다 — 창이 좁아지면 이름을 접고 번호만 남겨, 네 단계가 헤더 안에 그대로
// 들어오게 한다(예전에는 통째로 헤더 밖으로 185px까지 밀려났다). 무엇을 누르는지는 title로 남는다.
const STEPS = [
  { href: '/admin/builder', mark: '①', label: 'layout 구성' },
  { href: '/admin/graph', mark: '②', label: '관계도' },
  { href: '/admin/validate', mark: '③', label: '구성 검증' },
  { href: '/admin/deploy', mark: '④', label: '수정본 배포' },
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
            <span aria-hidden>{step.mark}</span>
            <span className="hidden lg:inline">{step.label}</span>
            <span className="sr-only">{step.label}</span>
            {isValidateStep && <ValidationBadge state={validationBadge} />}
          </>
        );

        return (
          <div key={step.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="hidden size-3.5 text-muted-foreground lg:block" />}
            {disabled ? (
              <span
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground/50 lg:px-2"
                title={`${step.mark} ${step.label} — 검증을 통과하고 드래프트 변경 사항이 있어야 배포할 수 있습니다`}
              >
                {content}
              </span>
            ) : (
              <Link
                href={step.href}
                title={`${step.mark} ${step.label}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent lg:px-2',
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
