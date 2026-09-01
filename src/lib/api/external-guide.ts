import 'server-only';
import { allTableInfo, DEDICATED_ENDPOINT, type TableInfo } from '@/lib/api/external-tables';

/**
 * 외부 연동 API 가이드를 **지금 설계에서 그대로 만들어 낸다**.
 *
 * 문서를 손으로 써 두지 않는 이유: 표의 칸은 관리자 화면에서 바뀐다. 칸 목록을 md 파일에
 * 베껴 두면 다음 설계 변경이 일어나는 순간부터 그 문서는 틀린 문서가 되고, 연동하는 쪽은
 * 틀린 줄 모른 채 맞춘다. 그래서 받을 때마다 메타 DB를 읽어 새로 만든다.
 */

const TYPE_NOTE: Record<string, string> = {
  TEXT: '글자',
  INTEGER: '정수',
  REAL: '숫자(소수 가능)',
  BOOLEAN: 'true / false',
  DATE: '날짜 `YYYY-MM-DD`',
  DATETIME: '일시 ISO8601 `2026-09-01T01:23:45.000Z`',
  JSON: '배열 또는 객체 (그대로 주고받는다)',
  ENUM: '정해진 값 중 하나',
  REF: '다른 표의 id',
};

function fieldRow(f: TableInfo['fields'][number]): string {
  const notes: string[] = [];
  if (f.required && !f.defaultValue) notes.push('**필수**');
  if (f.defaultValue) notes.push(`기본값 \`${f.defaultValue}\``);
  if (f.enumValues?.length) notes.push(f.enumValues.map((v) => `\`${v}\``).join(' / '));
  return `| \`${f.column}\` | ${f.label || '—'} | ${TYPE_NOTE[f.type] ?? f.type} | ${notes.join('<br>') || '—'} |`;
}

/** 예제에 쓸 만한 칸 하나 — 필수이거나 맨 앞의 글자 칸. */
function sampleColumn(info: TableInfo): string {
  const required = info.fields.find((f) => f.required && f.type === 'TEXT');
  return (required ?? info.fields.find((f) => f.type === 'TEXT') ?? info.fields[0])?.column ?? 'id';
}

