import fs from 'node:fs';
const p = 'scripts/site-design.ts';
let s = fs.readFileSync(p, 'utf8');
const apply = (from, to, label) => {
  if (!s.includes(from)) { console.error('MISSING:', label); process.exit(1); }
  s = s.replace(from, to);
};

apply(
  `        unbuilt('tech-report', 'Tech Report 작성', 'file-text', '분석 결과를 Tech Report로 작성하는 자리입니다'),`,
  `        techReport(),`,
  'tech-report child'
);
apply(
  `        { title: 'Tech Report 작성', description: '미구현', slug: 'tech-report', meta: '' },`,
  `        { title: 'Tech Report 작성', description: 'FAR 불러오기 · sample별 작성 · PDF 발행', slug: 'tech-report', meta: '' },`,
  'intake hub card'
);

const anchor = `/** ③-1 Reball 의뢰서 작성 — 작업 항목을 고르면 단가표를 참조해 가격이 자동으로 계산된다. */`;
const added = `/**
 * ②-4 Tech Report 작성 — 양식(\`sample page/tech report page.html\`)의 배치를 그대로 옮겼다.
 *
 * 화면 전체가 컴포넌트 하나다. 카드 스무 장으로 쪼개지 않은 이유는 TechReport.tsx의 주석 참고 —
 * FAR No 하나를 불러오면 모든 탭이 함께 채워지고, 어느 칸을 고치든 같은 문서가 저장되며,
 * 내보내기는 탭 전체를 한 번에 인쇄한다. 셋 다 화면을 가로지르는 동작이다.
 */
function techReport(): SitePage {
  return {
    slug: 'tech-report',
    title: 'Tech Report 작성',
    icon: 'file-text',
    nodes: [
      {
        type: 'tech-report',
        col: 1,
        span: 12,
        row: 1,
        rowSpan: 90,
        props: {
          title: '',
          description:
            'FAR No를 불러오면 원장의 분석값이 sample 탭에 채워집니다. 고친 값은 바로 저장되고, 다시 불러오면 그대로 열립니다.',
        },
      },
    ],
  };
}

` + anchor;
apply(anchor, added, 'techReport function');
fs.writeFileSync(p, s);
console.log('ok');
