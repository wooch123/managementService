import { issue, isValidSlug } from '@/lib/validation/helpers';
import type { ValidationRule, DraftSpec } from '@/lib/validation/types';

function childrenOf(spec: DraftSpec, parentNodeId: string | null, pageId?: string) {
  return spec.nodes.filter((n) => n.parentNodeId === parentNodeId && (pageId === undefined || n.pageId === pageId));
}

export const structPagesEmpty: ValidationRule = {
  code: 'E-STRUCT-001',
  run: (spec) => (spec.pages.length === 0 ? [issue('E-STRUCT-001', 'error', 'structure', '페이지가 하나도 없습니다.', { type: 'GLOBAL', id: 'global' }, false)] : []),
};

export const structHomeCount: ValidationRule = {
  code: 'E-STRUCT-002',
  run: (spec) => {
    const homeCount = spec.pages.filter((p) => p.isHome).length;
    if (homeCount === 1) return [];
    return [issue('E-STRUCT-002', 'error', 'structure', `홈 페이지가 ${homeCount}개입니다(정확히 1개여야 함).`, { type: 'GLOBAL', id: 'global' }, true)];
  },
};

export const structSlug: ValidationRule = {
  code: 'E-STRUCT-003',
  run: (spec) => {
    const issues = [];
    const counts = new Map<string, number>();
    for (const p of spec.pages) counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1);
    for (const p of spec.pages) {
      if (!isValidSlug(p.slug)) {
        issues.push(issue('E-STRUCT-003', 'error', 'structure', `slug 형식이 올바르지 않습니다: ${p.slug}`, { type: 'PAGE', id: p.id }, true));
      } else if ((counts.get(p.slug) ?? 0) > 1) {
        issues.push(issue('E-STRUCT-003', 'error', 'structure', `slug가 중복되었습니다: ${p.slug}`, { type: 'PAGE', id: p.id }, true));
      }
    }
    return issues;
  },
};

export const structPageCycle: ValidationRule = {
  code: 'E-STRUCT-004',
  run: (spec) => {
    const issues = [];
    const byId = new Map(spec.pages.map((p) => [p.id, p]));
    for (const p of spec.pages) {
      const visited = new Set<string>();
      let cur: typeof p | undefined = p;
      while (cur?.parentId) {
        if (visited.has(cur.id)) {
          issues.push(issue('E-STRUCT-004', 'error', 'structure', `페이지 계층에 순환 참조가 있습니다: ${p.title}`, { type: 'PAGE', id: p.id }, false));
          break;
        }
        visited.add(cur.id);
        cur = byId.get(cur.parentId);
      }
    }
    return issues;
  },
};

export const structPageDepth: ValidationRule = {
  code: 'E-STRUCT-005',
  run: (spec) => {
    const byId = new Map(spec.pages.map((p) => [p.id, p]));
    const issues = [];
    for (const p of spec.pages) {
      if (p.parentId) {
        const parent = byId.get(p.parentId);
        if (parent?.parentId) {
          issues.push(issue('E-STRUCT-005', 'error', 'structure', `페이지 계층 깊이가 2단을 초과합니다: ${p.title}`, { type: 'PAGE', id: p.id }, false));
        }
      }
    }
    return issues;
  },
};

export const structNodeCycle: ValidationRule = {
  code: 'E-STRUCT-006',
  run: (spec) => {
    const issues = [];
    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    for (const n of spec.nodes) {
      const visited = new Set<string>();
      let cur: typeof n | undefined = n;
      while (cur?.parentNodeId) {
        if (visited.has(cur.id)) {
          issues.push(issue('E-STRUCT-006', 'error', 'structure', `컴포넌트 트리에 순환 참조가 있습니다.`, { type: 'COMPONENT', id: n.id }, false));
          break;
        }
        visited.add(cur.id);
        cur = byId.get(cur.parentNodeId);
      }
    }
    return issues;
  },
};

export const structUnknownType: ValidationRule = {
  code: 'E-STRUCT-007',
  run: (spec, ctx) =>
    spec.nodes
      .filter((n) => !ctx.getComponentMeta(n.type))
      .map((n) => issue('E-STRUCT-007', 'error', 'structure', `카탈로그에 없는 컴포넌트 타입입니다: ${n.type}`, { type: 'COMPONENT', id: n.id }, false)),
};