export async function buildExternalApiGuide(options: { baseUrl: string; generatedAt?: Date }): Promise<string> {
  const base = options.baseUrl.replace(/\/+$/, '');
  const tables = await allTableInfo();
  const stamp = (options.generatedAt ?? new Date()).toISOString().slice(0, 16).replace('T', ' ');
  const first = tables[0];
  const sampleTable = first?.tableName ?? 'far_table';
  const sampleCol = first ? sampleColumn(first) : 'far_no';

  const lines: string[] = [];
  const p = (s = '') => lines.push(s);

  p('# 외부 연동 API 가이드');
  p();
  p(`> 이 문서는 **지금 설계에서 자동으로 만들어졌습니다** (${stamp} 기준).`);
  p('> 표의 칸이 바뀌면 내용도 따라 바뀝니다 — 다시 받으면 항상 최신입니다.');
  p();
  p(`대상 서버: \`${base}\``);
  p();
  p('---');
  p();

  // ── 1. 시작하기 ────────────────────────────────────────────────────────────
  p('## 1. 30초 만에 시작하기');
  p();
  p('사내망에서는 토큰 없이 그냥 부르면 됩니다.');
  p();
  p('```bash');
  p(`# 표 목록과 칸 확인`);
  p(`curl "${base}/api/external"`);
  p();
  p(`# 한 줄 읽기`);
  p(`curl "${base}/api/external/${sampleTable}?limit=1"`);
  p('```');
  p();
  p('| 하고 싶은 일 | 부르는 곳 |');
  p('|---|---|');
  p(`| 어떤 표·칸이 있는지 본다 | \`GET ${base}/api/external\` |`);
  p(`| 조건에 맞는 줄을 읽는다 | \`GET ${base}/api/external/<표>?<칸>=<값>\` |`);
  p(`| 줄을 넣는다 | \`POST ${base}/api/external/<표>\` |`);
  p(`| 찾아서 고친다 | \`PATCH ${base}/api/external/<표>\` |`);
  p(`| 찾아서 지운다 | \`DELETE ${base}/api/external/<표>\` |`);
  p(`| 이 문서를 다시 받는다 | \`GET ${base}/api/docs/external-api\` |`);
  p();

  // ── 2. 인증 ────────────────────────────────────────────────────────────────
  p('## 2. 인증');
  p();
  p('**사내망에서 부르면 토큰이 필요 없습니다.** 공개 주소로 부를 때만 토큰을 받습니다.');
  p();
  p('```bash');
  p(`curl -H "Authorization: Bearer <토큰>" "${base}/api/external"`);
  p('```');
  p();
  p('토큰은 서버의 `.env.local`에 있는 `EXTERNAL_API_TOKEN` 값입니다(없으면 `FAR_API_TOKEN`).');
  p();
  p('지금 내 요청이 사내로 보이는지 확인:');
  p();
  p('```bash');
  p(`curl "${base}/api/external?check=access"`);
  p('# {"ok":true,"data":{"allowed":true,"via":"internal","externalSignals":[]}}');
  p('```');
  p();
  p('`via`가 `internal`이면 토큰 없이 됩니다. `denied`가 나오면 토큰을 넣으세요.');
  p();

  // ── 3. 응답 모양 ───────────────────────────────────────────────────────────
  p('## 3. 응답은 항상 같은 모양입니다');
  p();
  p('```json');
  p('{ "ok": true,  "data": { ... } }');
  p('{ "ok": false, "error": { "code": "AMBIGUOUS", "message": "…", "details": { "matched": 12 } } }');
  p('```');
  p();
  p('`ok`만 먼저 보고 갈라 쓰면 됩니다. HTTP 상태 코드도 함께 맞춰 둡니다.');
  p();
  p('| 코드 | HTTP | 뜻 | 어떻게 고치나 |');
  p('|---|---|---|---|');
  p('| `UNAUTHORIZED` | 401 | 인터넷에서 불렀는데 토큰이 없다 | `Authorization: Bearer <토큰>` 추가 |');
  p('| `UNKNOWN_TABLE` | 404 | 없는 표 이름 | `GET /api/external`로 이름 확인 |');
  p('| `UNKNOWN_FIELD` | 400 | 그 표에 없는 칸 이름 | 오류 메시지에 어떤 칸인지 나옵니다 |');
  p('| `USE_DEDICATED_ENDPOINT` | 400 | 전용 창구가 따로 있는 표 | 메시지가 알려 주는 주소로 |');
  p('| `NOT_FOUND` | 404 | 조건에 맞는 줄이 없다 | 조건 확인, 또는 `upsert: true` |');
  p('| `AMBIGUOUS` | 409 | 조건에 두 줄 이상 걸린다 | 조건을 좁히거나 `all: true` |');
  p('| `TOO_MANY` | 413 | 한 번에 200줄을 넘는다 | 조건을 나눠서 여러 번 |');
  p('| `CREATE_FAILED` / `UPDATE_FAILED` / `DELETE_FAILED` | 400 | 값이 규칙에 안 맞는다 | 메시지에 이유가 적힙니다 |');
  p('| `INVALID_INPUT` | 400 | 본문 모양이 틀렸다 | 아래 예제와 견줘 보세요 |');
  p();

  // ── 4. 읽기 ────────────────────────────────────────────────────────────────
  p('## 4. 읽기 — `GET`');
  p();
  p('```bash');
  p(`curl "${base}/api/external/${sampleTable}?${sampleCol}=값&limit=50&page=1"`);
  p('```');
  p();
  p('- `limit` — 한 번에 받을 줄 수 (기본 50, 최대 200)');
  p('- `page` — 쪽 번호 (1부터)');
  p('- **그 밖의 모든 조건은 "그 칸이 이 값과 같다"로 읽습니다.** 여러 개 주면 전부 만족하는 줄만 나옵니다.');
  p();
  p('```json');
  p('{ "ok": true, "data": { "rows": [ … ], "total": 723, "page": 1, "pageSize": 50 } }');
  p('```');
  p();
  p('`total`은 조건에 걸린 **전체** 줄 수입니다. 전부 받으려면 `total`이 나올 때까지 `page`를 올리세요.');
  p();

  // ── 5. 쓰기 ────────────────────────────────────────────────────────────────
  p('## 5. 넣기 — `POST`');
  p();
  p('```bash');
  p(`curl -X POST "${base}/api/external/${sampleTable}" \\`);
  p('  -H "Content-Type: application/json" \\');
  p(`  -d '{"values":{"${sampleCol}":"값"}}'`);
  p('```');
  p();
  p('봉투(`values`)를 빼고 줄 객체를 그대로 보내도 받습니다 — 둘 다 같습니다.');
  p();
  p('```bash');
  p(`  -d '{"${sampleCol}":"값"}'`);
  p('```');
  p();
  p('- `id`·`created_at`·`updated_at`은 **서버가 붙입니다.** 보내면 거절됩니다.');
  p('- 설계에 없는 칸을 보내면 그 이름을 돌려주며 거절합니다.');
  p('- 만들어진 줄 전체가 `data`로 돌아옵니다(붙은 `id` 포함). HTTP는 `201`.');
  p();

  // ── 6. 고치기 ──────────────────────────────────────────────────────────────
  p('## 6. 고치기 — `PATCH`');
  p();
  p('**내부 id를 몰라도 업무 키로 찾아 고칠 수 있습니다.** 이게 이 API의 핵심입니다.');
  p();
  p('```bash');
  p(`curl -X PATCH "${base}/api/external/${sampleTable}" \\`);
  p('  -H "Content-Type: application/json" \\');
  p(`  -d '{"where":{"${sampleCol}":"값"},"values":{"고칠칸":"새값"}}'`);
  p('```');
  p();
  p('| 넣을 것 | 뜻 |');
  p('|---|---|');
  p('| `where` | 찾을 조건. 칸 이름과 값 (여러 개 주면 전부 만족) |');
  p('| `id` | 내부 id를 알면 이걸로 바로 (없는 id면 `404`) |');
  p('| `values` | 바꿀 칸과 값. **안 적은 칸은 건드리지 않습니다** |');
  p('| `all` | 여러 줄이 걸려도 전부 고친다 (기본 `false`) |');
  p('| `upsert` | 걸리는 줄이 없으면 `where`+`values`로 새로 만든다 (기본 `false`) |');
  p();
  p('> **여러 줄이 걸리면 손대지 않습니다.**');
  p('> `where`가 헐거워 두 줄 이상 걸리면 아무것도 고치지 않고 `409`로 멈추면서');
  p('> 몇 줄이 걸렸는지(`details.matched`) 알려 줍니다. 정말 전부 바꾸려면 `"all": true`를');
  p('> 함께 보내세요. 바깥에서 부르는 창구라 실수가 조용히 지나가면 되돌릴 수 없기 때문입니다.');
  p();

  // ── 7. 지우기 ──────────────────────────────────────────────────────────────
  p('## 7. 지우기 — `DELETE`');
  p();
  p('```bash');
  p(`curl -X DELETE "${base}/api/external/${sampleTable}" \\`);
  p('  -H "Content-Type: application/json" \\');
  p(`  -d '{"where":{"${sampleCol}":"값"}}'`);
  p('```');
  p();
  p('`PATCH`와 같은 규칙입니다 — 두 줄 이상 걸리면 `409`, 전부 지우려면 `"all": true`.');
  p('지운 줄 수와 id가 돌아옵니다. **되돌리는 기능은 없습니다.**');
  p();

  // ── 8. 표 목록 ─────────────────────────────────────────────────────────────
  p('## 8. 표와 칸 (설계 그대로)');
  p();
  p(`지금 열려 있는 표는 ${tables.length}종입니다.`);
  p();
  // 표 이름에 목차 링크를 걸지 않는다 — md 뷰어마다 제목을 앵커로 바꾸는 규칙이 달라
  // (백틱·em대시 처리) 어느 한쪽에 맞추면 다른 쪽에서 깨진 링크가 된다.
  p('| 표 | 이름 | 칸 수 |');
  p('|---|---|---|');
  for (const t of tables) {
    p(`| \`${t.tableName}\` | ${t.label} | ${t.fields.length} |`);
  }
  p();

  for (const t of tables) {
    p(`### \`${t.tableName}\` — ${t.label}`);
    p();
    p(`\`${base}/api/external/${t.tableName}\` · 칸 ${t.fields.length}개`);
    p();
    p('| 칸 | 이름 | 타입 | 비고 |');
    p('|---|---|---|---|');
    for (const f of t.fields) p(fieldRow(f));
    p();
  }

  // ── 9. 전용 창구 ───────────────────────────────────────────────────────────
  const dedicated = Object.entries(DEDICATED_ENDPOINT);
  if (dedicated.length > 0) {
    p('## 9. 이 창구로 쓸 수 없는 표');
    p();
    for (const [table, endpoint] of dedicated) {
      p(`### \`${table}\``);
      p();
      p(`전용 창구를 씁니다: \`${endpoint}\``);
      p();
      p('FAR 분석 이력은 **회차(rev)를 매기고 원장을 함께 갱신하는 일이 한 묶음**이라,');
      p('이 창구로 줄만 넣으면 그 짝이 깨집니다. 그래서 따로 두었습니다.');
      p();
    }
  }

  // ── 10. 실전 예제 ──────────────────────────────────────────────────────────
  p('## 10. 실전 예제');
  p();
  p('### Python');
  p();
  p('```python');
  p('import requests');
  p();
  p(`BASE = "${base}/api/external"`);
  p('# 사내망이면 헤더 없이. 인터넷에서 부를 때만:');
  p('# HEADERS = {"Authorization": "Bearer <토큰>"}');
  p('HEADERS = {}');
  p();
  p('# 읽기');
  p(`r = requests.get(f"{BASE}/${sampleTable}", params={"limit": 100}, headers=HEADERS)`);
  p('body = r.json()');
  p('if not body["ok"]:');
  p('    raise RuntimeError(body["error"]["message"])');
  p('rows = body["data"]["rows"]');
  p();
  p('# 업무 키로 찾아 고치기 (없으면 새로 만들기)');
  p(`r = requests.patch(f"{BASE}/${sampleTable}", headers=HEADERS, json={`);
  p(`    "where": {"${sampleCol}": "값"},`);
  p('    "values": {"고칠칸": "새값"},');
  p('    "upsert": True,');
  p('})');
  p('print(r.json())');
  p('```');
  p();
  p('### PowerShell');
  p();
  p('```powershell');
  p(`$base = "${base}/api/external"`);
  p();
  p(`$res = Invoke-RestMethod "$base/${sampleTable}?limit=100"`);
  p('if (-not $res.ok) { throw $res.error.message }');
  p('$res.data.rows | Format-Table');
  p();
  p('$body = @{');
  p(`  where  = @{ ${sampleCol} = "값" }`);
  p('  values = @{ 고칠칸 = "새값" }');
  p('} | ConvertTo-Json');
  p();
  p(`Invoke-RestMethod -Method Patch "$base/${sampleTable}" -ContentType "application/json; charset=utf-8" -Body $body`);
  p('```');
  p();
  p('> PowerShell에서 한글을 보낼 때는 `-ContentType`에 `charset=utf-8`을 꼭 붙이세요.');
  p('> 빼면 한글이 `?`로 깨져 저장됩니다.');
  p();
  p('### 여러 쪽 전부 받기');
  p();
  p('```python');
  p('rows, page = [], 1');
  p('while True:');
  p(`    body = requests.get(f"{BASE}/${sampleTable}", params={"limit": 200, "page": page}, headers=HEADERS).json()`);
  p('    rows += body["data"]["rows"]');
  p('    if len(rows) >= body["data"]["total"]:');
  p('        break');
  p('    page += 1');
  p('```');
  p();

  // ── 11. 자주 걸리는 것 ─────────────────────────────────────────────────────
  p('## 11. 자주 걸리는 것');
  p();
  p('**`409 AMBIGUOUS`가 났습니다**');
  p('조건에 두 줄 이상 걸렸습니다. `details.matched`에 몇 줄인지 있습니다. 조건을 더 넣어');
  p('좁히거나, 정말 전부 바꿀 생각이면 `"all": true`를 넣으세요.');
  p();
  p('**`알 수 없는 필드입니다: xxx`**');
  p('그 표에 `xxx`라는 칸이 없습니다. 화면에 보이는 이름(한글)이 아니라 **칸 이름**을 써야 합니다.');
  p('위 8장의 표에서 확인하세요.');
  p();
  p('**한글이 `?`나 깨진 글자로 저장됩니다**');
  p('본문을 UTF-8로 보내고 있는지 보세요. `Content-Type: application/json; charset=utf-8`을');
  p('붙이고, Windows 명령 프롬프트에서 직접 한글을 타이핑하는 대신 파일로 만들어 보내면 확실합니다.');
  p();
  p('**JSON 칸에 무엇을 넣나요**');
  p('배열이나 객체를 **그대로** 넣으면 됩니다. 문자열로 감싸지 마세요.');
  p('`{"images": ["a.png", "b.png"]}` — 맞음 · `{"images": "[\\"a.png\\"]"}` — 틀림');
  p();
  p('**날짜 형식**');
  p('`DATE` 칸은 `2026-09-01`, `DATETIME` 칸은 `2026-09-01T01:23:45.000Z` 형태로 보내세요.');
  p();
  p('---');
  p();
  p(`_이 문서는 ${stamp}에 설계에서 자동 생성되었습니다. 항상 최신본은 \`${base}/api/docs/external-api\`._`);
  p();

  return lines.join('\n');
}
