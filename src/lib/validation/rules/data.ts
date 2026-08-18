import { issue } from '@/lib/validation/helpers';
import { isValidIdentifierFormat, isReservedIdentifier } from '@/lib/data-engine/identifiers';
import { sqlTypeFor } from '@/lib/data-engine/ddl';
import type { ValidationRule, DraftSpec } from '@/lib/validation/types';
import type { DataType } from '@/types/entity';

type BindingLike = { mode: string; entityId?: string; fieldId?: string; select?: string[]; filters?: { source: string; ref?: string }[]; sort?: unknown[] } | null;

/** 컴포넌트 타입별 field 바인딩과 궁합이 맞는 dataType — 명시된 것 외에는 허용(보수적 오탐 방지) */
const COMPONENT_DATATYPE_COMPAT: Record<string, DataType[]> = {
  slider: ['INTEGER', 'REAL'],
  switch: ['BOOLEAN'],
  checkbox: ['BOOLEAN'],
  'date-picker': ['DATE', 'DATETIME'],
  calendar: ['DATE', 'DATETIME'],
  'input-otp': ['TEXT'],
};

export const dataEntityNoFields: ValidationRule = {
  code: 'E-DATA-001',
  run: (spec) => spec.entities.filter((e) => e.fields.length === 0).map((e) => issue('E-DATA-001', 'error', 'data', `엔티티에 필드가 없습니다: ${e.name}`, { type: 'ENTITY', id: e.id }, false)),
};

export const dataNamingViolation: ValidationRule = {
  code: 'E-DATA-002',
  run: (spec) => {
    const issues = [];
    const tableCounts = new Map<string, number>();
    for (const e of spec.entities) tableCounts.set(e.tableName, (tableCounts.get(e.tableName) ?? 0) + 1);
    for (const e of spec.entities) {
      if (!isValidIdentifierFormat(e.tableName) || isReservedIdentifier(e.tableName)) {
        issues.push(issue('E-DATA-002', 'error', 'data', `테이블명이 올바르지 않습니다: ${e.tableName}`, { type: 'ENTITY', id: e.id }, true));
      } else if ((tableCounts.get(e.tableName) ?? 0) > 1) {
        issues.push(issue('E-DATA-002', 'error', 'data', `테이블명이 중복되었습니다: ${e.tableName}`, { type: 'ENTITY', id: e.id }, true));
      }
      const colCounts = new Map<string, number>();
      for (const f of e.fields) colCounts.set(f.columnName, (colCounts.get(f.columnName) ?? 0) + 1);
      for (const f of e.fields) {
        if (!isValidIdentifierFormat(f.columnName) || isReservedIdentifier(f.columnName)) {
          issues.push(issue('E-DATA-002', 'error', 'data', `컬럼명이 올바르지 않습니다: ${f.columnName}`, { type: 'FIELD', id: f.id }, true));
        } else if ((colCounts.get(f.columnName) ?? 0) > 1) {
          issues.push(issue('E-DATA-002', 'error', 'data', `컬럼명이 중복되었습니다: ${f.columnName}`, { type: 'FIELD', id: f.id }, true));
        }
      }
    }
    return issues;
  },
};

