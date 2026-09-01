import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutDashboard, FileQuestion } from 'lucide-react';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { buildPublishedPageTree } from '@/lib/runtime/published-page-tree';
import { buildBreadcrumb } from '@/lib/runtime/breadcrumb';
import { resolveBindingData } from '@/lib/runtime/binding-query';
import { DEFAULT_PERIOD_PRESET, periodQueryValues, resolvePeriod, toIsoDate, type PeriodPresetKey } from '@/lib/period';
import { AppHeader } from '@/components/shell/AppHeader';
import { RuntimeRenderer } from '@/components/runtime/RuntimeRenderer';
import { VisitTracker } from '@/components/runtime/VisitTracker';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { ComponentNodeSpec, PublishedSpec } from '@/types/spec';

/** 기간 필터 컴포넌트의 카탈로그 키 — 런타임이 이 타입을 보고 페이지의 조회 기간을 정한다. */
const PERIOD_FILTER_TYPE = 'date-range-filter';

/** 마감이 며칠 앞이면 '임박'으로 볼지 — 설계가 아니라 업무 규칙이라 여기 한 곳에 둔다. */
const TAT_SOON_DAYS = 7;

function NoticeScreen({ icon, title, description, actionHref, actionLabel }: { icon: React.ReactNode; title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <>
      <AppHeader breadcrumbItems={[]} />
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{icon}</EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}

/**
 * 페이지에 놓인 '기간 필터' 컴포넌트가 있으면 그 기본 프리셋을, 없으면 null.
 *
 * 기본 기간은 코드가 아니라 **설계**에 있다 — 관리자가 빌더에서 기본값을 바꾸면 그대로 따라간다.
 * 필터가 두 개 이상이면 첫 번째(가장 위 왼쪽)를 기준으로 삼는다.
 */
function findPeriodFilter(nodes: ComponentNodeSpec[]): ComponentNodeSpec | null {
  const filters = nodes.filter((n) => n.type === PERIOD_FILTER_TYPE);
  if (filters.length === 0) return null;
  return [...filters].sort((a, b) => a.grid.row - b.grid.row || a.grid.col - b.grid.col)[0];
}

/**
 * 유리 재질로 꾸미는 화면(사용자 지정, 2026-09-01).
 *
 * 화면 이름으로 고른다. 설계(스펙)에 '꾸밈' 항목을 새로 만들지 않은 이유: 지금 필요한 것은
 * 한 화면뿐이고, 스펙에 칸을 늘리면 검증·배포·마이그레이션이 모두 딸려 온다. 여기 한 줄이면
 * 늘리고 줄일 수 있다 — 다른 화면에도 입히려면 이 목록에 이름을 더하면 된다.
 */
const GLASS_PAGES = new Set(['overview']);

/** 배포된 스펙에서 이 주소가 가리키는 화면을 찾는다(slug가 없으면 홈). */
function findActivePage(spec: PublishedSpec | null, slug: string[] | undefined) {
  if (!spec) return undefined;
  // slug 없음 → isHome. 매칭 실패 → 404. isVisible=false인 페이지도 직접 URL 접근은 허용한다
  // (메뉴에서만 숨기는 일반적인 CMS 관례 — §12.1은 매칭 자체를 isVisible로 제한하지 않는다).
  return slug?.length ? spec.pages.find((p) => p.slug === slug[slug.length - 1]) : spec.pages.find((p) => p.isHome);
}

/**
 * 탭 제목에 **지금 보고 있는 화면 이름**을 넣는다 — 앞부분("사이트 이름 - ")은 (public)/layout의
 * 템플릿이 붙인다. 이름은 사이드바 메뉴에 쓰는 그 제목(배포된 스펙의 Page.title)이라, 메뉴에서
 * 읽은 이름과 탭에 뜨는 이름이 항상 같다.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const [{ slug }, spec] = await Promise.all([params, getActiveSpec()]);
  const page = findActivePage(spec, slug);
  // 찾지 못하면 제목을 비워 레이아웃의 기본값(사이트 이름)이 그대로 쓰이게 둔다.
  return page ? { title: page.title } : {};
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  // §12.1 "활성 스펙 로드는 unstable_cache + revalidateTag" — 드래프트가 아니라 배포된
  // 리비전만 읽는다. 관리자가 편집 중인 미배포 변경은 여기 절대 보이면 안 된다.
  const spec = await getActiveSpec();

  if (!spec) {
    return (
      <NoticeScreen
        icon={<LayoutDashboard />}
        title="아직 배포된 구성이 없습니다"
        description="관리자 모드에서 페이지를 구성하고 배포하세요."
        actionHref="/admin"
        actionLabel="관리자 모드로 이동"
      />
    );
  }

  const activePage = findActivePage(spec, slug);

  if (!activePage) {
    return (
      <NoticeScreen
        icon={<FileQuestion />}
        title="페이지를 찾을 수 없습니다"
        description="주소를 다시 확인하거나 홈으로 돌아가세요."
        actionHref="/home"
        actionLabel="홈으로"
      />
    );
  }

  const tree = buildPublishedPageTree(spec);
  const breadcrumbItems = buildBreadcrumb(tree, activePage.id);

  // 조회 기간을 먼저 확정한다 — 이 페이지의 모든 바인딩이 같은 기간 위에서 조회되어야
  // 지표끼리 서로 다른 구간을 보는 일이 없다.
  const periodFilter = findPeriodFilter(activePage.nodes);
  const period = periodFilter
    ? resolvePeriod(query, (periodFilter.props.defaultPreset as PeriodPresetKey | undefined) ?? DEFAULT_PERIOD_PRESET)
    : null;
  // 주소의 모든 문자열 파라미터가 바인딩 필터의 `주소 쿼리` 소스가 된다 — 기간(from/to)뿐 아니라
  // 선택(sel)·상태 필터(status 등)도 같은 길을 쓴다. 값은 SQL에 이어 붙이지 않고 항상 파라미터로
  // 바인딩되며, 어떤 컬럼에 걸릴지는 오직 설계(바인딩 필터의 fieldId)가 정한다 — 그래서
  // 주소에 무엇이 들어와도 설계가 허용한 컬럼 밖으로 나갈 수 없다.
  const queryParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') queryParams[key] = value;
  }
  // 기간은 서버가 확정한 값이 우선이다(프리셋 → from/to 환산 결과가 주소의 원본 값보다 정확하다).
  // `today`도 서버가 넣는다 — "마감이 지난 건", "오늘 반입 예정" 같은 조건은 설계에 날짜를 박을 수
  // 없고 클라이언트가 계산하면 자정 근처에 서버와 어긋난다. 주소로 덮어쓸 수 없게 뒤에 둔다.
  const runtimeParams = {
    ...queryParams,
    ...(period ? periodQueryValues(period) : {}),
    today: toIsoDate(new Date()),
    // "마감이 다가온 건"을 설계에서 표현하려면 오늘 말고 기준선이 하나 더 필요하다.
    // 며칠을 임박으로 볼지는 업무 규칙이라 설계가 아니라 여기 한 곳에 둔다.
    soon: toIsoDate(new Date(Date.now() + TAT_SOON_DAYS * 86_400_000)),
  };

  // §12.2 "바인딩 데이터는 서버에서 미리 조회해 초기 렌더에 포함" — 노드별로 병렬 조회한다.
  const bindingEntries = await Promise.all(
    activePage.nodes.map(async (n) => [n.id, await resolveBindingData(spec, n.binding, 1, runtimeParams)] as const)
  );
  const bindingData: Record<string, unknown> = Object.fromEntries(bindingEntries);
  // 기간 필터에게는 "지금 적용된 기간"이 곧 서버가 준비해 준 데이터다. 클라이언트가 다시
  // 계산하지 않게 해서 서버 렌더와 어긋날 여지를 없앤다.
  if (periodFilter && period) bindingData[periodFilter.id] = period;

  return (
    <>
      {/* 이 화면이 브라우저에 실제로 뜬 순간을 한 번 기록한다('접속자 통계'가 읽는 유일한 원본).
          서버 렌더 중에 남기지 않는 이유는 VisitTracker의 주석 참고. */}
      <VisitTracker slug={activePage.slug} />
      <AppHeader breadcrumbItems={breadcrumbItems} />
      {/* 폭이 좁을수록 여백을 줄인다 — 320px 창에서 좌우 24px씩은 본문의 15%를 먹는다. */}
      <div className={cn('flex-1 overflow-y-auto p-3 sm:p-6', GLASS_PAGES.has(activePage.slug) && 'liquid-glass')}>
        <RuntimeRenderer
          nodes={activePage.nodes}
          bindingData={bindingData}
          routeParams={queryParams}
          asideVisible={activePage.asideVisible}
          cols={activePage.layout.cols}
          rowHeight={activePage.layout.rowHeight}
          gap={activePage.layout.gap}
        />
      </div>
    </>
  );
}
