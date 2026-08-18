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

**서비스 등록은 `cloudflared service install`(관리자 권한 필요, Windows 서비스) 대신 pm2로 실행한다** —
아래 §2 참고. `cloudflared service install`/`Get-Service Cloudflared`는 이 환경에서 관리자 권한이 없어
쓰지 않았다.

확인:

```powershell
cloudflared tunnel list
cloudflared tunnel route dns dove-web-service demo.dove9999.com   # 이미 라우팅돼 있으면 그 메시지가 뜬다
curl https://demo.dove9999.com/api/health
```

## 2. 앱 + 터널 상시 실행 (pm2)

```powershell
pnpm build
npm install -g pm2                     # pnpm add -g pm2는 이 환경에서 PATH 문제로 실패했다 — npm 사용
pm2 start "node_modules/next/dist/bin/next" --name webapp-v1 --interpreter node -- start
pm2 start cloudflared --name cloudflared-tunnel -- tunnel --config "C:\Users\<user>\.cloudflared\config-dove-web-service.yml" run
pm2 save
```

**`pm2 start "pnpm start" --name webapp-v1`는 Windows에서 그대로 쓰면 안 된다** — pm2가 `pnpm.cmd`를
JS 파일로 잘못 해석해 즉시 크래시 루프에 빠진다(`SyntaxError: Invalid or unexpected token`, `@ECHO off`
라인에서). 위처럼 `node`를 인터프리터로 지정해 Next.js의 실제 진입점(`next/dist/bin/next`)을 직접
실행해야 한다.

**`pm2 startup`은 Windows 네이티브 init 시스템이 없어 그대로 실패한다**(`Init system not found`). 대신
`pm2-windows-startup` 패키지를 쓴다 — 레지스트리 `HKCU\...\Run` 키에 등록하는 방식이라 **관리자 권한이
필요 없다**(Windows 서비스/작업 스케줄러 방식과 다름):

```powershell
npm install -g pm2-windows-startup
pm2-startup install
```

로그인 시 `pm2 resurrect`가 자동 실행되어 `pm2 save`로 저장해둔 프로세스(webapp-v1,
cloudflared-tunnel 둘 다)가 되살아난다. **주의**: 이 방식은 "사용자가 로그인할 때" 트리거되는 방식이라
PC가 재부팅된 뒤 실제로 그 계정으로 로그인해야 동작한다 — 로그인 화면 이전 단계(부팅 직후)부터
떠 있는 진짜 Windows 서비스와는 다르다. 완전한 무인 부팅 복구가 필요하면 관리자 권한으로
`cloudflared service install` + `pm2-windows-service`(Windows 서비스 등록판, 별도 패키지)를 쓰는 걸
고려할 것.

확인:

```powershell
pm2 list
pm2 logs webapp-v1
pm2 logs cloudflared-tunnel
```

둘 다 죽어도 pm2가 자동 재시작한다(기본 정책). 코드를 바꿔 재배포할 때는 **반드시 `pnpm dev`(Turbopack
개발 서버)를 먼저 끄고** 진행한다 — `.next/` 빌드 폴더를 dev 서버와 동시에 쓰면 산출물이 서로
깨진다(이 세션에서 실제로 두 번 겪음):

```powershell
# 1) 개발 서버(Browser 미리보기 등)를 먼저 정지
pnpm build
pm2 restart webapp-v1
```

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