export const structNonContainerChildren: ValidationRule = {
  code: 'E-STRUCT-008',
  run: (spec, ctx) => {
    const issues = [];
    for (const n of spec.nodes) {
      const meta = ctx.getComponentMeta(n.type);
      if (!meta || meta.isContainer) continue;
      if (childrenOf(spec, n.id).length > 0) {
        issues.push(issue('E-STRUCT-008', 'error', 'structure', `비컨테이너 컴포넌트(${n.type})에 자식이 있습니다.`, { type: 'COMPONENT', id: n.id }, false));
      }
    }
    return issues;
  },
};

export const structAllowedChildren: ValidationRule = {
  code: 'E-STRUCT-009',
  run: (spec, ctx) => {
    const issues = [];
    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    for (const n of spec.nodes) {
      if (!n.parentNodeId) continue;
      const parent = byId.get(n.parentNodeId);
      if (!parent) continue;
      const parentMeta = ctx.getComponentMeta(parent.type);
      if (parentMeta?.allowedChildren && !parentMeta.allowedChildren.includes(n.type)) {
        issues.push(issue('E-STRUCT-009', 'error', 'structure', `${parent.type}는 ${n.type}를 자식으로 허용하지 않습니다.`, { type: 'COMPONENT', id: n.id }, false));
      }
    }
    return issues;
  },
};

export const structEmptyVisiblePage: ValidationRule = {
  code: 'W-STRUCT-010',
  run: (spec) =>
    spec.pages
      .filter((p) => p.isVisible && !spec.nodes.some((n) => n.pageId === p.id))
      .map((p) => issue('W-STRUCT-010', 'warning', 'structure', `표시되는 페이지에 컴포넌트가 없습니다: ${p.title}`, { type: 'PAGE', id: p.id }, false)),
};

export const structGridOverflow: ValidationRule = {
  code: 'W-STRUCT-011',
  run: (spec) =>
    spec.nodes
      .filter((n) => !n.parentNodeId && n.grid.col + n.grid.span - 1 > 12)
      .map((n) => issue('W-STRUCT-011', 'warning', 'structure', `그리드 좌표가 12칼럼을 넘어갑니다.`, { type: 'COMPONENT', id: n.id }, true)),
};

export const structGridOverlap: ValidationRule = {
  code: 'W-STRUCT-012',
  run: (spec) => {
    const issues = [];
    const roots = spec.nodes.filter((n) => !n.parentNodeId);
    // 본문(main)과 우측 패널(aside)은 물리적으로 다른 그리드라 좌표가 같아도 겹치지 않는다.
    const byPage = new Map<string, typeof roots>();
    for (const n of roots) {
      const key = `${n.pageId}:${n.region}`;
      byPage.set(key, [...(byPage.get(key) ?? []), n]);
    }
    for (const list of byPage.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].grid;
          const b = list[j].grid;
          if (a.col === b.col && a.row === b.row && a.span === b.span && a.rowSpan === b.rowSpan) {
            issues.push(issue('W-STRUCT-012', 'warning', 'structure', `같은 그리드 셀에 컴포넌트가 완전히 겹칩니다.`, { type: 'COMPONENT', id: list[j].id }, false));
          }
        }
      }
    }
    return issues;
  },
};

export const structTopPageNoIcon: ValidationRule = {
  code: 'W-STRUCT-013',
  run: (spec) =>
    spec.pages
      .filter((p) => !p.parentId && !p.icon)
      .map((p) => issue('W-STRUCT-013', 'warning', 'structure', `최상위 페이지에 아이콘이 없습니다: ${p.title}`, { type: 'PAGE', id: p.id }, false)),
};

export const structureRules: ValidationRule[] = [
  structPagesEmpty,
  structHomeCount,
  structSlug,
  structPageCycle,
  structPageDepth,
  structNodeCycle,
  structUnknownType,
  structNonContainerChildren,
  structAllowedChildren,
  structEmptyVisiblePage,
  structGridOverflow,
  structGridOverlap,
  structTopPageNoIcon,
];
