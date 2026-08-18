import { defineConfig } from '@playwright/test';

const PORT = 3200;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // dev 서버(Turbopack)는 라우트를 처음 열 때 그 자리에서 컴파일한다 — 카탈로그가 84종으로
  // 커지면서 /admin/builder 최초 진입이 기본 타임아웃(30s/5s)을 넘겨, 첫 테스트들이 제품
  // 문제가 아니라 컴파일 대기로 무더기로 실패했다. 최초 1회 비용이므로 넉넉히 잡는다.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // 참고: Turbopack dev 서버가 P3의 대규모 카탈로그 모듈 그래프에서 가끔 내부 패닉을 일으킨다
    // (turbo-tasks-backend "inner_of_upper_lost_followers", Next 15.5.23 기준 확인됨).
    // webpack으로 바꿔봤으나 이 프로젝트 규모(9000+ 모듈)에서 컴파일이 너무 느려 타임아웃이
    // 더 잦아져서 되돌렸다 — PROGRESS.md에 기록된 알려진 인프라 한계로 남겨둔다.
    // 실행마다 테스트 전용 DB를 새로 만든 뒤(운영 설계 데이터와 완전 분리) dev 서버를 띄운다.
    // Playwright는 globalSetup보다 webServer를 먼저 시작하므로, DB 준비는 반드시 이 명령 안에서
    // 서버보다 앞서 실행돼야 한다.
    command: `pnpm exec tsx tests/e2e/prepare-test-db.ts && pnpm exec next dev --turbopack --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // dev 서버가 운영 DB가 아니라 테스트 DB를 보게 만드는 지점(src/lib/db/paths.ts).
    env: {
      META_DB_PATH: 'prisma/test-meta.db',
      APP_DB_PATH: 'data/test-app.db',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
