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
    case 'sequence':
      // 실제 번호는 대상 테이블을 봐야 정해진다 — 엔티티를 아는 CREATE/UPDATE 안에서 채운다.
      return undefined;
  }
}

/**
 * 같은 접두사를 쓰는 기존 값 중 가장 큰 번호 + 1.
 *
 * 자릿수가 다른 값이 섞여 있을 수 있으므로(`ASG-9` vs `ASG-10`) 문자열 정렬이 아니라 **숫자로**
 * 비교한다. 접두사 뒤가 숫자가 아닌 값은 세지 않는다.
 */
function nextSequenceValue(entity: ResolvedEntity, fieldId: string, prefix: string, digits: number): string {
  const field = resolveField(entity, fieldId);
  const db = getAppDb();
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(${quoteIdent(field.columnName)}, ?) AS INTEGER)) AS n
         FROM ${quoteIdent(entity.tableName)}
        WHERE ${quoteIdent(field.columnName)} LIKE ?`
    )
    .get(prefix.length + 1, `${prefix}%`) as { n: number | null };
  const next = (row?.n ?? 0) + 1;
  return `${prefix}${String(next).padStart(digits, '0')}`;
}

/** 값 맵 해석. `sequence`처럼 대상 테이블을 알아야 하는 소스는 entity가 주어질 때만 채워진다. */
function resolveFieldMap(
  fieldMap: Record<string, ValueSource>,
  ctx: ActionContext,
  entity?: ResolvedEntity
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldId, source] of Object.entries(fieldMap)) {
    out[fieldId] =
      source.from === 'sequence' && entity
        ? nextSequenceValue(entity, fieldId, source.prefix, source.digits)
        : resolveValueSource(source, ctx);
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
  const db = getAppDb();
  const id = nanoid();
  const now = new Date().toISOString();

  // 번호 채번(sequence)은 "가장 큰 값 조회 → INSERT"라 그 사이에 다른 저장이 끼면 같은 번호가
  // 두 번 나온다. 한 트랜잭션으로 묶어 좁히고, 그래도 부딪히면(다중 워커) 다시 채번해 시도한다 —
  // 번호 컬럼은 대개 UNIQUE라 부딪힘은 오류로 드러나지 실수로 덮어쓰이지 않는다.
  const hasSequence = Object.values(config.fieldMap).some((s) => s.from === 'sequence');
  const insertOnce = db.transaction(() => {
    const values = toColumnValues(entity, resolveFieldMap(config.fieldMap, context, entity));
    const columns = ['id', 'created_at', 'updated_at', ...Object.keys(values)];
    db.prepare(
      `INSERT INTO ${quoteIdent(entity.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    ).run(id, now, now, ...Object.values(values));
  });

  const attempts = hasSequence ? 3 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      insertOnce();
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (attempt >= attempts || !/UNIQUE constraint failed/i.test(message)) throw err;
    }
  }

  const effects = [
    ...(await runFollowUp(config.onSuccess, context, spec)),
    { type: 'toast' as const, variant: 'success' as const, message: '저장되었습니다' },
    // 저장했으면 화면도 그 결과를 보여야 한다 — 방금 등록한 건이 목록에 없으면 저장이 안 된 것처럼
    // 보인다. 예전에는 액션마다 "저장 후 목록 갱신" QUERY를 하나씩 더 만들어 붙였는데, 그건 갱신
    // 말고는 하는 일이 없는 액션이 저장 액션 수만큼 늘어난다는 뜻이었다.
    { type: 'refresh' as const, nodeId: '' },
  ];
  return { ok: true, data: { id }, effects };
}

async function runUpdate(
  config: Extract<ActionConfig, { kind: 'UPDATE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const key = resolveValueSource(config.keySource, context);
  // 키가 비면 WHERE가 아무 행도 맞추지 못하거나(문자열 'undefined') 최악의 경우 의도치 않은
  // 행을 건드린다 — 조용히 0건 갱신하고 "저장됨"이라 알리지 않고 분명히 실패시킨다.
  if (key === null || key === undefined || key === '') {
    return { ok: false, error: '갱신할 대상이 지정되지 않았습니다. 목록에서 항목을 먼저 선택하세요.', effects: [] };
  }
  const rowKey = String(key);
  const keyColumn = config.keyFieldId ? resolveField(entity, config.keyFieldId).columnName : 'id';
  const values = toColumnValues(entity, resolveFieldMap(config.fieldMap, context, entity));
  const db = getAppDb();
  const now = new Date().toISOString();
  const setClauses = [...Object.keys(values).map((c) => `${quoteIdent(c)} = ?`), `"updated_at" = ?`];
  const info = db
    .prepare(`UPDATE ${quoteIdent(entity.tableName)} SET ${setClauses.join(', ')} WHERE ${quoteIdent(keyColumn)} = ?`)
    .run(...Object.values(values), now, rowKey);
  if (info.changes === 0) {
    return { ok: false, error: `대상을 찾지 못했습니다: ${rowKey}`, effects: [] };
  }
  // CREATE와 같은 이유로 알림과 갱신을 함께 낸다. 예전에는 UPDATE만 아무 효과도 내지 않아,
  // 상태를 바꿔도 화면에 아무 일이 없어 보였다(눌렀는데 반응이 없으면 다시 누르게 된다).
  const effects = [
    ...(await runFollowUp(config.onSuccess, context, spec)),
    { type: 'toast' as const, variant: 'success' as const, message: '반영되었습니다' },
    { type: 'refresh' as const, nodeId: '' },
  ];
  return { ok: true, data: { key: rowKey, changed: info.changes }, effects };
}

async function runDelete(
  config: Extract<ActionConfig, { kind: 'DELETE' }>,
  context: ActionContext,
  spec: PublishedSpec
): Promise<ActionResult> {
  const entity = findPublishedEntity(spec, config.entityId);
  const key = resolveValueSource(config.keySource, context);
  if (key === null || key === undefined || key === '') {
    return { ok: false, error: '삭제할 대상이 지정되지 않았습니다.', effects: [] };
  }
  const rowKey = String(key);
  const keyColumn = config.keyFieldId ? resolveField(entity, config.keyFieldId).columnName : 'id';
  const db = getAppDb();
  db.prepare(`DELETE FROM ${quoteIdent(entity.tableName)} WHERE ${quoteIdent(keyColumn)} = ?`).run(rowKey);
  const effects = await runFollowUp(config.onSuccess, context, spec);
  return { ok: true, data: { key: rowKey }, effects };
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
