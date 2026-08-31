/**
 * SQLite WAL을 본체 파일로 접어 넣는다 — **DB를 커밋하기 전에** 실행한다.
 *
 * 왜 필요한가: 이 저장소는 설계(prisma/meta.db)와 업무 데이터(data/app.db)를 **함께 담는 것**이
 * 요점이다. 그런데 두 DB는 WAL 모드라 새로 쓴 내용이 한동안 `*.db-wal`에만 있고 본체 파일은
 * 예전 그대로다. `*.db-wal`은 커밋하지 않으므로(다른 PC에서 열 때 어긋난다), 그 상태로 커밋하면
 * **본체만 올라가고 최근 변경은 통째로 빠진다.**
 *
 * 실제로 그런 일이 있었다(2026-08-31): 리비전 #80을 발행한 뒤 커밋했는데, 올라간 meta.db는
 * #79까지였다. `git status`는 본체 파일이 안 바뀌었으니 깨끗하다고 했고, 이 PC에서는 WAL을 함께
 * 읽어 멀쩡히 보였다 — 새로 clone한 사람만 예전 화면을 봤을 상태였다.
 *
 * 실행: pnpm db:checkpoint
 */
import Database from 'better-sqlite3';
import { existsSync, statSync } from 'node:fs';

const TARGETS = ['prisma/meta.db', 'data/app.db'];

let moved = 0;
for (const file of TARGETS) {
  if (!existsSync(file)) {
    console.log(`- ${file} (없음 — 건너뜀)`);
    continue;
  }
  const walPath = `${file}-wal`;
  const before = existsSync(walPath) ? statSync(walPath).size : 0;

  const db = new Database(file);
  // TRUNCATE: 본체로 옮기고 WAL 파일 크기까지 0으로 되돌린다. busy가 1이면 누가 붙들고 있어
  // 다 옮기지 못한 것이다 — 조용히 넘어가면 안 되는 상태라 밝힌다.
  const [result] = db.pragma('wal_checkpoint(TRUNCATE)') as { busy: number; log: number; checkpointed: number }[];
  db.close();

  const after = existsSync(walPath) ? statSync(walPath).size : 0;
  const kb = (n: number) => `${Math.round(n / 1024)}KB`;
  if (result.busy !== 0) {
    console.log(`! ${file} — 다른 프로세스가 붙들고 있어 다 옮기지 못했습니다(WAL ${kb(after)} 남음).`);
    console.log(`  서비스를 잠시 멈춘 뒤 다시 실행하세요: pnpm db:checkpoint`);
    process.exitCode = 1;
    continue;
  }
  if (before > 0) moved += 1;
  console.log(`+ ${file} — WAL ${kb(before)} → ${kb(after)}`);
}

console.log(moved > 0 ? `\n${moved}개 파일의 WAL을 본체에 접어 넣었습니다. 이제 커밋하면 최신 내용이 함께 올라갑니다.` : '\n옮길 것이 없었습니다(이미 본체에 다 들어 있습니다).');
