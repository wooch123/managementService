import 'server-only';
import { THEMES } from '@/lib/theme/palettes';
import { readReportImage } from '@/lib/far/report-uploads';
import {
  IMAGE_SLOTS,
  META_SLOTS,
  NAND_LOT_COLUMNS,
  PERF_ROWS,
  RTBB_COLUMNS,
  type TechReportDoc,
  type TechReportSample,
} from '@/lib/far/tech-report-fields';

/**
 * PDF로 인쇄할 Tech Report 문서를 HTML로 짓는다 — **발행물의 모양은 여기서만 정해진다**.
 *
 * 화면과 같은 CSS를 쓰지 않는 이유가 요구사항 그 자체다: 화면은 보는 사람의 테마(밝게/어둡게)와
 * 창 폭, 브라우저 설정을 따른다. 발행물은 **누가 받아도 같아야** 한다. 그래서
 *
 *   · 색을 토큰(`var(--…)`)이 아니라 **값으로 박는다**. 어두운 테마에서 받아도 흰 종이다.
 *   · `color-scheme: light`를 못 박아 브라우저가 알아서 반전하지 못하게 한다.
 *   · 폭이 A4 인쇄 폭으로 고정이라 반응형 규칙이 끼어들 자리가 없다.
 *   · 그림은 주소가 아니라 **바이트를 그대로 심는다**(data URI). 서버가 자기 자신에게 다시
 *     요청하지 않으므로 포트·인증·네트워크 상태와 무관하다.
 *
 * 실제 그리기는 서버의 headless Chromium이 한 번 하고 그 결과(PDF)를 내려준다. 사람마다 다른
 * 브라우저에서 그리는 것이 아니라 **한 곳에서 그린 파일 하나**를 나눠 받는 구조다.
 */

/**
 * 발행물의 색 — **인디고 테마를 그대로 쓴다**(사용자 지정).
 *
 * 화면 테마를 따르지 않는 것이 요구사항이다: 누가 어떤 테마로 보고 있든 발행물은 같아야 한다.
 * 그래서 값을 여기서 지어내지 않고 앱이 실제로 가진 테마 정의(`lib/theme/palettes`)에서 인디고를
 * 꺼내 쓴다 — 그 팔레트가 바뀌면 발행물도 함께 따라간다.
 */
const INDIGO = THEMES.find((t) => t.id === 'indigo');
if (!INDIGO) throw new Error('인디고 테마를 찾을 수 없습니다.');

const token = (name: string, fallback: string): string => INDIGO.tokens[name] ?? fallback;

const INK = token('--foreground', '#20252b');
const MUTED = token('--muted-foreground', '#727a83');
/** 인디고에는 subtle이 따로 없다 — 표 머리글처럼 한 단계 더 물러날 자리에 muted를 함께 쓴다. */
const SUBTLE = MUTED;
const LINE = token('--border', '#e2e5e8');
const LINE_SOFT = token('--muted', '#edf0f2');
const HEAD_BG = token('--muted', '#f8f9fb');
const ACCENT = token('--primary', '#7759f4');
const PAGE_BG = token('--background', '#ffffff');
const CARD_BG = token('--card', '#ffffff');
const SLOT_BG = token('--secondary', '#f1f2f5');

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 줄바꿈을 살려서 넣는다(분석 의견은 여러 줄로 적힌다). */
function multiline(value: string): string {
  const text = escapeHtml(value).trim();
  return text === '' ? '<span class="empty">—</span>' : text.replace(/\n/g, '<br />');
}

/**
 * 그림을 data URI로 바꾼다. 못 읽으면 빈 문자열 — 그림 하나가 없다고 발행이 실패하면 안 된다.
 * 서버가 자기 주소로 다시 요청하지 않는 이유는 파일 맨 위 주석 참고.
 */
async function toDataUri(file: string): Promise<string> {
  if (!file) return '';
  const found = await readReportImage(file);
  if (!found) return '';
  return `data:${found.mimeType};base64,${found.bytes.toString('base64')}`;
}

function imageBlock(label: string, dataUri: string): string {
  const body = dataUri
    ? `<img src="${dataUri}" alt="${escapeHtml(label)}" />`
    : `<div class="slot-empty">비어 있음</div>`;
  return `<section class="card half"><h4>${escapeHtml(label)}</h4>${body}</section>`;
}

