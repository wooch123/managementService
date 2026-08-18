import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { getAppDb } from '@/lib/db/app-db';
import { quoteIdent } from '@/lib/data-engine/identifiers';
import { resolveField, buildWhereClause, type ResolvedEntity } from '@/lib/data-engine/query';
import { toStorageValue } from '@/lib/data-engine/crud';
import { getActiveSpec } from '@/lib/runtime/spec-cache';
import { findPublishedEntity } from '@/lib/runtime/binding-query';
import { nanoid } from 'nanoid';
import type { ActionConfig, ValueSource } from '@/lib/actions/schema';
import type { DataType } from '@/types/entity';
import type { Filter } from '@/types/binding';
import type { PublishedSpec } from '@/types/spec';

export type Effect =
  | { type: 'toast'; variant: 'default' | 'success' | 'destructive'; message: string }
  | { type: 'navigate'; pageId: string; slug: string }
  | { type: 'openModal'; nodeId: string }
  | { type: 'closeModal'; nodeId: string }
  | { type: 'refresh'; nodeId: string };

export type ActionContext = {
  componentValues?: Record<string, unknown>;
  selectionValues?: Record<string, Record<string, unknown>>;
  routeParams?: Record<string, string>;
};

export type ActionResult = { ok: boolean; data?: unknown; error?: string; effects: Effect[] };

function resolveValueSource(source: ValueSource, ctx: ActionContext): unknown {
  switch (source.from) {
    case 'literal':
      return source.value;
    case 'component':
      return ctx.componentValues?.[source.nodeId];
    case 'selection':
      return ctx.selectionValues?.[source.nodeId]?.[source.field];
    case 'route':
      return ctx.routeParams?.[source.param];
    case 'now':
      return new Date().toISOString();
    case 'user':
      return 'anonymous';
  }
}

function resolveFieldMap(fieldMap: Record<string, ValueSource>, ctx: ActionContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldId, source] of Object.entries(fieldMap)) {
    out[fieldId] = resolveValueSource(source, ctx);
  }
  return out;
}

/** fieldId(메타 id) 기준 값 맵을 columnName 기준 storage 값 맵으로 변환한다. */
function toColumnValues(entity: ResolvedEntity, valuesByFieldId: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(valuesByFieldId)) {
    const field = resolveField(entity, fieldId);
    out[field.columnName] = toStorageValue(field.dataType as DataType, value);
  }
  return out;
}

const LOG_PATH = path.join(process.cwd(), 'data', 'action.log');

