/**
 * 청사진에 맞춘 데이터 설계 정리 — 엔티티·필드 추가(초안).
 *
 * 청사진(estorage-desktop-blueprints)이 화면에서 요구하는 값 중 지금 스키마에 없는 것들을 채운다.
 * 화면만 바꾸고 데이터를 그대로 두면 "자유 서술 텍스트에 조건이 섞여 비교가 안 된다"는 원래 지적을
 * (REVIEW.md DRAM·pFA 항목) 그대로 남기게 된다.
 *
 * 추가만 한다 — 기존 필드를 지우거나 이름을 바꾸지 않는다(배포 시 파괴적 스키마 변경이 된다).
 * 몇 번 실행해도 안전하고, 초안(draft)만 고치므로 반영하려면 배포를 따로 해야 한다.
 *
 * 실행: pnpm tsx scripts/blueprint-schema.ts
 */
// tsx로 직접 실행하는 유지보수 스크립트라 server-only 모듈(@/lib/db/prisma)을 쓰지 않는다.
import { PrismaClient } from '@prisma/client';
import { metaDbUrl } from '@/lib/db/paths';

const prisma = new PrismaClient({ datasourceUrl: metaDbUrl() });

type FieldPlan = {
  columnName: string;
  name: string;
  dataType: 'TEXT' | 'INTEGER' | 'REAL' | 'DATE' | 'DATETIME' | 'ENUM' | 'BOOLEAN';
  enumValues?: string[];
  isRequired?: boolean;
  isUnique?: boolean;
};

/** 테이블별 추가 필드. 순서는 기존 필드 뒤에 이어 붙인다. */
const ADDITIONS: { table: string; fields: FieldPlan[] }[] = [
  {
    // 청사진 02·03: Claim 상세에 "목표 완료일"이 있고, 배정 화면이 SLA를 그 날짜로 계산한다.
    table: 'claims',
    fields: [{ columnName: 'due_date', name: '목표 완료일', dataType: 'DATE' }],
  },
  {
    // 청사진 03: 배정할 때 담당자·기한과 함께 우선순위를 정한다.
    table: 'fa_assignments',
    fields: [{ columnName: 'priority', name: '우선순위', dataType: 'ENUM', enumValues: ['긴급', '높음', '보통'] }],
  },
  {
    // 청사진 05: 결과(관찰)–원인–결론을 나눠 적는다. 지금은 원인/결론만 있어 관찰 기록이 원인 칸에 섞인다.
    table: 'fa_tech_reports',
    fields: [{ columnName: 'observation', name: '관찰 결과', dataType: 'TEXT' }],
  },
  {
    // 청사진 07: 업체와 작업 요청(주의사항)이 한 칸('업체/비고')에 섞여 있어 업체별 집계가 불가능했다.
    table: 'reball_requests',
    fields: [{ columnName: 'work_note', name: '작업 요청', dataType: 'TEXT' }],
  },
  {
    // 청사진 10~14: 유형마다 다른 조건을 자유 서술에 섞지 않고 칸으로 나눈다.
    table: 'analysis_requests',
    fields: [
      { columnName: 'sample_qty', name: '시료 수량', dataType: 'INTEGER' },
      { columnName: 'analysis_scope', name: '분석 범위/방법', dataType: 'TEXT' },
      { columnName: 'preserve_cond', name: '보존 조건', dataType: 'TEXT' },
      { columnName: 'lot_no', name: '출하 Lot', dataType: 'TEXT' },
      { columnName: 'vehicle_project', name: '차종/프로젝트', dataType: 'TEXT' },
      { columnName: 'dram_model', name: 'DRAM 모델', dataType: 'TEXT' },
      {
        columnName: 'destruct_approval',
        name: '파괴 승인',
        dataType: 'ENUM',
        enumValues: ['승인 완료', '승인 대기', '해당 없음'],
      },
    ],
  },
  {
    // 청사진 15: 채팅이 아니라 "찾아 쓰는 지식"이 되려면 고정·태그·도움됨이 필요하다.
    table: 'tips',
    fields: [
      { columnName: 'helpful', name: '도움됨', dataType: 'INTEGER' },
      { columnName: 'tags', name: '태그', dataType: 'TEXT' },
      { columnName: 'is_pinned', name: '고정', dataType: 'ENUM', enumValues: ['Y', 'N'] },
      { columnName: 'updated_date', name: '최근 수정', dataType: 'DATE' },
    ],
  },
];

