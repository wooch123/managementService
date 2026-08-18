// pnpm analyze — ANALYZE=true를 셸 문법 없이(Windows PowerShell 포함) 크로스플랫폼으로 세팅한 뒤
// `next build`를 실행한다. cross-env 같은 새 의존성을 추가하지 않으려고 이 정도만 직접 짰다.
import { spawnSync } from 'node:child_process';

const result = spawnSync('next', ['build', '--turbopack'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ANALYZE: 'true' },
});

process.exit(result.status ?? 1);
