import { NextRequest, NextResponse } from 'next/server';
import { decideExternalAccess } from '@/lib/api/external-auth';
import { allTableInfo, DEDICATED_ENDPOINT } from '@/lib/api/external-tables';
import type { ApiResult } from '@/types/auth';

/**
 * 바깥 창구의 **안내판**. 어떤 표를 쓸 수 있고 각 표에 어떤 칸이 있는지 알려 준다.
 *
 *   GET /api/external
 *
 * 이걸 두는 이유: 표의 칸은 설계(GUI)에서 바뀐다. 문서에 칸 목록을 베껴 두면 그 순간부터 낡기
 * 시작하므로, 지금 실제 설계를 그대로 읽어 내보낸다. 써드파티는 여기를 먼저 보고 맞추면 된다.
 *
 * 설계상의 fieldId 같은 내부 id는 내보내지 않는다 — 바깥에서 쓸 일이 없고, 알면 그것에 기대게 된다.
 */

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const access = await decideExternalAccess(request);

  // `?check=access` — 이 요청이 사내로 보이는지 바깥으로 보이는지만 알려 준다. 연동하는 쪽에서
  // "왜 401이 나는지"를 헤더까지 뒤지지 않고 확인하게 하려는 것. 업무 데이터는 담기지 않고,
  // 표식의 **이름만** 돌려준다(값은 담지 않는다).
  if (request.nextUrl.searchParams.get('check') === 'access') {
    return NextResponse.json<ApiResult<Record<string, unknown>>>({
      ok: true,
      data: {
        allowed: access.allowed,
        via: access.via,
        externalSignals: access.signals,
        note:
          access.signals.length === 0
            ? '사내에서 온 요청으로 봅니다 — 토큰이 필요 없습니다.'
            : '인터넷에서 온 요청으로 봅니다 — 토큰이 필요합니다.',
      },
    });
  }

  if (!access.allowed) {
    return NextResponse.json<ApiResult<never>>(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '인터넷에서 부를 때는 토큰이 필요합니다. 사내망에서는 토큰 없이 됩니다.',
        },
      },
      { status: 401 }
    );
  }

  const tables = (await allTableInfo()).map((t) => ({
    table: t.tableName,
    label: t.label,
    endpoint: `/api/external/${t.tableName}`,
    fields: t.fields.map((f) => ({
      column: f.column,
      label: f.label,
      type: f.type,
      required: f.required,
    })),
  }));

  return NextResponse.json<ApiResult<Record<string, unknown>>>({
    ok: true,
    data: {
      tables,
      dedicated: DEDICATED_ENDPOINT,
      usage: {
        auth: '사내망에서는 토큰 없이. 인터넷(공개 주소)에서는 Authorization: Bearer <EXTERNAL_API_TOKEN>',
        checkAccess: 'GET /api/external?check=access — 지금 이 요청이 사내로 보이는지 확인',
        guide: 'GET /api/docs/external-api — 상세 가이드(md). ?download=1 이면 파일로 저장',
        read: 'GET /api/external/<table>?<column>=<value>&limit=50&page=1',
        create: 'POST /api/external/<table>  { "values": { "<column>": <value> } }',
        update: 'PATCH /api/external/<table>  { "where": { "<column>": <value> }, "values": {...} }',
        remove: 'DELETE /api/external/<table>  { "where": { "<column>": <value> } }',
        notes: [
          'id 대신 업무 키(where)로 찾아 고칠 수 있다.',
          'where에 두 줄 이상 걸리면 409로 멈춘다. 정말 전부 바꾸려면 all: true를 함께 보낸다.',
          'PATCH에 upsert: true를 주면 걸리는 줄이 없을 때 where+values로 새로 만든다.',
          'id·created_at·updated_at은 서버가 붙인다. values에 넣으면 거절된다.',
        ],
      },
    },
  });
}
