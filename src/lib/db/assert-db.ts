import fs from 'node:fs';

/**
 * DB 파일이 **진짜로 거기 있는지** 열기 전에 확인한다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────────
 * SQLite는 없는 파일을 열라고 하면 **말없이 빈 DB를 만든다.** 그래서 `prisma/meta.db`가
 * 빠진 채로 앱을 띄우면, 실패하는 대신 0바이트짜리 DB가 생기고 그다음부터 모든 질의가
 *
 *   Invalid `prisma.revision.findUnique()` invocation:
 *   The table `main.Revision` does not exist in the current database.
 *
 * 로 깨진다. 화면에는 Prisma 잘못처럼 보이지만 실제 원인은 "설계 DB가 없다"이고, 게다가
 * 그 0바이트 파일이 남아 **다음 실행도 같은 오류로 계속 실패한다**(파일이 '있으니' 그동안의
 * `Test-Path` 검사도 통과해 버린다). 실제로 이 오류가 보고됐다.
 *
 * 그래서 열기 전에 막고, 어디를 보고 있는지와 무엇을 하면 되는지 함께 알려 준다.
 *
 * ── 경로는 실행 위치를 따른다 ───────────────────────────────────────────────────
 * `paths.ts`가 상대경로를 `process.cwd()` 기준으로 푼다. 저장소 밖에서 띄우면 엉뚱한 곳을
 * 보게 되므로, 오류 메시지에 **푼 절대경로와 현재 실행 위치를 같이** 적는다 — 이 둘만 있으면
 * 대개 한눈에 원인이 보인다.
 */

/** 모든 SQLite 파일의 첫 16바이트. 이게 아니면 DB가 아니거나 깨진 것이다. */
const SQLITE_MAGIC = 'SQLite format 3\0';

export type DbKind = 'meta' | 'app';

const DESCRIPTION: Record<DbKind, { what: string; fix: string }> = {
  meta: {
    what: '설계 DB(화면·컴포넌트·리비전·게시판)',
    fix: '저장소에 함께 들어 있는 파일입니다. `git status`로 빠지지 않았는지 보고, 지워졌다면 `git checkout -- prisma/meta.db`로 되돌리세요.',
  },
  app: {
    what: '업무 DB(FAR·Tech Report·Issue 등)',
    fix: '저장소에 함께 들어 있는 파일입니다. `git checkout -- data/app.db`로 되돌리거나, 처음부터 만들려면 `pnpm db:init`을 실행하세요.',
  },
};

function fail(kind: DbKind, filePath: string, problem: string): never {
  const { what, fix } = DESCRIPTION[kind];
  throw new Error(
    [
      `${what} 파일을 열 수 없습니다 — ${problem}`,
      ``,
      `  찾은 곳   ${filePath}`,
      `  실행 위치 ${process.cwd()}`,
      ``,
      `저장소 폴더에서 실행하고 있는지 먼저 확인하세요(경로는 실행 위치 기준으로 풀립니다).`,
      fix,
    ].join('\n')
  );
}

/**
 * 파일이 있고, 비어 있지 않고, SQLite 파일이 맞는지 본다.
 * 문제가 있으면 **파일을 만들지 않고** 던진다.
 */
export function assertSqliteDb(filePath: string, kind: DbKind): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    fail(kind, filePath, '파일이 없습니다');
  }

  if (!stat.isFile()) fail(kind, filePath, '파일이 아닙니다');

  if (stat.size === 0) {
    // 앞선 실행이 빈 DB를 만들어 놓고 간 자리다. 지우라고 분명히 말해 준다 — 그냥 두면
    // 다음 실행도 '파일은 있는데 표가 없다'로 똑같이 실패한다.
    fail(kind, filePath, '파일이 비어 있습니다(0바이트). 앞선 실행이 만들어 둔 빈 파일이니 지우고 제대로 된 파일을 받으세요');
  }

  const header = Buffer.alloc(SQLITE_MAGIC.length);
  let read = 0;
  const fd = fs.openSync(filePath, 'r');
  try {
    read = fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (read < header.length || header.toString('latin1') !== SQLITE_MAGIC) {
    fail(kind, filePath, 'SQLite 파일이 아닙니다(내용이 깨졌을 수 있습니다)');
  }
}
