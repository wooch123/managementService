import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // next.config.ts가 개발 서버 산출물을 .next-dev로 분리한다 — 빌드 산출물이므로 .next와 똑같이 제외한다.
      ".next-dev/**",
      // 무중단 배포가 번갈아 쓰는 빌드 폴더(deploy/redeploy.ps1)도 산출물이라 제외한다.
      ".next-a/**",
      ".next-b/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
