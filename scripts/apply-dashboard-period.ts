/**
 * Claim 종합 현황 대시보드에 조회 기간을 붙인다.
 *
 * 하는 일:
 *  1. 화면 맨 위(제목 배너 바로 아래)에 '기간 필터' 컴포넌트를 놓고, 아래 컴포넌트들을 그만큼 내린다.
 *  2. Claim 접수 데이터를 보는 모든 컴포넌트의 바인딩에 `접수일 ≥ from` · `접수일 ≤ to` 조건을 건다.
 *     값은 주소의 쿼리에서 온다(`source: 'query'`) — 기간 필터가 그 값을 넣어 준다.
 *  3. 추이 3종(월별·주별 접수, 월별 평균 TAT)을 **미리 집계해 둔 표(claim_trend)가 아니라
 *     원본 claims에서 날짜로 묶어** 만들도록 바꾼다. 미리 집계한 표는 만들어 둔 구간(최근 12개월/12주)만
 *     갖고 있어서 기간을 바꿔도 따라오지 못한다.
 *
 * 몇 번 실행해도 안전하다 — 기간 필터가 이미 있으면 배치는 건드리지 않고 바인딩만 다시 맞춘다.
 * 이 스크립트는 **초안(draft)** 만 고친다. 운영 화면에 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/apply-dashboard-period.ts
 */
// tsx로 직접 실행하는 유지보수 스크립트라 server-only 모듈(@/lib/db/prisma)을 쓰지 않는다.
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

const PAGE_SLUG = 'claim-dashboard';
const CLAIM_ENTITY = 'Claim접수';
const RECEIVED_DATE = 'received_date';
const TAT_DAYS = 'tat_days';
const FILTER_TYPE = 'date-range-filter';
/** 기간 필터가 차지할 행 수 — 아래 컴포넌트들은 이만큼 내려간다. */
const FILTER_ROW_SPAN = 3;
/** 추이 차트가 그릴 최대 시점 수. 기간이 아주 넓으면 최근 쪽부터 이만큼만 그린다. */
const TREND_LIMIT = 60;

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

type Json = Record<string, unknown>;

