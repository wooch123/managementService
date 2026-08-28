import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // `next dev`와 `next build`/`next start`가 같은 .next/를 동시에 쓰면 서로의 산출물을
  // 깨뜨린다(실제로 세 번 겪음 — routes-manifest.json 손상, "Internal S..." API 응답 등).
  // 그래서 개발 서버는 .next-dev, 프로덕션은 .next로 나눠 둘을 함께 켜 둬도 안전하게 한다.
  //
  // NEXT_DIST_DIR로 출력 폴더를 직접 지정할 수도 있다 — 서비스 중인 폴더를 비우지 않고 다른 폴더에
  // 빌드한 뒤 프로세스만 옮기는 식의 무중단 전환에 쓴다(이 저장소에는 그 스크립트를 담지 않는다).
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),

  // Tech Report PDF는 서버가 headless Chromium으로 그린다. Playwright는 실행 시점에 자기
  // 경로를 계산해 브라우저 바이너리와 드라이버를 찾으므로, 번들에 말아 넣으면 그 경로가 깨진다.
  // 서버 쪽에서는 평범한 node_modules 모듈로 남겨 둔다.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default withBundleAnalyzer(nextConfig);
