/**
 * 배포가 쓰는 빌드 폴더(NEXT_DIST_DIR)를 읽고 바꾼다.
 *
 * WHY: 이 값은 deploy/ecosystem.json 안에 있는데, PowerShell 5.1로 그 파일을 읽고 쓰면
 * UTF-8을 ANSI로 해석해 한글 주석이 깨지고 BOM까지 붙는다(실제로 한 번 깨졌다).
 * JSON 손질은 Node가 하고, 배포 스크립트는 이 명령만 부른다.
 *
 * 사용:
 *   node scripts/dist-dir.mjs get          → 현재 값 출력(없으면 .next)
 *   node scripts/dist-dir.mjs set .next-b  → 값 변경
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ECOSYSTEM = join(dirname(dirname(fileURLToPath(import.meta.url))), 'deploy', 'ecosystem.json');
const ALLOWED = new Set(['.next', '.next-a', '.next-b']);

function load() {
  const raw = readFileSync(ECOSYSTEM, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

const [command, value] = process.argv.slice(2);
const config = load();
const app = config.apps.find((a) => a.name === 'webapp-v1');
if (!app) {
  console.error('ecosystem.json에서 webapp-v1을 찾지 못했습니다.');
  process.exit(1);
}

if (command === 'get') {
  process.stdout.write(app.env?.NEXT_DIST_DIR ?? '.next');
} else if (command === 'set') {
  if (!ALLOWED.has(value)) {
    console.error(`허용되지 않는 폴더입니다: ${value} (${[...ALLOWED].join(', ')} 중 하나)`);
    process.exit(1);
  }
  app.env = { ...(app.env ?? {}), NEXT_DIST_DIR: value };
  writeFileSync(ECOSYSTEM, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  process.stdout.write(value);
} else {
  console.error('사용법: node scripts/dist-dir.mjs get | set <.next-a|.next-b>');
  process.exit(1);
}
