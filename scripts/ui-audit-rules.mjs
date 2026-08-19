/**
 * 브라우저 안에서 도는 배치 점검 규칙 — audit-ui.mjs와 자체 검증 스크립트가 함께 쓴다.
 * (page.evaluate로 넘겨 실행하므로 이 함수 안에서는 바깥 스코프를 참조하면 안 된다.)
 */
export const IN_PAGE = () => {
  const TOL = 2;
  const findings = [];
  const push = (kind, el, detail) => {
    const path = (() => {
      const parts = [];
      let n = el;
      for (let i = 0; n && i < 3; i++, n = n.parentElement) {
        parts.unshift(n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.split(/\s+/).slice(0, 2).join('.') : ''));
      }
      return parts.join(' > ').slice(0, 110);
    })();
    findings.push({ kind, path, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), detail });
  };

  const clipInfo = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX) || /hidden|clip|auto|scroll/.test(cs.overflowY)) {
        return { el: p, cs, rect: p.getBoundingClientRect() };
      }
      p = p.parentElement;
    }
    return null;
  };

  // 1) 페이지 가로 넘침
  if (document.documentElement.scrollWidth > window.innerWidth + TOL) {
    findings.push({
      kind: '가로 스크롤 발생',
      path: 'document',
      text: '',
      detail: `문서 폭 ${document.documentElement.scrollWidth} > 뷰포트 ${window.innerWidth}`,
    });
  }

  const all = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest('svg')) return false; // 차트 내부 도형은 별도 규칙이 필요해 제외
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return false;
    // 스크린리더 전용 텍스트(sr-only)는 1px 상자에 글자를 숨겨 두는 기법이라 항상 "넘침"으로 잡힌다.
    if (el.closest('.sr-only')) return false;
    // 팬/줌 캔버스(관계도) 안의 노드는 보이는 영역 밖으로 나가는 게 정상이다.
    if (el.closest('.react-flow')) return false;
    if (cs.clipPath === 'inset(50%)' || (el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  for (const el of all) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    // 2) 잘리는 요소: overflow hidden 조상 밖으로 나감(스크롤 가능한 축은 정상으로 본다)
    const clip = clipInfo(el);
    if (clip) {
      const scrollableX = /auto|scroll/.test(clip.cs.overflowX) && clip.el.scrollWidth > clip.el.clientWidth + TOL;
      const scrollableY = /auto|scroll/.test(clip.cs.overflowY) && clip.el.scrollHeight > clip.el.clientHeight + TOL;
      const outRight = r.right - clip.rect.right;
      const outLeft = clip.rect.left - r.left;
      const outBottom = r.bottom - clip.rect.bottom;
      if (!scrollableX && (outRight > TOL || outLeft > TOL)) {
        push('컨테이너 밖으로 잘림(가로)', el, `${Math.round(Math.max(outRight, outLeft))}px 초과`);
      } else if (!scrollableY && outBottom > TOL && r.height > 8) {
        push('컨테이너 밖으로 잘림(세로)', el, `${Math.round(outBottom)}px 초과`);
      }
    }

    // 3) 말줄임 없이 잘린 글자
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasOwnText && /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + TOL && cs.textOverflow !== 'ellipsis') {
      push('말줄임 없이 잘린 글자', el, `${el.scrollWidth - el.clientWidth}px 넘침`);
    }

    // 3-1) 세로 스크롤 영역이 가로로도 밀려남.
    //
    // WHY: 문서 전체(1번)만 보면 놓친다 — 본문이 `overflow-y: auto`인 스크롤 영역 안에 있으면
    //      넘친 내용이 문서가 아니라 **그 영역 안에서** 옆으로 밀리고, 화면에는 그냥 잘려 보인다.
    //      실제로 좁은 폭에서 카드가 통째로 잘려 나가는데도 문서 폭은 뷰포트와 같아 통과했다.
    //      표처럼 가로 스크롤이 설계인 요소(overflow-x-* 를 직접 지정)는 제외한다.
    if (/auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + TOL) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!/overflow-x-(auto|scroll)/.test(cls)) {
        push('가로로 밀려남(내부 스크롤)', el, `내용 ${el.scrollWidth} > 보이는 폭 ${el.clientWidth}`);
      }
    }
  }

  // 3-2) 그리드 칸이 그리드보다 넓어짐 — 트랙 최소 크기(`1fr` = `minmax(auto, 1fr)`)를 내용이
  //      밀어 넓히면 칸이 화면 밖으로 나간다. 좁은 폭에서만 드러나므로 따로 본다.
  for (const grid of document.querySelectorAll('.runtime-grid')) {
    const gr = grid.getBoundingClientRect();
    for (const cell of grid.children) {
      const r = cell.getBoundingClientRect();
      if (r.width > gr.width + TOL) {
        push('그리드 칸이 그리드보다 넓음', cell, `칸 ${Math.round(r.width)} > 그리드 ${Math.round(gr.width)}`);
      }
    }
  }

  // 4) 같은 행 카드의 오와 열 + 5) 겹침
  const containers = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.display === 'grid' || cs.display === 'flex') && el.children.length > 1;
  });
  for (const c of containers) {
    const kids = [...c.children]
      .map((k) => ({ k, r: k.getBoundingClientRect() }))
      .filter((x) => x.r.width > 40 && x.r.height > 24);
    if (kids.length < 2) continue;

    // 같은 행 묶기(위 끝이 8px 이내면 같은 행으로 본다)
    const rows = new Map();
    for (const x of kids) {
      const key = [...rows.keys()].find((t) => Math.abs(t - x.r.top) <= 8) ?? Math.round(x.r.top);
      rows.set(key, [...(rows.get(key) ?? []), x]);
    }
    // 가운데/아래 정렬을 지시한 행은 위 끝이 다른 게 정상이다 — 지시한 기준선으로 비교한다.
    const align = getComputedStyle(c).alignItems;
    const edge =
      align === 'center' ? (r) => (r.top + r.bottom) / 2
      : align === 'flex-end' || align === 'end' ? (r) => r.bottom
      : (r) => r.top;
    const edgeName = align === 'center' ? '가운데선' : align === 'flex-end' || align === 'end' ? '아래 끝' : '위 끝';
    for (const [top, row] of rows) {
      if (row.length < 2) continue;
      const edges = row.map((x) => edge(x.r));
      const heights = row.map((x) => x.r.height);
      const gap = Math.max(...edges) - Math.min(...edges);
      const hGap = Math.max(...heights) - Math.min(...heights);
      // 카드처럼 늘어나야 하는 요소만 높이 불일치를 본다(툴바의 아이콘/버튼은 원래 높이가 다르다).
      const cardLike = row.every((x) => x.r.width > 120 && x.r.height > 60);
      if (gap > 2) push(`같은 행인데 ${edgeName}이 어긋남`, c, `${Math.round(gap)}px 차이 (${row.length}개)`);
      else if (cardLike && hGap > 6) push('같은 행 카드 높이 불일치', c, `${Math.round(hGap)}px 차이 (${row.length}개, top=${Math.round(top)})`);
    }

    // 겹침
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].r;
        const b = kids[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 4 && oy > 4) push('형제 요소가 겹침', kids[i].k, `${Math.round(ox)}×${Math.round(oy)}px 겹침`);
      }
    }
  }

  // 같은 종류의 지적은 한 번만 남긴다(같은 컨테이너에서 수십 개가 쏟아지는 것 방지)
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.kind}|${f.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
