import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeExternal } from '@/lib/api/external-auth';
import {
  DEDICATED_ENDPOINT,
  fieldsByColumn,
  isExternalTable,
  tableInfo,
  type TableInfo,
} from '@/lib/api/external-tables';
import {
  createEntityRow,
  deleteEntityRow,
  getEntityRow,
  listEntityRows,
  updateEntityRow,
} from '@/lib/data-engine/crud';
import type { Filter } from '@/types/binding';
import type { ApiResult } from '@/types/auth';

/**
 * 업무 표를 **바깥에서** 읽고 쓰는 창구(사용자 지정, 2026-09-01).
 *
 *   GET    /api/external/<표>?<칸>=<값>&limit=&page=    조건에 맞는 줄을 읽는다
 *   POST   /api/external/<표>   { values }              줄 하나를 넣는다
 *   PATCH  /api/external/<표>   { id|where, values }    찾아서 고친다(upsert 가능)
 *   DELETE /api/external/<표>   { id|where }            찾아서 지운다
 *
 * 쓸 수 있는 표와 칸 목록은 `GET /api/external`이 알려 준다.
 *
 * ── 왜 표 이름을 주소에 두고도 안전한가 ─────────────────────────────────────────
 * 주소의 글자가 SQL에 닿는 길이 없다. 이름은 **명단(external-tables.ts)**에 있는 것만 통과하고,
 * 통과한 뒤에는 설계(메타 DB)에서 찾은 표를 쓴다. 보낸 칸 이름도 설계에 있는 칸으로 바뀌어야
 * 하며, 없으면 그 이름을 돌려주며 거절한다. 값은 전부 파라미터로 묶인다(CLAUDE.md §4.1).
 *
 * ── 여러 줄이 걸리면 손대지 않는다 ──────────────────────────────────────────────
 * `where`가 헐거우면 수백 줄이 한 번에 바뀐다. 바깥에서 부르는 창구라 그 실수가 조용히 지나가면
 * 되돌릴 방법이 없으므로, **둘 이상 걸리면 멈추고 몇 줄이 걸렸는지 알려 준다.** 정말 여러 줄을
 * 고치거나 지우려면 `all: true`를 적어야 한다 — 손이 한 번 더 가는 것이 값이다.
 */

export const runtime = 'nodejs';

const MAX_LIMIT = 200;
/** `all: true`라도 한 번에 이만큼까지만. 사고의 크기에 천장을 둔다. */
const MAX_BULK = 200;

const valueSchema = z.union([
  z.string().max(20000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  // JSON 칸(Signature 목록·그림 목록·적층 줄)은 배열/객체 그대로 받는다.
  z.array(z.unknown()).max(500),
  z.record(z.string().max(64), z.unknown()),
]);

const valuesSchema = z.record(z.string().max(64), valueSchema);
const whereSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(2000), z.number().finite(), z.boolean()])
);

const postSchema = z.object({ values: valuesSchema });

const hasTarget = (v: { id?: string; where?: Record<string, unknown> }) =>
  Boolean(v.id) || Boolean(v.where && Object.keys(v.where).length > 0);
const targetMessage = { message: 'id 또는 where 중 하나는 있어야 합니다' };

const patchSchema = z
  .object({
    id: z.string().trim().min(1).max(64).optional(),
    where: whereSchema.optional(),
    values: valuesSchema,
    /** 여러 줄이 걸려도 전부 고친다 — 일부러 적어야 한다. */
    all: z.boolean().default(false),
    /** 걸리는 줄이 없으면 새로 만든다. where의 값이 그대로 새 줄에 들어간다. */
    upsert: z.boolean().default(false),
  })
  .refine(hasTarget, targetMessage);

const deleteSchema = z
  .object({
    id: z.string().trim().min(1).max(64).optional(),
    where: whereSchema.optional(),
    all: z.boolean().default(false),
  })
  .refine(hasTarget, targetMessage);

function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResult<T>>({ ok: true, data }, { status });
}

function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error: { code, message, details } }, { status });
}

