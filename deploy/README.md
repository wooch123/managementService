# 배포 가이드 — WebApp_V1

`demo.dove9999.com` → 로컬 PC의 `localhost:3000`으로 서비스한다(최초 계획이던 `demo1.`이 아니라
`demo.` — 2026-08-18, 이미 있던 `dove-web-service` 터널을 재사용하기로 사용자가 확정). 그 외에는
SPEC.md §13을 그대로 따른다. **아래 절차는 이미 실행 완료된 상태다(2026-08-18 기준)** — 재구축하거나
PC를 옮길 때 참고용으로 남겨둔다.

---

## 1. Cloudflare Tunnel

이미 존재하던 `dove-web-service` 터널(`cbf9d4ae-d47a-4908-9dee-d810a4397fe8`)을 그대로 썼다 — 새로
만들지 않았다. 이 계정은 이미 `cloudflared tunnel login`이 되어 있었다(`~/.cloudflared/cert.pem` 존재
확인). 처음부터 새로 하는 경우의 절차:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create webapp-v1
cloudflared tunnel route dns webapp-v1 demo.dove9999.com
```

`cloudflared tunnel create` 결과로 나오는 터널 id와 자격증명 파일 경로를 `deploy/cloudflared/config.yml`의
`credentials-file`에 반영한다.

**터널도 pm2로 띄운다**(§2). Windows 서비스 등록(`cloudflared service install`)은 관리자 권한이
필요해 쓰지 않았다 — 로그인 없이 부팅부터 띄워야 할 때의 대안은 §2.1 마지막에 정리해 뒀다. `cloudflared service install`/`Get-Service Cloudflared`는 이 환경에서 관리자 권한이 없어
쓰지 않았다.

확인:

```powershell
cloudflared tunnel list
cloudflared tunnel route dns dove-web-service demo.dove9999.com   # 이미 라우팅돼 있으면 그 메시지가 뜬다
curl https://demo.dove9999.com/api/health
```

## 2. 앱 + 터널 상시 실행 (pm2)

프로세스 정의는 **`deploy/ecosystem.json` 하나로 고정**한다. 자동 기동과 수동 재기동이 같은 정의를
쓰므로, "손으로 띄운 것과 자동으로 뜬 것이 다르다"는 사고가 나지 않는다.

```powershell
pm2 start F:\Claude\WebApp_V1\deploy\ecosystem.json   # webapp-v1 + cloudflared-tunnel
pm2 save
pm2 list
pm2 logs webapp-v1
```

**`pm2 start "pnpm start"`나 `pm2 start next.cmd`를 쓰면 안 된다** — pm2가 배치파일을 JS로 잘못
해석해 즉시 크래시 루프에 빠진다(`SyntaxError: ... @ECHO off`). 정의 파일은 `node`를 인터프리터로
지정해 `node_modules/next/dist/bin/next`를 직접 실행하고 `args: ["start"]`를 준다.

> `pm2 start <script> ... -- start` 형태의 CLI 호출도 피한다. pm2를 node로 직접 실행할 때 마지막
> `start`가 별개 스크립트로 재해석돼, **인자 없이 `next`가 떠서 dev 모드로 서비스되는** 일이
> 실제로 있었다(2026-08-18). 정의 파일을 쓰면 이 문제가 없다.

코드를 바꿔 재배포할 때는 **반드시 `pnpm dev`를 먼저 끄고** 진행한다 — `.next/` 빌드 산출물을
dev 서버와 동시에 쓰면 서로 깨진다.

```powershell
pnpm build
pm2 restart webapp-v1
```

### 2.1 재부팅 후 자동 기동 (작업 스케줄러)

등록은 한 번만 하면 된다. **관리자 권한이 필요 없다.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File F:\Claude\WebApp_V1\deploy\register-autostart.ps1
```

작업 이름은 `WebApp_V1-autohost`이고 트리거가 두 개다.

| 트리거 | 시점 | 목적 |
|---|---|---|
| 로그온 | 로그인 30초 후 | 재부팅 복구 |
| 반복 | 10분마다 | 감시(watchdog). 프로세스나 pm2 데몬이 죽어도 10분 안에 스스로 복구 |

실행되는 것은 `deploy/start-hosting.ps1`이고, 하는 일은 다음과 같다.

