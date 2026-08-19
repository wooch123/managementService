/**
 * Claim 종합 현황의 지표 타일에 **직전 기간 대비 증감**을 켠다.
 *
 * 숫자 하나만 크게 띄우면 419건이 많은 건지 적은 건지 알 수 없다 — 상태나 추세가 없어 단순
 * 집계값으로만 읽힌다(사용자 디자인 리뷰 ③). 조회 기간과 같은 길이의 직전 구간을 함께 세어
 * 화살표와 %를 붙인다.
 *
 * 몇 번 실행해도 안전하다. 초안(draft)만 고치므로 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/enable-kpi-compare.ts
 */
// tsx로 직접 실행하는 유지보수 스크립트라 server-only 모듈(@/lib/db/prisma)을 쓰지 않는다.
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

const PAGE_SLUG = 'claim-dashboard';

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

type Json = Record<string, unknown>;

async function main() {
  const page = await prisma.page.findFirst({ where: { slug: PAGE_SLUG } });
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${PAGE_SLUG}`);

  const nodes = await prisma.componentNode.findMany({ where: { pageId: page.id } });
  let changed = 0;

  for (const node of nodes) {
    if (!node.bindingJson) continue;
    const binding = JSON.parse(node.bindingJson) as Json;
    if (binding.mode !== 'aggregate' || binding.compare === true) continue;

    const title = String((JSON.parse(node.propsJson) as Json).title ?? '');
    await prisma.componentNode.update({
      where: { id: node.id },
      data: { bindingJson: JSON.stringify({ ...binding, compare: true }) },
    });
    changed++;
    console.log(` · ${title} — 직전 기간 비교 켬`);
  }

  console.log(`\n완료: ${changed}개 지표. 반영하려면 배포하세요.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
