import fs from 'node:fs';
import path from 'node:path';
import { catalog } from '../src/lib/registry/catalog';

/**
 * API 라우트 핸들러("app-route" 번들)는 React.createContext를 쓸 수 없는 제한된
 * 모듈 조건으로 컴파일되는데, catalog.ts의 각 항목은 거의 전부 Radix 기반 shadcn
 * 컴포넌트를 import해서(모듈 평가 시점에 createContext 호출) 라우트 핸들러에서
 * catalog.ts를 그대로 import하면 500 에러가 난다.
 *
 * 이 스크립트는 (UI import가 없는) 순수 Node 컨텍스트에서 tsx로 catalog.ts를 읽어
 * 서버에서 실제로 필요한 필드(isContainer/allowedChildren/defaultGrid/defaultProps)만
 * JSON으로 추출한다. propsSchema(zod)는 직렬화하지 않는다 — PATCH의 props 검증은
 * 당분간 클라이언트 측 zod 검증에 의존한다(§P3 기록된 한계, 추후 개선 예정).
 */
const meta = Object.fromEntries(
  Object.entries(catalog).map(([key, def]) => [
    key,
    {
      isContainer: def.isContainer,
      allowedChildren: def.allowedChildren ?? null,
      defaultGrid: def.defaultGrid,
      defaultProps: def.defaultProps,
      bindingModes: def.bindingModes,
      events: def.events.map((e) => e.name),
    },
  ])
);

const outPath = path.join(process.cwd(), 'src', 'lib', 'registry', 'node-meta.generated.ts');
const content = `// 자동 생성 파일 — scripts/generate-node-meta.ts로 재생성한다. 직접 수정하지 말 것.
export type NodeMeta = {
  isContainer: boolean;
  allowedChildren: string[] | null;
  defaultGrid: { span: number; rowSpan: number };
  defaultProps: Record<string, unknown>;
  bindingModes: string[];
  events: string[];
};

export const nodeMeta: Record<string, NodeMeta> = ${JSON.stringify(meta, null, 2)};
`;

fs.writeFileSync(outPath, content, 'utf-8');
console.log(`${Object.keys(meta).length}개 컴포넌트 메타데이터를 ${outPath}에 생성했습니다.`);
