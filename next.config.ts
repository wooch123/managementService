import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // `next dev`와 `next build`/`next start`가 같은 .next/를 동시에 쓰면 서로의 산출물을
  // 깨뜨린다(이 세션에서 세 번 실제로 겪음 — routes-manifest.json 손상, "Internal S..."
  // API 응답 등). pm2가 이제 프로덕션(next start)을 상시 실행하므로, 로컬 개발 서버가
  // 같은 폴더를 건드리지 않도록 dev 전용 출력 디렉터리로 분리한다.
  // 배포 시에는 NEXT_DIST_DIR로 "지금 서비스 중이 아닌" 폴더에 빌드하고, 다 만든 뒤에 프로세스를
  // 그쪽으로 재시작한다(deploy/redeploy.ps1). 예전처럼 서비스 중인 .next를 비우면서 빌드하면
  // 그 구간에 재시작이 걸릴 때 "Could not find a production build"로 기동에 실패한다(실제 8회 발생).
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
};

export default withBundleAnalyzer(nextConfig);
