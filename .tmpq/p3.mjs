import fs from 'node:fs';
const apply = (file, from, to, label) => {
  const s = fs.readFileSync(file, 'utf8');
  if (!s.includes(from)) { console.error('MISSING:', label); process.exit(1); }
  fs.writeFileSync(file, s.replace(from, to));
};

// printing 상태 추가
apply('src/components/runtime/TechReport.tsx',
  `  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);`,
  `  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 인쇄하는 동안만 참 — 이때는 모든 sample 탭을 펼쳐 둔다(exportPdf 주석 참고). */
  const [printing, setPrinting] = useState(false);`,
  'printing state');

// 탭 패널: 인쇄 중에는 감추지 않는다
apply('src/components/runtime/TechReport.tsx',
  `          <div key={s.sample_no} hidden={index !== active} className="tech-report-tabpanel" role="tabpanel">`,
  `          <div key={s.sample_no} hidden={!printing && index !== active} className="tech-report-tabpanel" role="tabpanel">`,
  'panel hidden');

// 이제 CSS로 되살리는 규칙은 이길 수 없으므로 뺀다
apply('src/app/globals.css',
  `  /* 숨겨 둔 sample 탭을 모두 펼친다. */
  html.tech-report-printing .tech-report-tabpanel[hidden] {
    display: block !important;
  }
  html.tech-report-printing .tr-print-only {`,
  `  /* 감춰 둔 sample 탭은 **CSS로 되살릴 수 없다** — Tailwind 기본 규칙이 \`@layer base\`에서
     \`[hidden] { display: none !important }\`를 걸고, 중요 선언끼리는 레이어 안이 레이어 밖을
     이기기 때문이다(실측 확인). 그래서 인쇄하는 동안만 React가 \`hidden\`을 떼어 낸다
     (TechReport.tsx의 exportPdf). */
  html.tech-report-printing .tr-print-only {`,
  'print reveal rule');
console.log('ok');