function divider(label: string): string {
  return `<div class="divider full"><span></span><b>${escapeHtml(label)}</b><span></span></div>`;
}

function gridTable(columns: readonly string[], rows: Record<string, string>[]): string {
  if (rows.length === 0) return '<p class="empty">줄 없음</p>';
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * PKG Stack에서 끌어온 Stack 정보 — **표 다음에 그림**(사용자 지정).
 *
 * 화면과 발행물이 같은 것을 보여야 하므로 여기서도 같은 순서로 그린다. 사람이 올리는 칸이
 * 아니라 Part ID로 찾아온 값이라, 어느 Part의 것인지 제목 옆에 밝힌다.
 */
async function stackBlock(label: string, stack: NonNullable<TechReportSample['stack']>): Promise<string> {
  const rows = stack.layers
    .map((l) => `<tr><td>${escapeHtml(l.ch || '—')}</td><td>${escapeHtml(l.way || '—')}</td><td>${escapeHtml(l.chip || '—')}</td></tr>`)
    .join('');
  const table = stack.layers.length
    ? `<table class="grid"><thead><tr><th>CH</th><th>WAY</th><th>Chip 차수</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="empty">적층 줄 없음</p>';
  const dataUri = await toDataUri(stack.image);
  const picture = dataUri ? `<img src="${dataUri}" alt="${escapeHtml(label)}" />` : '<div class="slot-empty">그림 없음</div>';
  return `<section class="card half"><h4>${escapeHtml(label)} <span class="from">${escapeHtml(stack.part_id)}</span></h4>${table}${picture}</section>`;
}

async function samplePage(sample: TechReportSample, index: number): Promise<string> {
  const slots = await Promise.all(
    IMAGE_SLOTS.map(async (slot) =>
      // Stack 칸에 Part ID로 찾은 값이 있으면 그것이 우선이다 — 화면과 같은 규칙이다.
      slot.key === 'stack' && sample.stack
        ? stackBlock(slot.label, sample.stack)
        : imageBlock(slot.label, await toDataUri(sample.images?.[slot.key] ?? ''))
    )
  );
  const metas = await Promise.all(
    META_SLOTS.map(async (slot) => imageBlock(slot.label, await toDataUri(sample.images?.[slot.key] ?? '')))
  );

  const perf = PERF_ROWS.map(
    (row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(sample.perf?.[row.col] ?? '')}</td></tr>`
  ).join('');

  return `
<section class="sample${index === 0 ? ' first' : ''}">
  <h2>Sample ${escapeHtml(sample.sample_no)}</h2>
  <div class="grid-12">
    <section class="card full">
      <h4>Smart Report</h4>
      <table class="vertical"><tbody>${perf}</tbody></table>
    </section>

    ${divider('rtbb information')}

    <section class="card half">
      <h4>NAND 분석 의견</h4>
      <div class="prose">${multiline(sample.nand_opinion ?? '')}</div>
    </section>
    <section class="card half">
      <h4>RTBB List</h4>
      ${gridTable(RTBB_COLUMNS, sample.rtbb_list ?? [])}
    </section>

    <section class="card full">
      <h4>NAND Lot ID</h4>
      ${gridTable(NAND_LOT_COLUMNS, sample.nand_lot_list ?? [])}
    </section>

    ${slots.join('\n')}

    ${divider('FW 분석 내용')}

    <section class="card half">
      <h4>FW 분석 의견</h4>
      <div class="prose">${multiline(sample.fw_opinion ?? '')}</div>
    </section>
    ${metas.join('\n')}
  </div>
</section>`;
}

export async function renderTechReportHtml(doc: TechReportDoc): Promise<string> {
  const [top, bottom] = await Promise.all([toDataUri(doc.visual_top), toDataUri(doc.visual_bottom)]);
  const samples = (await Promise.all(doc.samples.map((s, i) => samplePage(s, i)))).join('\n');
  const issued = new Date().toISOString().replace('T', ' ').slice(0, 16);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.far_no)} Tech Report</title>