1. F: 드라이브와 네트워크가 준비될 때까지 대기(각각 최대 120초)
2. 이미 두 프로세스가 `online`이고 헬스체크가 통과하면 **아무것도 하지 않고 종료**(반복 실행 안전)
3. 아니면 `ecosystem.json`으로 기동 → `pm2 save`
4. `http://127.0.0.1:3000/api/health`가 응답할 때까지 확인, 이어서 공개 URL 확인
5. 모든 결과를 `data/logs/autostart.log`에 남긴다(실패 시 0이 아닌 종료코드 → 스케줄러가 2분 간격 3회 재시도)

상태 확인:

```powershell
Get-ScheduledTaskInfo -TaskName WebApp_V1-autohost
Get-Content F:\Claude\WebApp_V1\data\logs\autostart.log -Tail 20
Start-ScheduledTask -TaskName WebApp_V1-autohost   # 수동으로 즉시 복구 실행
```

#### 왜 이렇게 돌아가는지 (2026-08-18 장애 조사 기록)

재부팅 후 서비스가 뜨지 않아 조사한 결과, 원인이 두 겹이었다.

1. **기존 방식(`pm2-windows-startup`)의 트리거가 발화하지 않았다.** `HKCU\...\Run`에 등록된
   `wscript(숨김) → pm2_resurrect.cmd` 항목인데, 부팅 후 `pm2.log`에 데몬 기동 흔적조차 없었다.
   숨김 실행이라 로그가 없어 실패해도 알 수 없었다. (이 Run 키는 지우지 않고 그대로 뒀다 —
   `start-hosting.ps1`은 이미 떠 있으면 아무 일도 하지 않으므로 둘이 충돌하지 않는다.)
2. **비대화형 컨텍스트에서 `%APPDATA%\npm` 폴더가 비어 보인다.** 같은 계정인데도 작업 스케줄러가
   실행한 PowerShell에서는 이 폴더의 항목 수가 0이고 `pm2.cmd`가 `Test-Path`·`[IO.File]::Exists`
   모두 False였다(대화형 세션에서는 28개, 정상). ACL·EFS·정션·Defender 제어된 폴더 액세스는 모두
   정상이었고, `%APPDATA%\Roaming` 자체는 보였다(대화형 19개 / 작업 컨텍스트 17개). **원인은 아직
   특정하지 못했다** — 전역 npm 설치물에 의존하는 자동화는 이 PC에서 신뢰할 수 없다는 것만 확실하다.

그래서 자동 기동 경로는 전역 npm을 쓰지 않는다. **`F:\Claude\tools`에 설치한 pm2 사본**을
`node`로 직접 실행한다(이 경로는 작업 컨텍스트에서도 정상적으로 보인다 — 실측).

```powershell
cd F:\Claude\tools
npm install pm2@7.0.3     # 자동 기동 전용 사본. 전역 pm2(터미널용)와 버전을 맞춘다
```

상태 디렉터리(`PM2_HOME = %USERPROFILE%\.pm2`)는 둘이 공유하므로, 터미널에서 `pm2 list`로 보는
프로세스와 자동 기동이 다루는 프로세스는 같은 것이다.

#### 한계와 대안 (로그인 없이 부팅부터 띄우려면)

지금 방식은 **"이 계정으로 로그인해야"** 서비스가 뜬다(작업 스케줄러의 "사용자 로그온 시" 트리거).
로그인 없이 부팅 직후부터 띄우려면 관리자 권한으로 아래처럼 진짜 Windows 서비스를 등록해야 한다.

```powershell
# 관리자 권한 PowerShell에서
cloudflared service install                       # 터널을 Windows 서비스로
npm install -g pm2-windows-service; pm2-service-install -n PM2   # pm2를 Windows 서비스로
```

이 계정은 Administrators 그룹에 속해 있으므로 승격은 가능하다. 다만 `pm2-windows-service`는
관리 계정 컨텍스트에서 돌기 때문에 `PM2_HOME`·로그 경로가 지금과 달라지고, 위에서 확인된
`%APPDATA%\npm` 가시성 문제를 다시 만날 수 있다. 필요해지면 그때 별도로 검증할 것.

## 3. 운영 환경 설정

`.env.production` (저장소에 커밋하지 않는다):