/** 표 이름을 확인하고 설계 정보를 가져온다. 전용 창구가 있는 표는 그쪽을 알려 준다. */
async function resolve(name: string): Promise<{ info: TableInfo } | { error: NextResponse }> {
  const dedicated = DEDICATED_ENDPOINT[name];
  if (dedicated) {
    return { error: fail('USE_DEDICATED_ENDPOINT', `이 표는 전용 창구를 씁니다: ${dedicated}`, 400) };
  }
  if (!isExternalTable(name)) {
    return {
      error: fail('UNKNOWN_TABLE', `쓸 수 없는 표입니다: ${name}. 목록은 GET /api/external 참고.`, 404),
    };
  }
  const info = await tableInfo(name);
  if (!info) return { error: fail('UNKNOWN_TABLE', `설계에서 표를 찾지 못했습니다: ${name}`, 404) };
  return { info };
}

/** 칸 이름으로 쓴 조건을 설계의 fieldId 조건으로 옮긴다. 없는 칸이면 그 이름을 돌려준다. */
function toFilters(
  info: TableInfo,
  where: Record<string, unknown>
): { filters: Filter[] } | { unknownColumn: string } {
  const byColumn = fieldsByColumn(info);
  const filters: Filter[] = [];
  for (const [column, value] of Object.entries(where)) {
    const field = byColumn.get(column);
    if (!field) return { unknownColumn: column };
    filters.push({ fieldId: field.id, op: 'eq', source: 'fixed', value });
  }
  return { filters };
}

