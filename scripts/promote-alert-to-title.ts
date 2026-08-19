/**
 * 각 화면 맨 위의 (i) 안내 상자를 **페이지 제목**으로 승격한다.
 *
 * 화면마다 첫 줄에 "제목 + 한 줄 설명"이 담긴 알림 상자가 있었다. 내용은 제목인데 모양은
 * 경고/안내 상자여서, 실제 데이터가 나오기도 전에 세로 공간을 3~4줄씩 차지하고 상단이
 * 제목 → 안내문 → 조회 기간 → KPI로 잘게 쪼개져 보였다(사용자 디자인 리뷰 ①).
 *
 * 하는 일:
 *   1. alert 노드를 page-title 노드로 바꾼다(제목·설명은 그대로 옮긴다).
 *   2. 제목은 상자보다 낮으므로 차지하던 줄 수를 줄이고, **그 아래 컴포넌트를 그만큼 끌어올린다**.
 *
 * 몇 번 실행해도 안전하다 — 이미 바뀐 화면은 건너뛴다.
 * 이 스크립트는 초안(draft)만 고친다. 운영 화면에 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/promote-alert-to-title.ts
 */
// tsx로 직접 실행하는 유지보수 스크립트라 server-only 모듈(@/lib/db/prisma)을 쓰지 않는다.
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

/** 제목이 차지할 줄 수. 카드 테두리가 없어 상자보다 낮아도 된다. */
const TITLE_ROW_SPAN = 2;

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

async function main() {
  const alerts = await prisma.componentNode.findMany({ where: { type: 'alert' }, orderBy: { gridRow: 'asc' } });
  if (alerts.length === 0) {
    console.log('바꿀 알림 상자가 없습니다(이미 승격되었을 수 있습니다).');
    return;
  }

  let changed = 0;
  for (const alert of alerts) {
    const props = JSON.parse(alert.propsJson) as { title?: string; description?: string };
    const page = await prisma.page.findUnique({ where: { id: alert.pageId } });
    const shrink = alert.gridRowSpan - TITLE_ROW_SPAN;

    await prisma.$transaction(async (tx) => {
      await tx.componentNode.update({
        where: { id: alert.id },
        data: {
          type: 'page-title',
          gridRowSpan: TITLE_ROW_SPAN,
          propsJson: JSON.stringify({ title: props.title ?? '', description: props.description ?? '' }),
        },
      });
      // 줄어든 만큼 아래 컴포넌트를 끌어올린다 — 안 그러면 제목 아래에 빈 칸이 남는다.
      if (shrink > 0) {
        await tx.componentNode.updateMany({
          where: {
            pageId: alert.pageId,
            region: alert.region,
            gridRow: { gte: alert.gridRow + alert.gridRowSpan },
          },
          data: { gridRow: { decrement: shrink } },
        });
      }
    });

    changed++;
    console.log(` · ${page?.slug ?? alert.pageId} — "${props.title ?? ''}" (${alert.gridRowSpan}줄 → ${TITLE_ROW_SPAN}줄, 아래 ${shrink}줄 끌어올림)`);
  }

  console.log(`\n완료: ${changed}개 화면. 반영하려면 배포하세요.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
