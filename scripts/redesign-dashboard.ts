/**
 * Claim 종합 현황 재배치 — 차트 종류 · 카드 폭 · 색 체계 (사용자 디자인 리뷰 ③④⑤⑧).
 *
 * 고치는 것:
 *   ⑥ 항목이 많은 분포(Fail Mode 10종 · 고객사 8종)는 **가로 막대**로. 세로 막대는 이름을
 *      가로축에 늘어놓아야 해서 -35°~-60°로 기울고 서로 겹쳐 읽기 어려웠다.
 *   ⑤ 데이터 개수와 카드 크기를 맞춘다. 4개짜리 제품군 차트가 가장 넓고 10개짜리 Fail Mode가
 *      좁아, 정보 밀도와 자리가 거꾸로였다.
 *   ⑧ 그리드 리듬에 기준을 준다: **핵심 추이는 넓게(6칸), 세부 분포는 좁게(4칸)**.
 *   ④ 색을 의미로 나눈다. 접수량=파랑, 불량=주황, 고객사=보라, 완료/인계=초록, 중립=회색.
 *
 * 몇 번 실행해도 안전하다. 초안(draft)만 고치므로 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/redesign-dashboard.ts
 */
// tsx로 직접 실행하는 유지보수 스크립트라 server-only 모듈(@/lib/db/prisma)을 쓰지 않는다.
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

const PAGE_SLUG = 'claim-dashboard';

/**
 * 제목별 새 설정. `col`/`span`은 12칼럼 기준, `row`는 위에서부터 쌓는 순서를 그대로 반영한다.
 * (행 번호는 아래에서 자동으로 이어 붙인다 — 사람이 세지 않게.)
 */
type Plan = { title: string; span: number; rowSpan: number; chartType?: string; color?: string };

/** 위 → 아래 순서. 같은 묶음(band) 안의 항목이 한 줄에 나란히 놓인다. */
const BANDS: Plan[][] = [
  // 지표 4개 — 한 줄, 같은 크기.
  [
    { title: '총 접수 Claim', span: 3, rowSpan: 6, color: 'primary' },
    { title: '분석 진행 중', span: 3, rowSpan: 6, color: 'primary' },
    { title: '평균 TAT', span: 3, rowSpan: 6, color: 'warning' },
    { title: '개발실 인계', span: 3, rowSpan: 6, color: 'positive' },
  ],
  // 핵심 추이 — 화면에서 가장 넓게. 시계열은 선이 맞다.
  [
    { title: '월별 Claim 접수 추이', span: 6, rowSpan: 13, chartType: 'line', color: 'primary' },
    { title: '주별 Claim 접수 추이', span: 6, rowSpan: 13, chartType: 'line', color: 'primary' },
  ],
  // 세부 분포 — 항목 수에 맞춰 폭을 준다. 많은 쪽은 가로 막대로 눕힌다.
  [
    // 4종뿐이라 좁아도 충분하다(예전에는 여기가 제일 넓었다).
    { title: '제품군별 접수', span: 3, rowSpan: 13, chartType: 'bar', color: 'primary' },
    { title: 'Fail Mode 분포', span: 5, rowSpan: 13, chartType: 'bar-horizontal', color: 'warning' },
    { title: '고객사별 접수', span: 4, rowSpan: 13, chartType: 'bar-horizontal', color: 'accent' },
  ],
  [
    { title: '월별 평균 TAT 추이 (3개월 이동평균)', span: 8, rowSpan: 13, color: 'warning' },
    // Y/N 두 값뿐 — 가장 좁게.
    { title: '개발실 상세분석 인계 비율(Y/N)', span: 4, rowSpan: 13, chartType: 'bar', color: 'positive' },
  ],
  [{ title: '최근 접수 Claim', span: 12, rowSpan: 24 }],
  [{ title: 'TAT 20일 초과 건 (지연 관리 대상)', span: 12, rowSpan: 22 }],
];

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

type Json = Record<string, unknown>;

async function main() {
  const page = await prisma.page.findFirst({ where: { slug: PAGE_SLUG } });
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${PAGE_SLUG}`);

  const nodes = await prisma.componentNode.findMany({ where: { pageId: page.id, region: 'main' } });
  const byTitle = new Map<string, (typeof nodes)[number]>();
  for (const n of nodes) {
    const title = String((JSON.parse(n.propsJson) as Json).title ?? '');
    if (title) byTitle.set(title, n);
  }

  // 제목·기간 필터는 손대지 않는다 — 그 아래부터 다시 쌓는다.
  const header = nodes
    .filter((n) => n.type === 'page-title' || n.type === 'date-range-filter')
    .sort((a, b) => a.gridRow - b.gridRow);
  let row = header.reduce((max, n) => Math.max(max, n.gridRow + n.gridRowSpan), 1);

  let moved = 0;
  for (const band of BANDS) {
    let col = 1;
    const bandHeight = Math.max(...band.map((p) => p.rowSpan));
    for (const plan of band) {
      const node = byTitle.get(plan.title);
      if (!node) {
        console.log(` ! 못 찾음: ${plan.title}`);
        continue;
      }
      const props = JSON.parse(node.propsJson) as Json;
      const nextProps = { ...props };
      if (plan.chartType) nextProps.chartType = plan.chartType;
      if (plan.color) nextProps.color = plan.color;

      await prisma.componentNode.update({
        where: { id: node.id },
        data: {
          gridCol: col,
          gridSpan: plan.span,
          gridRow: row,
          gridRowSpan: plan.rowSpan,
          propsJson: JSON.stringify(nextProps),
        },
      });
      console.log(
        ` · ${plan.title} — ${plan.span}칸 · ${plan.rowSpan}줄` +
          (plan.chartType ? ` · ${plan.chartType}` : '') +
          (plan.color ? ` · ${plan.color}` : '')
      );
      col += plan.span;
      moved++;
    }
    row += bandHeight;
  }

  console.log(`\n완료: ${moved}개 컴포넌트 재배치. 반영하려면 배포하세요.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