<style>
  /* 발행물은 늘 밝은 종이다 — 받는 사람의 테마가 무엇이든 상관없다(인디고는 밝은 테마다). */
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${PAGE_BG};
    color: ${INK};
    font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  header.doc {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 2px solid ${ACCENT};
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  header.doc h1 { font-size: 16pt; font-weight: 800; letter-spacing: -0.01em; }
  header.doc .meta { color: ${MUTED}; font-size: 8.5pt; text-align: right; }

  /* 한 줄에 나란히 놓인 카드는 **높이를 맞춘다**(작은 쪽이 큰 쪽에 맞춰 늘어난다).
     격자의 기본값(stretch)이 그 일을 한다 — 예전에는 start로 눌러 두어 카드마다 높이가 달랐다. */
  .grid-12 { display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px; align-items: stretch; }
  /* 카드가 늘어난 만큼 **안의 내용도 함께 채운다** — 그러지 않으면 늘어난 카드는 아래가 텅 빈다. */
  .card {
    grid-column: span 12;
    display: flex;
    flex-direction: column;
    border: 1px solid ${LINE};
    border-radius: 14px;
    padding: 12px;
    background: ${CARD_BG};
    break-inside: avoid;
  }
  .card.half { grid-column: span 6; }
  .card.full { grid-column: span 12; }
  /* 양식의 카드 제목 — 작은 대문자 라벨을 강조색으로. */
  /* 제목 옆에 붙는 출처(Part ID) — 제목보다 물러나 있어야 한다. */
  .card h4 .from { color: ${MUTED}; font-weight: 600; text-transform: none; letter-spacing: 0; }
  .card h4 {
    flex: none;
    margin-bottom: 6px;
    color: ${ACCENT};
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .divider { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .divider.full { grid-column: span 12; }
  .divider span { flex: 1; height: 1px; background: ${LINE}; }
  .divider b {
    color: ${SUBTLE};
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid ${LINE_SOFT}; padding: 3px 5px; text-align: center; word-break: break-all; }
  /* 표 머리글은 작은 대문자 라벨 — 화면의 표와 같은 규격이다. */
  thead th {
    background: ${HEAD_BG};
    color: ${SUBTLE};
    font-size: 7pt;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  /* 칸 이름은 대문자로, 가운데 정렬(사용자 지정). */
  table.vertical th {
    width: 38%;
    background: ${HEAD_BG};
    color: ${MUTED};
    text-align: center;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  table.vertical td { font-weight: 600; }

  .prose { flex: 1 1 auto; min-height: 60px; white-space: pre-wrap; font-size: 9pt; }
  .empty { color: ${MUTED}; }
  /**
   * 양식의 그림 자리 — 점선 테두리에 옅은 면.
   *
   * 화면에서는 사선 그라데이션을 쓰지만 여기서는 평면 색이다. Chromium이 PDF를 만들 때
   * 그라데이션을 이미지로 굽는데, 빈 칸이 스물몇 개면 그것만으로 파일이 네 배가 된다
   * (실측 242KB → 943KB). 인쇄물에서 두 색의 차이는 사실상 보이지 않는다.
   */
  .slot-empty {
    display: flex; flex: 1 1 auto; align-items: center; justify-content: center;
    min-height: 90px; border: 1px dashed ${LINE}; border-radius: 9px;
    background: ${SLOT_BG};
    color: ${SUBTLE}; font-size: 8.5pt;
  }
  /* 그림은 늘어난 칸을 채우되 비율은 지킨다(contain) — 늘어났다고 늘려 그리지 않는다. */
  img { flex: 1 1 auto; width: 100%; min-height: 0; max-height: 240px; object-fit: contain; border: 1px solid ${LINE}; border-radius: 9px; }

  /* sample은 쪽을 나눠 시작한다 — 한 sample이 두 쪽에 걸쳐 반씩 잘리지 않게. */
  .sample { break-before: page; }
  .sample.first { break-before: auto; }
  .sample > h2 { font-size: 12pt; font-weight: 800; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid ${LINE}; }
</style>
</head>
<body>
  <header class="doc">
    <h1>${escapeHtml(doc.far_no)} Tech Report</h1>
    <div class="meta">
      발행 ${escapeHtml(issued)}${doc.author ? ` · 작성 ${escapeHtml(doc.author)}` : ''}
    </div>
  </header>

  <div class="grid-12">
    <section class="card full">
      <h4>종합 분석 의견</h4>
      <div class="prose">${multiline(doc.overall_opinion ?? '')}</div>
    </section>

    ${divider('Visual Inspection')}
    ${imageBlock('상단부 사진', top)}
    ${imageBlock('하단부 사진', bottom)}

    ${divider('Secure Smart report')}
  </div>

  ${samples}
</body>
</html>`;
}
