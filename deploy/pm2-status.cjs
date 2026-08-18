/**
 * pm2 프로세스 상태를 "이름=상태" 줄 목록으로 출력한다.
 *
 * WHY: PowerShell 5.1의 ConvertFrom-Json은 대소문자만 다른 중복 키를 만나면 통째로 실패한다.
 * pm2 jlist의 pm2_env에는 프로세스 환경변수가 그대로 들어 있고, Windows에는 username과
 * USERNAME이 함께 존재해 항상 이 오류가 난다(2026-08-18 실측). 그 탓에 자동 기동 스크립트가
 * "이미 떠 있음"을 인식하지 못하고 10분마다 서비스를 재시작했다. 파싱은 node가 한다.
 *
 * 사용: node pm2-status.cjs <pm2 CLI 진입점 경로>
 */
const { execFileSync } = require('child_process');

const pm2Js = process.argv[2];
if (!pm2Js) process.exit(0);

try {
  const raw = execFileSync(process.execPath, [pm2Js, 'jlist'], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  const start = raw.indexOf('[{');
  const end = raw.lastIndexOf('}]');
  if (start < 0 || end < start) process.exit(0); // 등록된 프로세스 없음
  for (const app of JSON.parse(raw.slice(start, end + 2))) {
    process.stdout.write(`${app.name}=${app.pm2_env.status}\n`);
  }
} catch {
  // 데몬이 없거나 pm2 호출 실패 — 호출 측에서 "상태 없음"으로 다루면 된다.
  process.exit(0);
}