export const dataRefMissing: ValidationRule = {
  code: 'E-DATA-003',
  run: (spec) => {
    const entityIds = new Set(spec.entities.map((e) => e.id));
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (f.dataType === 'REF' && (!f.refEntityId || !entityIds.has(f.refEntityId))) {
          issues.push(issue('E-DATA-003', 'error', 'data', `REF 필드의 대상 엔티티가 없습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    return issues;
  },
};

export const dataEnumEmpty: ValidationRule = {
  code: 'E-DATA-004',
  run: (spec) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (f.dataType === 'ENUM' && (!f.enumValues || f.enumValues.length === 0)) {
          issues.push(issue('E-DATA-004', 'error', 'data', `ENUM 필드의 값 목록이 비어 있습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    return issues;
  },
};

function fieldExists(spec: DraftSpec, entityId: string | undefined, fieldId: string | undefined): boolean {
  if (!entityId || !fieldId) return false;
  return spec.entities.find((e) => e.id === entityId)?.fields.some((f) => f.id === fieldId) ?? false;
}

export const dataBindingRefMissing: ValidationRule = {
  code: 'E-DATA-005',
  run: (spec) => {
    const issues = [];
    const entityIds = new Set(spec.entities.map((e) => e.id));
    for (const n of spec.nodes) {
      const b = n.binding as BindingLike;
      if (!b || b.mode === 'static') continue;
      if (!b.entityId || !entityIds.has(b.entityId)) {
        issues.push(issue('E-DATA-005', 'error', 'data', `바인딩이 존재하지 않는 엔티티를 참조합니다.`, { type: 'COMPONENT', id: n.id }, false));
        continue;
      }
      if (b.mode === 'field' && !fieldExists(spec, b.entityId, b.fieldId)) {
        issues.push(issue('E-DATA-005', 'error', 'data', `바인딩이 존재하지 않는 필드를 참조합니다.`, { type: 'COMPONENT', id: n.id }, false));
      }
      if ((b.mode === 'list' || b.mode === 'single') && b.select) {
        for (const fid of b.select) {
          if (!fieldExists(spec, b.entityId, fid)) {
            issues.push(issue('E-DATA-005', 'error', 'data', `바인딩의 select가 존재하지 않는 필드를 참조합니다.`, { type: 'COMPONENT', id: n.id }, false));
            break;
          }
        }
      }
    }
    return issues;
  },
};

export const dataBindingModeUnsupported: ValidationRule = {
  code: 'E-DATA-006',
  run: (spec, ctx) => {
    const issues = [];
    for (const n of spec.nodes) {
      const b = n.binding as BindingLike;
      if (!b) continue;
      const meta = ctx.getComponentMeta(n.type);
      if (meta && !meta.bindingModes.includes(b.mode)) {
        issues.push(issue('E-DATA-006', 'error', 'data', `이 컴포넌트가 지원하지 않는 바인딩 모드입니다: ${b.mode}`, { type: 'COMPONENT', id: n.id }, false));
      }
    }
    return issues;
  },
};

export const dataTypeMismatch: ValidationRule = {
  code: 'E-DATA-007',
  run: (spec) => {
    const issues = [];
    for (const n of spec.nodes) {
      const b = n.binding as BindingLike;
      if (!b || b.mode !== 'field' || !b.entityId || !b.fieldId) continue;
      const field = spec.entities.find((e) => e.id === b.entityId)?.fields.find((f) => f.id === b.fieldId);
      const compat = COMPONENT_DATATYPE_COMPAT[n.type];
      if (field && compat && !compat.includes(field.dataType as DataType)) {
        issues.push(issue('E-DATA-007', 'error', 'data', `컬럼 타입(${field.dataType})과 컴포넌트 입력 타입(${n.type})이 맞지 않습니다.`, { type: 'COMPONENT', id: n.id }, false));
      }
    }
    return issues;
  },
};

/**
 * §11.2 "required 필드 **추가**인데 기존 행 존재 + default 없음" — 위험한 건 배포 마이그레이션이
 * 지금 없는 컬럼을 NOT NULL로 새로 붙이는 경우다(기존 행에 채울 값이 없다). 이미 app.db에 있고
 * 값이 다 들어있는 required 컬럼까지 막으면, 데이터가 한 줄이라도 있는 앱은 영원히 배포할 수
 * 없게 된다 — 그래서 "app.db에 아직 없는 컬럼"일 때만 오류로 본다.
 */
export const dataRequiredNoDefault: ValidationRule = {
  code: 'E-DATA-008',
  run: (spec, ctx) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        const columnAlreadyExists = ctx.getColumnType(e.tableName, f.columnName) !== undefined;
        if (f.isRequired && !f.defaultVal && !columnAlreadyExists && ctx.getRowCount(e.tableName) > 0) {
          issues.push(issue('E-DATA-008', 'error', 'data', `필수 필드인데 기본값이 없고 기존 행이 있습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    return issues;
  },
};

export const dataUniqueDuplicates: ValidationRule = {
  code: 'E-DATA-009',
  run: (spec, ctx) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        if (f.isUnique && ctx.hasDuplicateValues(e.tableName, f.columnName)) {
          issues.push(issue('E-DATA-009', 'error', 'data', `UNIQUE 필드인데 기존 데이터에 중복 값이 있습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
        }
      }
    }
    return issues;
  },
};

export const dataUncastableType: ValidationRule = {
  code: 'E-DATA-010',
  run: (spec, ctx) => {
    const issues = [];
    for (const e of spec.entities) {
      for (const f of e.fields) {
        const actualType = ctx.getColumnType(e.tableName, f.columnName);
        if (!actualType) continue;
        if (actualType.toUpperCase() !== sqlTypeFor(f.dataType as DataType)) {
          if (ctx.hasUncastableValues(e.tableName, f.columnName, f.dataType)) {
            issues.push(issue('E-DATA-010', 'error', 'data', `타입 변경 시 캐스팅할 수 없는 행이 있습니다: ${f.name}`, { type: 'FIELD', id: f.id }, false));
          }
        }
      }
    }
    return issues;
  },
};

export const dataUnreferencedEntity: ValidationRule = {
  code: 'W-DATA-011',
  run: (spec) => {
    const issues = [];
    for (const e of spec.entities) {
      const boundByNode = spec.nodes.some((n) => (n.binding as BindingLike)?.entityId === e.id);
      const referencedByField = spec.entities.some((other) => other.fields.some((f) => f.refEntityId === e.id));
      const usedByAction = spec.actions.some((a) => (a.config as { entityId?: string }).entityId === e.id);
      if (!boundByNode && !referencedByField && !usedByAction) {
        issues.push(issue('W-DATA-011', 'warning', 'data', `어떤 컴포넌트도 참조하지 않는 엔티티입니다: ${e.name}`, { type: 'ENTITY', id: e.id }, false));
      }
    }
    return issues;
  },
};

export const dataListNoSort: ValidationRule = {
  code: 'W-DATA-012',
  run: (spec) =>
    spec.nodes
      .filter((n) => {
        const b = n.binding as BindingLike;
        return b?.mode === 'list' && (!b.sort || b.sort.length === 0);
      })
      .map((n) => issue('W-DATA-012', 'warning', 'data', `list 바인딩에 정렬이 지정되지 않았습니다.`, { type: 'COMPONENT', id: n.id }, true)),
};

export const dataFilterComponentRefMissing: ValidationRule = {
  code: 'W-DATA-013',
  run: (spec) => {
    const issues = [];
    for (const n of spec.nodes) {
      const b = n.binding as BindingLike;
      if (!b?.filters) continue;
      const samePage = new Set(spec.nodes.filter((x) => x.pageId === n.pageId).map((x) => x.id));
      for (const f of b.filters) {
        if (f.source === 'component' && (!f.ref || !samePage.has(f.ref))) {
          issues.push(issue('W-DATA-013', 'warning', 'data', `필터가 참조하는 컴포넌트가 같은 페이지에 없습니다.`, { type: 'COMPONENT', id: n.id }, false));
          break;
        }
      }
    }
    return issues;
  },
};

export const dataLargeTableNoPagination: ValidationRule = {
  code: 'W-DATA-014',
  run: (spec, ctx) => {
    const issues = [];
    for (const n of spec.nodes) {
      if (n.type !== 'table') continue;
      const b = n.binding as BindingLike;
      if (b?.entityId) {
        const entity = spec.entities.find((e) => e.id === b.entityId);
        if (entity && ctx.getRowCount(entity.tableName) >= 1000) {
          issues.push(issue('W-DATA-014', 'warning', 'data', `1000행 이상 예상되는 테이블에 페이지네이션이 없습니다.`, { type: 'COMPONENT', id: n.id }, false));
        }
      }
    }
    return issues;
  },
};

export const dataRules: ValidationRule[] = [
  dataEntityNoFields,
  dataNamingViolation,
  dataRefMissing,
  dataEnumEmpty,
  dataBindingRefMissing,
  dataBindingModeUnsupported,
  dataTypeMismatch,
  dataRequiredNoDefault,
  dataUniqueDuplicates,
  dataUncastableType,
  dataUnreferencedEntity,
  dataListNoSort,
  dataFilterComponentRefMissing,
  dataLargeTableNoPagination,
];
