/**
 * 테마 20종의 CSS를 파일로 뽑아낸다 → src/app/themes.generated.css
 *
 * WHY: 예전에는 layout.tsx가 이 CSS(23KB)를 매 응답 HTML에 인라인으로 넣었다. 페이지를 열 때마다
 * 같은 내용을 다시 받는 셈이라(HTML의 13%), 캐시되는 스타일시트로 옮겼다. globals.css가 이 파일을
 * import하므로 빌드 산출물에 한 번만 실린다.
 *
 * 실행: pnpm build가 자동으로 먼저 돌린다(package.json). 팔레트를 고쳤으면 이 파일도 다시 생성해야
 * 하며, 생성물은 저장소에 커밋해 개발 서버에서도 별도 단계 없이 바로 쓰이게 한다.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_CSS, THEMES } from '../src/lib/theme/palettes';

const header = `/* 자동 생성 파일 — scripts/generate-theme-css.ts로 재생성한다. 직접 수정하지 말 것.
   테마 ${THEMES.length}종: ${THEMES.map((t) => t.id).join(', ')} */\n`;

const out = join(process.cwd(), 'src', 'app', 'themes.generated.css');
writeFileSync(out, `${header}${THEME_CSS}\n`, 'utf8');
console.log(`테마 ${THEMES.length}종 CSS를 ${out}에 생성했습니다 (${Math.round(THEME_CSS.length / 1024)}KB).`);