```
SESSION_SECRET=<32바이트 이상의 무작위 문자열>
NODE_ENV=production
APP_URL=https://demo.dove9999.com
```

`SESSION_SECRET`은 아래 명령으로 생성할 수 있다.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

앱은 `SESSION_SECRET`이 없거나 32자 미만이면 시작 시 즉시 에러를 던진다(`src/lib/auth/session.ts`) —
기본값으로 조용히 동작하는 경로 자체가 없다.

**Cloudflare Access(선택, 권장)**: `/admin/*`, `/login`에 Cloudflare Zero Trust Access 정책을 추가로
걸면 관리자 비밀번호가 뚫려도 2차 방어선이 생긴다. 걸지 않을 경우, **관리자 비밀번호가 유일한
방어선**이라는 점을 인지하고 있어야 한다 — 배포 전 반드시 §7.1 초기 비밀번호(`123456`)를 변경할 것.

## 4. 백업

`data/app.db`(운영 데이터)와 `prisma/meta.db`(설계 메타데이터) 둘 다 매일 백업한다.

- 실제 백업/보관정리 로직: `scripts/backup-db.ts` (`pnpm db:backup`으로 수동 실행 가능)
- 스케줄러 등록용 래퍼: `deploy/backup.ps1` — 파일 상단 주석의 `Register-ScheduledTask` 명령으로
  매일 03:00 실행되도록 한 번만 등록한다.
- 30일 지난 백업은 스크립트가 자동으로 지운다. `data/backups/`에 쌓인다.
- **복원**: pm2를 멈추고(`pm2 stop webapp-v1`) `data/backups/app-<날짜>.db`를 `data/app.db`로,
  `data/backups/meta-<날짜>.db`를 `prisma/meta.db`로 덮어쓴 뒤 다시 시작한다
  (`pm2 start webapp-v1`). 배포 리비전 롤백(`/admin/deploy`)은 `activeRevisionId`만 되돌릴 뿐
  스키마는 자동으로 되돌리지 않으므로, 스키마까지 되돌려야 하는 상황에서는 이 파일 복원이 필요하다.

## 5. 헬스체크

```
GET /api/health → { ok, revisionNo, uptime }
```

`revisionNo`가 `null`이면 아직 아무 것도 배포되지 않은 상태다. 모니터링 도구(uptime robot 등)를
이 엔드포인트에 연결해두면 프로세스가 죽었을 때 바로 알 수 있다.

## 6. 배포 전 보안 체크리스트 (§13.4)

배포마다 아래를 다시 확인한다. 괄호는 실측/코드로 어떻게 확인하는지다.

- [ ] `SESSION_SECRET`이 기본값이 아니다 (`.env.production` 직접 확인 — 코드가 미설정 시 기동을 막는다)
- [ ] 관리자 비밀번호가 해시로만 저장된다 (`prisma/seed.ts`가 `bcryptjs`로 해시, DB에 평문 없음)
- [ ] 동적 SQL 경로에 문자열 연결이 없다 (`grep -rn "db.prepare\|db.exec" src` → 전부 `quoteIdent()`를
      거치거나 사전 검증된 식별자만 사용하는지 확인)
- [ ] `/api/runtime/*`가 클라이언트 제공 테이블/컬럼명을 쓰지 않는다 (nodeId/actionId로만 서버가
      스펙을 조회 — `src/lib/runtime/binding-query.ts` 참고)
- [ ] 운영 모드 번들에 관리자 코드가 포함되지 않는다 (`pnpm analyze`로 확인, 또는
      `.next/server/app/(public)/home/[[...slug]]/page/app-build-manifest.json`이 참조하는 청크에
      `dnd-kit`/`xyflow`/`zundo` 문자열이 없는지 grep)
- [ ] 에러 응답에 스택 트레이스/SQL이 노출되지 않는다 (API 라우트가 예외를 그대로
      문자열화해 반환하지 않는지 확인 — 사용자에게는 일반 메시지, 원인은 `console.error`로만)

## 7. 로컬 실행 (참고, CLAUDE.md §8과 동일)

```bash
pnpm install
pnpm prisma migrate dev
pnpm db:init
pnpm dev
```

운영 모드로 로컬 테스트:

```bash
pnpm build
pnpm start
```
