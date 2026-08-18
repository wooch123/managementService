import { NextRequest, NextResponse } from 'next/server';
import { executeAction } from '@/lib/actions/executor';
import { runtimeActionRequestSchema } from '@/lib/actions/schema';

/**
 * §10.7 공개 런타임 API — 세션을 요구하지 않는다. 보안 원칙(§10.7 하단): 클라이언트는
 * actionId와 context(컴포넌트 값/선택 값/라우트 파라미터)만 보낸다. 엔티티명·컬럼명·SQL은
 * 절대 클라이언트에서 받지 않고, 서버가 actionId로 DB의 Action 정의를 조회해 조립한다.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = runtimeActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const result = await executeAction(parsed.data.actionId, parsed.data.context);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
