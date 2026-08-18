import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { slugify, isValidSlugFormat } from '@/lib/slugify';
import { resolveUniqueSlug } from '@/lib/db/pages';
import { resolveUniqueTableName, resolveUniqueColumnName } from '@/lib/db/entities';
import { toSnakeCase } from '@/lib/data-engine/identifiers';
import { applyEntityRename, applyFieldRename } from '@/lib/data-engine/apply';
import { nodeMeta } from '@/lib/registry/node-meta.generated';
import type { ValidationIssue } from '@/lib/validation/types';

/** §8.5 "[자동 수정]" 버튼의 실제 동작. issue.target에서 대상을 찾아 §11 표의 fixable 처리를
 * 그대로 수행한다. fixable=false인 코드가 들어오면 아무 것도 하지 않는다(방어적). */
export async function applyFix(issue: ValidationIssue): Promise<void> {
  switch (issue.code) {
    case 'E-STRUCT-002': {
      const pages = await prisma.page.findMany({ where: { parentId: null }, orderBy: { order: 'asc' } });
      if (pages.length === 0) return;
      await prisma.$transaction([
        prisma.page.updateMany({ where: { isHome: true }, data: { isHome: false } }),
        prisma.page.update({ where: { id: pages[0].id }, data: { isHome: true } }),
      ]);
      return;
    }
    case 'E-STRUCT-003': {
      const page = await prisma.page.findUnique({ where: { id: issue.target.id } });
      if (!page) return;
      const base = isValidSlugFormat(page.slug) ? page.slug : slugify(page.title);
      const unique = await resolveUniqueSlug(base, page.id);
      await prisma.page.update({ where: { id: page.id }, data: { slug: unique } });
      return;
    }
    case 'E-DATA-002': {
      if (issue.target.type === 'ENTITY') {
        const entity = await prisma.entity.findUnique({ where: { id: issue.target.id } });
        if (!entity) return;
        const base = toSnakeCase(entity.name);
        const unique = await resolveUniqueTableName(base, entity.id);
        if (unique !== entity.tableName) {
          applyEntityRename(entity.tableName, unique);
          await prisma.entity.update({ where: { id: entity.id }, data: { tableName: unique } });
        }
      } else if (issue.target.type === 'FIELD') {
        const field = await prisma.field.findUnique({ where: { id: issue.target.id }, include: { entity: true } });
        if (!field) return;
        const base = toSnakeCase(field.name);
        const unique = await resolveUniqueColumnName(field.entityId, base, field.id);
        if (unique !== field.columnName) {
          applyFieldRename(field.entity.tableName, field.columnName, unique);
          await prisma.field.update({ where: { id: field.id }, data: { columnName: unique } });
        }
      }
      return;
    }
    case 'W-STRUCT-011': {
      const node = await prisma.componentNode.findUnique({ where: { id: issue.target.id } });
      if (!node) return;
      const maxSpan = Math.max(1, 13 - node.gridCol);
      if (node.gridSpan > maxSpan) {
        await prisma.componentNode.update({ where: { id: node.id }, data: { gridSpan: maxSpan } });
      }
      return;
    }
    case 'W-DATA-012': {
      const node = await prisma.componentNode.findUnique({ where: { id: issue.target.id } });
      if (!node?.bindingJson) return;
      const binding = JSON.parse(node.bindingJson) as { mode: string; entityId?: string; sort?: unknown[] };
      if (binding.mode !== 'list' || !binding.entityId) return;
      const firstField = await prisma.field.findFirst({ where: { entityId: binding.entityId }, orderBy: { order: 'asc' } });
      if (!firstField) return;
      binding.sort = [{ fieldId: firstField.id, dir: 'desc' }];
      await prisma.componentNode.update({ where: { id: node.id }, data: { bindingJson: JSON.stringify(binding) } });
      return;
    }
    case 'E-ACT-001': {
      // 연결 해제 — 존재하지 않는 actionId를 가리키는 이벤트 키를 제거한다
      const node = await prisma.componentNode.findUnique({ where: { id: issue.target.id } });
      if (!node) return;
      const events = JSON.parse(node.eventsJson) as Record<string, string>;
      const actionIds = new Set((await prisma.action.findMany({ select: { id: true } })).map((a) => a.id));
      const next = Object.fromEntries(Object.entries(events).filter(([, actionId]) => actionIds.has(actionId)));
      await prisma.componentNode.update({ where: { id: node.id }, data: { eventsJson: JSON.stringify(next) } });
      return;
    }
    case 'E-ACT-008': {
      // 연결 해제 — 이 컴포넌트가 지원하지 않는 이벤트명을 제거한다
      const node = await prisma.componentNode.findUnique({ where: { id: issue.target.id } });
      if (!node) return;
      const meta = nodeMeta[node.type];
      if (!meta) return;
      const events = JSON.parse(node.eventsJson) as Record<string, string>;
      const next = Object.fromEntries(Object.entries(events).filter(([eventName]) => meta.events.includes(eventName)));
      await prisma.componentNode.update({ where: { id: node.id }, data: { eventsJson: JSON.stringify(next) } });
      return;
    }
    case 'W-ACT-010': {
      const action = await prisma.action.findUnique({ where: { id: issue.target.id } });
      if (!action) return;
      const config = JSON.parse(action.configJson) as Record<string, unknown>;
      config.confirmText = '정말 삭제하시겠습니까?';
      await prisma.action.update({ where: { id: action.id }, data: { configJson: JSON.stringify(config) } });
      return;
    }
    default:
      return;
  }
}

export const FIXABLE_CODES = new Set(['E-STRUCT-002', 'E-STRUCT-003', 'E-DATA-002', 'W-STRUCT-011', 'W-DATA-012', 'E-ACT-001', 'E-ACT-008', 'W-ACT-010']);