async function main() {
  const page = await prisma.page.findFirst({ where: { slug: PAGE_SLUG } });
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${PAGE_SLUG}`);

  const entity = await prisma.entity.findFirst({ where: { name: CLAIM_ENTITY }, include: { fields: true } });
  if (!entity) throw new Error(`엔티티를 찾을 수 없습니다: ${CLAIM_ENTITY}`);

  const fieldId = (columnName: string) => {
    const field = entity.fields.find((f) => f.columnName === columnName);
    if (!field) throw new Error(`필드를 찾을 수 없습니다: ${columnName}`);
    return field.id;
  };
  const receivedDateId = fieldId(RECEIVED_DATE);
  const tatDaysId = fieldId(TAT_DAYS);

  /** 기간 조건 — 주소에 값이 없으면 런타임이 이 조건을 걸지 않는다(= 전체 조회). */
  const periodFilters = [
    { fieldId: receivedDateId, op: 'gte', source: 'query', ref: 'from' },
    { fieldId: receivedDateId, op: 'lte', source: 'query', ref: 'to' },
  ];

  const nodes = await prisma.componentNode.findMany({ where: { pageId: page.id }, orderBy: { order: 'asc' } });
  const titleOf = (n: (typeof nodes)[number]) => String((JSON.parse(n.propsJson) as Json).title ?? '');

  // ── 1. 기간 필터 배치 ───────────────────────────────────────────────────────
  const existing = nodes.find((n) => n.type === FILTER_TYPE);
  if (existing) {
    console.log(`기간 필터가 이미 있습니다(${existing.id}) — 배치는 그대로 두고 바인딩만 맞춥니다.`);
  } else {
    // 제목 배너(맨 위 컴포넌트) 바로 아래 줄에 넣는다.
    const banner = nodes.filter((n) => !n.parentNodeId && n.region === 'main').sort((a, b) => a.gridRow - b.gridRow)[0];
    const insertRow = banner ? banner.gridRow + banner.gridRowSpan : 1;
    const insertOrder = banner ? banner.order + 1 : 0;

    await prisma.$transaction([
      // 아래에 있던 것들을 기간 필터가 차지할 만큼 내린다(우측 패널은 자기 그리드라 건드리지 않는다).
      prisma.componentNode.updateMany({
        where: { pageId: page.id, region: 'main', gridRow: { gte: insertRow } },
        data: { gridRow: { increment: FILTER_ROW_SPAN } },
      }),
      prisma.componentNode.updateMany({
        where: { pageId: page.id, order: { gte: insertOrder } },
        data: { order: { increment: 1 } },
      }),
      prisma.componentNode.create({
        data: {
          pageId: page.id,
          type: FILTER_TYPE,
          order: insertOrder,
          gridCol: 1,
          gridSpan: 12,
          gridRow: insertRow,
          gridRowSpan: FILTER_ROW_SPAN,
          region: 'main',
          propsJson: JSON.stringify({ title: '조회 기간', defaultPreset: '3m', showPresets: true, showCustom: true }),
          eventsJson: '{}',
        },
      }),
    ]);
    console.log(`기간 필터를 ${insertRow}행에 배치하고 아래 컴포넌트를 ${FILTER_ROW_SPAN}행 내렸습니다.`);
  }

  // ── 2. 추이 3종을 원본 claims에서 날짜로 묶어 만들게 바꾼다 ────────────────
  const trendBindings: Record<string, Json> = {
    '월별 Claim 접수 추이': {
      mode: 'group',
      entityId: entity.id,
      groupFieldId: receivedDateId,
      groupTransform: 'month',
      fn: 'count',
      filters: periodFilters,
      orderBy: 'label',
      limit: TREND_LIMIT,
    },
    '주별 Claim 접수 추이': {
      mode: 'group',
      entityId: entity.id,
      groupFieldId: receivedDateId,
      groupTransform: 'week',
      fn: 'count',
      filters: periodFilters,
      orderBy: 'label',
      limit: TREND_LIMIT,
    },
    '월별 평균 TAT 추이 (3개월 이동평균)': {
      mode: 'group',
      entityId: entity.id,
      groupFieldId: receivedDateId,
      groupTransform: 'month',
      fn: 'avg',
      valueFieldId: tatDaysId,
      filters: periodFilters,
      orderBy: 'label',
      limit: TREND_LIMIT,
    },
  };

  // ── 3. 바인딩에 기간 조건 걸기 ─────────────────────────────────────────────
  let rewritten = 0;
  for (const node of nodes) {
    if (node.type === FILTER_TYPE) continue;

    const trend = trendBindings[titleOf(node)];
    if (trend) {
      await prisma.componentNode.update({ where: { id: node.id }, data: { bindingJson: JSON.stringify(trend) } });
      rewritten++;
      console.log(` · ${titleOf(node)} → claims 날짜 묶음(${trend.groupTransform})으로 전환`);
      continue;
    }

    if (!node.bindingJson) continue;
    const binding = JSON.parse(node.bindingJson) as Json;
    // Claim 접수 데이터를 보는 컴포넌트만 대상이다(다른 엔티티에는 접수일 컬럼이 없다).
    if (binding.entityId !== entity.id) continue;
    if (!Array.isArray(binding.filters)) continue;

    const kept = (binding.filters as Json[]).filter((f) => f.source !== 'query' || (f.ref !== 'from' && f.ref !== 'to'));
    const next = { ...binding, filters: [...kept, ...periodFilters] };
    if (JSON.stringify(next) === node.bindingJson) continue;

    await prisma.componentNode.update({ where: { id: node.id }, data: { bindingJson: JSON.stringify(next) } });
    rewritten++;
    console.log(` · ${titleOf(node) || node.type} → 기간 조건 적용`);
  }

  // ── 4. 배너 설명에 기간이 적용된다는 사실을 적는다 ─────────────────────────
  const banner = nodes.find((n) => n.type === 'alert');
  if (banner) {
    const props = JSON.parse(banner.propsJson) as Json;
    const description = '상단에서 고른 기간의 Claim 접수 건을 대상으로 집계합니다. 접수부터 FA 분석 · Reball · 개발실 의뢰까지의 현황을 한 화면에서 확인합니다.';
    if (props.description !== description) {
      await prisma.componentNode.update({
        where: { id: banner.id },
        data: { propsJson: JSON.stringify({ ...props, description }) },
      });
      console.log(' · 제목 배너 설명 갱신');
    }
  }

  console.log(`\n완료: 바인딩 ${rewritten}개를 갱신했습니다. 반영하려면 배포하세요.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