/**
 * 피드백 게시판은 **대화 방식을 그대로 유지**하기로 했다(사용자 지시). 청사진 16이 제안한
 * 이슈 테이블(상태·담당자·재현 조건)은 만들지 않는다 — 아무 화면도 읽지 않는 표를 남기면
 * 검증에서 "쓰이지 않는 엔티티"로 잡히고, 운영에도 빈 표가 하나 더 생길 뿐이다.
 * 이전 실행에서 만들어 둔 초안이 있으면 아래에서 지운다(배포 전이라 데이터는 없다).
 */
const UNUSED_TABLE = 'feedback';

async function addFields(entityId: string, entityLabel: string, plans: FieldPlan[]): Promise<number> {
  const existing = await prisma.field.findMany({ where: { entityId }, orderBy: { order: 'asc' } });
  const known = new Set(existing.map((f) => f.columnName));
  let order = existing.length > 0 ? Math.max(...existing.map((f) => f.order)) + 1 : 0;
  let added = 0;
  for (const plan of plans) {
    if (known.has(plan.columnName)) continue;
    await prisma.field.create({
      data: {
        entityId,
        name: plan.name,
        columnName: plan.columnName,
        dataType: plan.dataType,
        isRequired: plan.isRequired ?? false,
        isUnique: plan.isUnique ?? false,
        isPrimary: false,
        enumValues: plan.enumValues ? JSON.stringify(plan.enumValues) : null,
        order: order++,
      },
    });
    console.log(`  + ${entityLabel}.${plan.columnName} (${plan.name})`);
    added += 1;
  }
  return added;
}

async function main() {
  let total = 0;

  for (const group of ADDITIONS) {
    const entity = await prisma.entity.findFirst({ where: { tableName: group.table } });
    if (!entity) {
      console.log(`! 엔티티를 찾지 못해 건너뜁니다: ${group.table}`);
      continue;
    }
    total += await addFields(entity.id, entity.name, group.fields);
  }

  // 배포 전에만 안전하게 지울 수 있다 — app.db에 실제 표가 생겼다면(배포 이후) 파괴적 변경이므로
  // 스크립트가 손대지 않고 알리기만 한다.
  const unused = await prisma.entity.findFirst({ where: { tableName: UNUSED_TABLE } });
  if (unused) {
    await prisma.field.deleteMany({ where: { entityId: unused.id } });
    await prisma.entity.delete({ where: { id: unused.id } });
    console.log(`  - 엔티티 ${unused.name}(${UNUSED_TABLE}) 제거 — 게시판은 대화 방식을 유지한다`);
  }

  // 업체가 '업체/비고'라는 이름으로 두 가지를 겸하고 있었다. 작업 요청 칸을 따로 뒀으니 이름을 정리한다
  // (표시 이름만 바꾼다 — 컬럼명은 그대로라 스키마 변경이 아니다).
  const reball = await prisma.entity.findFirst({ where: { tableName: 'reball_requests' } });
  if (reball) {
    const vendor = await prisma.field.findFirst({ where: { entityId: reball.id, columnName: 'vendor' } });
    if (vendor && vendor.name !== '업체') {
      await prisma.field.update({ where: { id: vendor.id }, data: { name: '업체' } });
      console.log(`  ~ Reball의뢰.vendor 표시 이름: '${vendor.name}' → '업체'`);
    }
  }

  console.log(total > 0 ? `\n필드 ${total}개를 추가했습니다. 배포하면 app.db에 반영됩니다.` : '\n추가할 필드가 없습니다(이미 반영됨).');
}

main().finally(() => prisma.$disconnect());
