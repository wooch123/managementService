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
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default withBundleAnalyzer(nextConfig);