function appendLog(entry: { at: string; actionId: string; ok: boolean; ms: number; error?: string }): void {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

/** §9.3 "서버는 활성 리비전의 액션 정의를 읽어 실행한다" — 드래프트 Action 테이블이 아니라
 * getActiveSpec()이 반환하는 배포된 PublishedSpec.actions에서만 액션을 조회한다. 이 덕분에
 * 관리자가 드래프트에서 액션을 편집·삭제해도 다음 배포 전까지는 운영 사이트 동작이 그대로
 * 유지된다(§2.1 설계-배포 분리 모델의 핵심 보장). */
export async function executeAction(actionId: string, context: ActionContext): Promise<ActionResult> {
  const startedAt = Date.now();
  let result: ActionResult;
  try {
    const spec = await getActiveSpec();
    if (!spec) {
      result = { ok: false, error: '배포된 스펙이 없습니다. 먼저 배포를 진행해주세요.', effects: [] };
    } else {
      result = await dispatch(actionId, context, spec);
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : '알 수 없는 오류', effects: [] };
  }
  appendLog({ at: new Date().toISOString(), actionId, ok: result.ok, ms: Date.now() - startedAt, error: result.error });
  return result;
}

async function dispatch(actionId: string, context: ActionContext, spec: PublishedSpec): Promise<ActionResult> {
  const actionSpec = spec.actions.find((a) => a.id === actionId);
  if (!actionSpec) return { ok: false, error: '액션을 찾을 수 없습니다.', effects: [] };
  const config = actionSpec.config;

  switch (config.kind) {
    case 'CREATE':
      return runCreate(config, context, spec);
    case 'UPDATE':
      return runUpdate(config, context, spec);
    case 'DELETE':
      return runDelete(config, context, spec);
    case 'QUERY':
      return runQuery(config, spec);
    case 'NAVIGATE':
      return runNavigate(config, spec);
    case 'OPEN_MODAL':
      return { ok: true, effects: [{ type: 'openModal', nodeId: config.targetNodeId }] };
    case 'CLOSE_MODAL':
      return { ok: true, effects: [{ type: 'closeModal', nodeId: config.targetNodeId }] };
    case 'TOAST':
      return { ok: true, effects: [{ type: 'toast', variant: config.variant, message: config.message }] };
    case 'EXPORT_CSV':
      return runExportCsv(config, spec);
    case 'COMPOSITE':
      return runComposite(config, context, spec);
  }
}

async function runFollowUp(id: string | null | undefined, context: ActionContext, spec: PublishedSpec): Promise<Effect[]> {
  if (!id) return [];
  const result = await dispatch(id, context, spec);
  return result.effects;
}

async function runCreate(
  config: Extract<ActionConfig, { kind: 'CREATE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const values = toColumnValues(entity, resolveFieldMap(config.fieldMap, context));
  const db = getAppDb();
  const id = nanoid();
  const now = new Date().toISOString();
  const columns = ['id', 'created_at', 'updated_at', ...Object.keys(values)];
  db.prepare(
    `INSERT INTO ${quoteIdent(entity.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  ).run(id, now, now, ...Object.values(values));

  const effects = [
    ...(await runFollowUp(config.onSuccess, context, spec)),
    { type: 'toast' as const, variant: 'success' as const, message: '저장되었습니다' },
  ];
  return { ok: true, data: { id }, effects };
}

async function runUpdate(
  config: Extract<ActionConfig, { kind: 'UPDATE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const rowId = String(resolveValueSource(config.keySource, context));
  const values = toColumnValues(entity, resolveFieldMap(config.fieldMap, context));
  const db = getAppDb();
  const now = new Date().toISOString();
  const setClauses = [...Object.keys(values).map((c) => `${quoteIdent(c)} = ?`), `"updated_at" = ?`];
  db.prepare(`UPDATE ${quoteIdent(entity.tableName)} SET ${setClauses.join(', ')} WHERE "id" = ?`).run(
    ...Object.values(values),
    now,
    rowId
  );
  const effects = await runFollowUp(config.onSuccess, context, spec);
  return { ok: true, data: { id: rowId }, effects };
}

async function runDelete(
  config: Extract<ActionConfig, { kind: 'DELETE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const rowId = String(resolveValueSource(config.keySource, context));
  const db = getAppDb();
  db.prepare(`DELETE FROM ${quoteIdent(entity.tableName)} WHERE "id" = ?`).run(rowId);
  const effects = await runFollowUp(config.onSuccess, context, spec);
  return { ok: true, data: { id: rowId }, effects };
}

async function runQuery(config: Extract<ActionConfig, { kind: 'QUERY' }>, spec: PublishedSpec): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const { sql, params } = buildWhereClause(entity, config.filters as Filter[]);
  const db = getAppDb();
  const rows = db.prepare(`SELECT * FROM ${quoteIdent(entity.tableName)} ${sql}`).all(...params);
  return { ok: true, data: rows, effects: [{ type: 'refresh', nodeId: config.targetNodeId }] };
}

async function runNavigate(config: Extract<ActionConfig, { kind: 'NAVIGATE' }>, spec: PublishedSpec): Promise<ActionResult> {
  const page = spec.pages.find((p) => p.id === config.pageId);
  if (!page) return { ok: false, error: '대상 페이지를 찾을 수 없습니다.', effects: [] };
  return { ok: true, effects: [{ type: 'navigate', pageId: page.id, slug: page.slug }] };
}

async function runExportCsv(config: Extract<ActionConfig, { kind: 'EXPORT_CSV' }>, spec: PublishedSpec): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const { sql, params } = buildWhereClause(entity, config.filters as Filter[]);
  const db = getAppDb();
  const rows = db.prepare(`SELECT * FROM ${quoteIdent(entity.tableName)} ${sql}`).all(...params) as Record<string, unknown>[];
  const columns = ['id', 'created_at', 'updated_at', ...entity.fields.map((f) => f.columnName)];
  const csvLines = [columns.join(',')];
  for (const row of rows) {
    csvLines.push(columns.map((c) => csvEscape(String(row[c] ?? ''))).join(','));
  }
  return { ok: true, data: { filename: config.filename, csv: csvLines.join('\n') }, effects: [] };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function runComposite(
  config: Extract<ActionConfig, { kind: 'COMPOSITE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const db = getAppDb();
  const effects: Effect[] = [];
  let lastData: unknown;

  // 스텝은 모두 활성 스펙(spec.actions)에서 동기적으로 조회한 뒤, 실제 DB 쓰기는 하나의 동기
  // 트랜잭션으로 묶는다. better-sqlite3 트랜잭션은 콜백에서 예외가 나면 전체를 자동 롤백한다 —
  // 이것이 "2번째 스텝 실패 시 1번째도 롤백"을 만족시키는 메커니즘이다.
  const steps = config.steps.map((stepId) => {
    const actionSpec = spec.actions.find((a) => a.id === stepId);
    if (!actionSpec) throw new Error(`스텝 액션을 찾을 수 없습니다: ${stepId}`);
    return { stepId, config: actionSpec.config };
  });

  const entityCache = new Map<string, ResolvedEntity>();
  function getEntity(entityId: string): ResolvedEntity {
    if (!entityCache.has(entityId)) entityCache.set(entityId, findPublishedEntity(spec, entityId));
    return entityCache.get(entityId)!;
  }
  for (const step of steps) {
    if (step.config.kind === 'CREATE' || step.config.kind === 'UPDATE' || step.config.kind === 'DELETE') {
      getEntity(step.config.entityId);
    }
  }

  const tx = db.transaction(() => {
    for (const step of steps) {
      const cfg = step.config;
      if (cfg.kind === 'CREATE') {
        const entity = entityCache.get(cfg.entityId)!;
        const values = toColumnValues(entity, resolveFieldMap(cfg.fieldMap, context));
        const id = nanoid();
        const now = new Date().toISOString();
        const columns = ['id', 'created_at', 'updated_at', ...Object.keys(values)];
        db.prepare(
          `INSERT INTO ${quoteIdent(entity.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
        ).run(id, now, now, ...Object.values(values));
        lastData = { id };
      } else if (cfg.kind === 'UPDATE') {
        const entity = entityCache.get(cfg.entityId)!;
        const rowId = String(resolveValueSource(cfg.keySource, context));
        const values = toColumnValues(entity, resolveFieldMap(cfg.fieldMap, context));
        const now = new Date().toISOString();
        const setClauses = [...Object.keys(values).map((c) => `${quoteIdent(c)} = ?`), `"updated_at" = ?`];
        db.prepare(`UPDATE ${quoteIdent(entity.tableName)} SET ${setClauses.join(', ')} WHERE "id" = ?`).run(
          ...Object.values(values),
          now,
          rowId
        );
        lastData = { id: rowId };
      } else if (cfg.kind === 'DELETE') {
        const entity = entityCache.get(cfg.entityId)!;
        const rowId = String(resolveValueSource(cfg.keySource, context));
        db.prepare(`DELETE FROM ${quoteIdent(entity.tableName)} WHERE "id" = ?`).run(rowId);
        lastData = { id: rowId };
      } else if (cfg.kind === 'TOAST') {
        effects.push({ type: 'toast', variant: cfg.variant, message: cfg.message });
      } else if (config.stopOnError) {
        // CREATE/UPDATE/DELETE/TOAST 외 kind는 COMPOSITE 스텝에서 DB 트랜잭션과 무관하므로
        // 여기서는 건너뛴다(트랜잭션 밖에서 dispatch로 별도 처리하지 않음 — V1 스코프 축소, PROGRESS.md 참고).
      }
    }
  });

  try {
    tx();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '트랜잭션 실패', effects: [] };
  }

  return { ok: true, data: lastData, effects: [...effects, { type: 'toast', variant: 'success', message: '완료되었습니다' }] };
}

export function readActionLogTail(limit = 50): unknown[] {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l));
}