/** `id` 하나 또는 `where`로 대상 줄의 id를 모은다. 여러 줄이면 `all` 없이는 멈춘다. */
async function targetIds(
  info: TableInfo,
  target: { id?: string; where?: Record<string, unknown>; all: boolean }
): Promise<{ ids: string[] } | { error: NextResponse }> {
  // id를 직접 준 경우에도 있는지 먼저 본다. 없는 id로 UPDATE/DELETE를 돌리면 아무 줄도 건드리지
  // 못한 채 "1줄 처리했다"고 답하게 된다 — 바깥에서는 성공으로 읽힌다.
  if (target.id) {
    const row = await getEntityRow(info.entityId, target.id);
    return { ids: row ? [target.id] : [] };
  }

  const mapped = toFilters(info, target.where ?? {});
  if ('unknownColumn' in mapped) {
    return { error: fail('UNKNOWN_FIELD', `이 표에 없는 칸입니다: ${mapped.unknownColumn}`, 400) };
  }

  const found = await listEntityRows(info.entityId, { page: 1, pageSize: MAX_BULK, filters: mapped.filters });
  if (found.total === 0) return { ids: [] };
  if (found.total > 1 && !target.all) {
    return {
      error: fail(
        'AMBIGUOUS',
        `조건에 ${found.total}줄이 걸립니다. 조건을 좁히거나, 정말 전부 처리하려면 all: true를 함께 보내세요.`,
        409,
        { matched: found.total }
      ),
    };
  }
  if (found.total > MAX_BULK) {
    return {
      error: fail('TOO_MANY', `한 번에 ${MAX_BULK}줄까지만 처리합니다 (조건에 ${found.total}줄).`, 413, {
        matched: found.total,
      }),
    };
  }
  return { ids: found.rows.map((r) => String(r.id)) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  if (!(await authorizeExternal(request))) return fail('UNAUTHORIZED', '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.', 401);

  const resolved = await resolve((await params).table);
  if ('error' in resolved) return resolved.error;
  const { info } = resolved;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? '50') || 50, 1), MAX_LIMIT);
  const page = Math.max(Number(sp.get('page') ?? '1') || 1, 1);

  // limit·page 말고 남은 것은 전부 "그 칸이 이 값과 같다"로 읽는다.
  const where: Record<string, unknown> = {};
  for (const [key, value] of sp.entries()) {
    if (key !== 'limit' && key !== 'page') where[key] = value;
  }

  const mapped = toFilters(info, where);
  if ('unknownColumn' in mapped) {
    return fail('UNKNOWN_FIELD', `이 표에 없는 칸입니다: ${mapped.unknownColumn}`, 400);
  }

  try {
    const result = await listEntityRows(info.entityId, { page, pageSize: limit, filters: mapped.filters });
    return ok(result);
  } catch (err) {
    return fail('QUERY_FAILED', err instanceof Error ? err.message : '조회에 실패했습니다.', 400);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  if (!(await authorizeExternal(request))) return fail('UNAUTHORIZED', '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.', 401);

  const resolved = await resolve((await params).table);
  if ('error' in resolved) return resolved.error;

  const body = await request.json().catch(() => null);
  // `{ values: {...} }`도 받고 줄 객체를 그대로 보낸 것도 받는다 — 바깥에서 부르는 창구라
  // 봉투를 한 겹 씌우는 것을 잊기 쉽다.
  const envelope = body && typeof body === 'object' && !Array.isArray(body) && 'values' in body ? body : { values: body };
  const parsed = postSchema.safeParse(envelope);
  if (!parsed.success) return fail('INVALID_INPUT', '입력값이 올바르지 않습니다.', 400, parsed.error.issues);

  try {
    const row = await createEntityRow(resolved.info.entityId, parsed.data.values);
    return ok(row, 201);
  } catch (err) {
    // 모르는 칸·필수 칸 누락·타입 불일치가 여기로 온다. crud.ts가 남긴 말을 그대로 넘긴다 —
    // 바깥에서 고칠 수 있어야 하는 정보다.
    return fail('CREATE_FAILED', err instanceof Error ? err.message : '저장하지 못했습니다.', 400);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  if (!(await authorizeExternal(request))) return fail('UNAUTHORIZED', '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.', 401);

  const resolved = await resolve((await params).table);
  if ('error' in resolved) return resolved.error;
  const { info } = resolved;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', 400);
  }
  const { id, where, values, all, upsert } = parsed.data;

  try {
    const target = await targetIds(info, { id, where, all });
    if ('error' in target) return target.error;

    if (target.ids.length === 0) {
      // id를 집어 준 경우에는 upsert여도 만들지 않는다. 그 id를 가진 줄을 만들 수는 없으니
      // (id는 서버가 붙인다) 엉뚱한 id의 새 줄이 생겨 부른 쪽이 잘못 알게 된다.
      if (id) return fail('NOT_FOUND', `그 id를 가진 줄이 없습니다: ${id}`, 404);
      if (!upsert) return fail('NOT_FOUND', '조건에 맞는 줄이 없습니다.', 404);
      // 찾은 것이 없으면 조건 자체가 새 줄의 값이 된다 — 그래야 다음에 같은 조건으로 다시 찾힌다.
      const row = await createEntityRow(info.entityId, { ...(where ?? {}), ...values });
      return ok({ created: true, updated: 0, rows: [row] }, 201);
    }

    const rows = [];
    for (const rowId of target.ids) {
      rows.push(await updateEntityRow(info.entityId, rowId, values));
    }
    return ok({ created: false, updated: rows.length, rows });
  } catch (err) {
    return fail('UPDATE_FAILED', err instanceof Error ? err.message : '고치지 못했습니다.', 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  if (!(await authorizeExternal(request))) return fail('UNAUTHORIZED', '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.', 401);

  const resolved = await resolve((await params).table);
  if ('error' in resolved) return resolved.error;
  const { info } = resolved;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', 400);
  }

  try {
    const target = await targetIds(info, parsed.data);
    if ('error' in target) return target.error;
    if (target.ids.length === 0) return fail('NOT_FOUND', '조건에 맞는 줄이 없습니다.', 404);

    for (const rowId of target.ids) {
      await deleteEntityRow(info.entityId, rowId);
    }
    return ok({ deleted: target.ids.length, ids: target.ids });
  } catch (err) {
    return fail('DELETE_FAILED', err instanceof Error ? err.message : '지우지 못했습니다.', 400);
  }
}
