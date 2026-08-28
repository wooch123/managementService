import fs from 'node:fs';
const apply = (file, from, to, label) => {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(from)) { console.error('MISSING:', label); process.exit(1); }
  fs.writeFileSync(file, s.replace(from, to));
};

apply('scripts/blueprint-lib.ts',
`  /** data-table의 칸 서식을 select 순서대로 덮어쓴다(비우면 칸 타입에서 정한다). null은 '기본값 그대로'. */
  formats?: (CellFormat | null)[];`,
`  /** data-table의 칸 서식을 select 순서대로 덮어쓴다(비우면 칸 타입에서 정한다). null은 '기본값 그대로'. */
  formats?: (CellFormat | null)[];
  /**
   * 바인딩 말고 **전용 창구로** 읽고 쓰는 표들(테이블명).
   *
   * 화면 하나가 표 여러 개를 오가며 문서 단위로 저장하는 경우(Tech Report)는 바인딩 하나로
   * 표현되지 않는다. 그래도 관계도가 그 의존을 모르면 "아무도 안 쓰는 표"로 그려지므로,
   * 실제로 읽는 표를 여기에 적어 관계로 남긴다.
   */
  reads?: string[];`,
  'NodePlan.reads');

apply('scripts/apply-site.mts',
`    if (node.bind) {
      relations.push({ fromType: 'COMPONENT', fromId: id, toType: 'ENTITY', toId: entityOf(schema, node.bind.table).id, kind: 'READS' });
    }`,
`    if (node.bind) {
      relations.push({ fromType: 'COMPONENT', fromId: id, toType: 'ENTITY', toId: entityOf(schema, node.bind.table).id, kind: 'READS' });
    }
    // 바인딩 대신 전용 창구로 읽는 표들(NodePlan.reads) — 관계도가 그 의존을 알아야 한다.
    for (const table of node.reads ?? []) {
      relations.push({ fromType: 'COMPONENT', fromId: id, toType: 'ENTITY', toId: entityOf(schema, table).id, kind: 'READS' });
    }`,
  'apply-site reads');

apply('scripts/site-design.ts',
`      {
        type: 'tech-report',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 90,`,
`      {
        type: 'tech-report',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 90,
        // 바인딩이 아니라 전용 창구(/api/runtime/tech-report)로 오간다 — 관계도에는 남긴다.
        reads: ['far_table', 'tech_report', 'tech_report_sample'],`,
  'tech-report reads');
console.log('ok');
