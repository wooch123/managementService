# WebApp_V1

관리자가 **화면·컴포넌트·DB·동작을 GUI로 설계**하면, 검증을 거쳐 **운영 사이트(`/home`)에 즉시 배포**되는 사내 업무용 노코드 웹 애플리케이션 빌더.

SPEC.md에 정의된 8개 Phase(P0~P8) 구현이 전부 완료되었고, 실제 운영 배포까지 마친 상태다(2026-08-18).
현재 운영 중인 구성은 이 빌더로 만든 **반도체 품질관리(QMS) 서비스**다 — 엔티티 9종·페이지 9개·
컴포넌트 100여 개·액션 14개로, 로트부터 시정조치(CAPA)까지를 한 사이트에서 관리한다(아래 §운영 구성).

- **운영 사이트**: https://demo.dove9999.com
- **관리자**: https://demo.dove9999.com/admin (초기 계정 `admin` / `123456` — 반드시 변경할 것, [배포 가이드](deploy/README.md#3-운영-환경-설정) 참고)

---

## 이 문서와 다른 문서의 역할

| 문서 | 용도 |
|---|---|
| **README.md**(이 문서) | 프로젝트가 무엇이고 지금 무엇이 되는지에 대한 개괄 |
| [SPEC.md](SPEC.md) | 상세 요구사항/구현 명세 (원본 스펙) |
| [CLAUDE.md](CLAUDE.md) | 이 저장소에서 작업할 때 지켜야 하는 규칙(기술 스택 고정값, 코딩 규칙 등) |
| [PROGRESS.md](PROGRESS.md) | Phase별 진행 기록 — 무엇을 언제 만들었고, 어떤 버그를 발견해 어떻게 고쳤는지의 시간순 로그 |
| [deploy/README.md](deploy/README.md) | 실제 운영 배포 절차(Cloudflare Tunnel, pm2, 백업, 보안 체크리스트) |

---

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router, Turbopack) + React 19 + TypeScript strict |
| 스타일 | Tailwind CSS v4 |
| UI 킷 | shadcn/ui + lucide-react |
| 메타 DB(설계 데이터) | SQLite + Prisma (`prisma/meta.db`) |
| 운영 DB(관리자가 설계한 테이블) | SQLite + better-sqlite3 (`data/app.db`, 동적 DDL) |
| 드래그&드롭 | @dnd-kit |
| 관계도 | @xyflow/react (React Flow 12) |
| 폼/검증 | react-hook-form + zod |
| 상태 | zustand + zundo(undo/redo) |
| 인증 | iron-session 쿠키 세션 |
| 테스트 | vitest(단위) + Playwright(E2E) |
| 배포 | `next start` + pm2 + Cloudflare Tunnel |

## 주요 기능

### 1. 관리자 — 화면 설계 (`/admin/builder`)
- 페이지 트리(드래그로 순서/계층 변경), 아이콘 피커
- 12칼럼 그리드 캔버스: 드래그&드롭 배치, 리사이즈, 이미 배치된 컴포넌트 재배치
- 캔버스가 운영 화면과 **같은 배율**(행 높이 + 간격)로 그려지고, 페이지 경계·12칼럼 가이드가 보여 배치 결과를 그대로 예측할 수 있다
- **컴포넌트끼리 영역을 침범하지 않는다** — 놓거나 옮기거나 키울 때 겹치면 자동으로 빈 자리로 밀리고, 리사이즈는 이웃에 닿는 지점에서 멈춘다(드롭 미리보기도 실제로 놓일 자리를 보여준다)
- **화면 영역 2종**: 본문 그리드와 **우측 플로팅 패널**을 캔버스 상단 토글로 전환하며 각각 꾸민다(패널이 비어 있으면 운영 화면에 렌더되지 않는다)
- 컴포넌트 팔레트 + 속성 패널(zod 스키마로 자동 생성되는 폼)
- **84종 컴포넌트 카탈로그** — 레이아웃 10, 입력 17, 데이터 표시 11, 내비게이션 6, 피드백/오버레이 10, 액션 3, 유틸리티 7, **통계 차트 20종**
- 통계 차트: 히스토그램·박스플롯·산점도·회귀·버블·파레토·X̄/R/I-MR/p 관리도·공정능력(Cp·Cpk)·런·이동평균·누적분포·정규확률도(Q-Q)·잔차·히트맵·레이더·워터폴·퍼널 (통계량은 `src/lib/stats.ts`에서 계산)

### 2. 관리자 — 데이터 설계 (`/admin/data`)
- 엔티티/필드 CRUD — 생성·수정·삭제가 **즉시 `app.db`에 실제 DDL로 반영**(별도 마이그레이션 실행 단계 없음)
- 파괴적 변경(타입 변경, 필수 필드 추가 등)은 영향받는 행 수를 보여주고 명시적 확인을 요구
- 데이터 탭에서 행 직접 조회/추가/수정/삭제

### 3. 관리자 — 관계도 (`/admin/graph`)
- Page/Component/Entity/Action을 하나의 React Flow 그래프로 시각화
- CONTAINS(포함)는 페이지-컴포넌트 트리에서 자동 파생, READS/WRITES/TRIGGERS/NAVIGATES/REFERENCES는 수동 연결
- CONTAINS 엣지는 상하좌우 직교 경로로 다른 노드를 피해 라우팅(코너는 살짝 둥글게), 나머지는 방향 애니메이션이 있는 곡선
- 미니맵, 정렬 툴바, 다중 선택 이동
- 자동 배치는 **배치 방향(세로/가로) × 배치 밀도(기본/밀집)** 를 선택한다 — 밀집은 계층 순서를 그대로 둔 채 간격만 최소화해 같은 그래프를 약 절반 면적에 담는다

### 4. 관리자 — 액션 시스템 (`/admin/graph`, 속성 패널 동작 탭)
- 10종 액션: CREATE/UPDATE/DELETE/QUERY/NAVIGATE/OPEN_MODAL/CLOSE_MODAL/TOAST/EXPORT_CSV/COMPOSITE
- COMPOSITE는 여러 스텝을 하나의 SQLite 트랜잭션으로 묶어 실행 — 중간 스텝 실패 시 전부 롤백
- 폼 컴포넌트 → 필드 자동 매핑, 사람이 읽는 요약 문장 자동 생성

### 5. 관리자 — 구성 검증 (`/admin/validate`)
- **51개 규칙**(구조 13 + 데이터 14 + 동작 12 + 관계 7 + 배포 안전성 5)을 한 번에 실행
- 오류/경고 분리, 카테고리·심각도 필터, 대상 요소로 바로 이동하는 링크, 일부 규칙은 자동 수정 지원
- 오류 0건이어야 배포 가능 — 스텝퍼 배지가 실시간으로 상태를 반영

### 6. 관리자 — 배포 (`/admin/deploy`)
- 배포 = 드래프트를 zod로 파싱해 불변 스냅샷(`Revision.specJson`)으로 굳히고 `activeRevisionId`를 교체하는 8단계 트랜잭션(파싱→검증→백업→스키마 diff→마이그레이션→리비전 생성→활성화 교체→캐시 무효화)
- 배포 전 변경 diff(페이지/컴포넌트/액션/관계/스키마) 미리보기, 파괴적 스키마 변경은 체크박스로 명시 확인해야 배포 가능
- 배포 중 오류 시 `app.db` 백업 복원 + 리비전 미생성으로 롤백
- 리비전 이력 조회, 특정 리비전으로 즉시 롤백(스키마는 자동 롤백 안 됨 — 별도 백업 파일 복원 필요)

### 7. 운영 사이트 (`/home`)
- 본문은 읽기 좋은 폭(최대 1200px)으로 제한하되 **사이드바에 붙여 좌측 정렬**한다 — 가운데 정렬하면 화면이 넓어질수록 사이드바와 본문 사이가 함께 벌어진다(2560px에서 432px). 오른쪽에는 관리자가 꾸민 **플로팅 지표 패널**(300px, 스티키)이 본문 바로 옆에 붙는다 — 현재 구성은 페이지별 KPI 4종 + 분포 차트 + 안내로 채워져 있다
- 배포된 리비전만 읽는다 — 관리자가 드래프트에서 편집 중인 내용은 다음 배포 전까지 운영에 절대 반영되지 않는다(설계-배포 분리)
- 서버에서 바인딩 데이터를 미리 조회해 초기 렌더에 포함(워터폴 없음), 이후 정렬/검색/필터는 `data-table`에 한해 클라이언트 사이드로 재조회
- 컴포넌트 하나가 예외를 던져도 나머지는 정상 렌더(에러 바운더리로 격리)
- 관리자 전용 코드(빌더, React Flow 등)는 운영 번들에서 완전히 제외(빌드 산출물로 확인)
- 미배포 상태 안내 화면, 404 안내 화면, `GET /api/health`로 활성 리비전 확인 가능

## 디렉터리 구조

```
src/
├─ app/
│  ├─ (public)/home/[[...slug]]/   # 운영 렌더러 (동적 라우트)
│  ├─ (admin)/admin/               # 관리자 4단계 워크플로(builder→graph→validate→deploy)
│  ├─ login/
│  └─ api/                         # admin/*, runtime/*, auth/*, health
├─ components/
│  ├─ ui/          # shadcn/ui 생성물
│  ├─ shell/       # 사이드바/헤더 등 공통 셸
│  ├─ builder/     # 캔버스, 팔레트, 속성 패널 등 에디터 전용
│  ├─ graph/       # React Flow 캔버스, 커스텀 노드/엣지
│  ├─ data/        # 엔티티/필드 관리 UI
│  ├─ validate/    # 검증 결과 화면
│  ├─ deploy/      # 배포 화면
│  └─ runtime/     # 운영 렌더러(RuntimeRenderer)
├─ lib/
│  ├─ registry/     # 컴포넌트 카탈로그(64종) 정의
│  ├─ runtime/      # 스펙 → React 렌더 인터프리터, 바인딩 실행
│  ├─ data-engine/  # 동적 DDL/DML, 쿼리 빌더(식별자 화이트리스트 + 파라미터 바인딩)
│  ├─ validation/   # 51개 규칙 엔진
│  ├─ actions/      # 액션 실행기(executor.ts — 활성 리비전 기준 실행)
│  ├─ deploy/       # 배포 트랜잭션(publish.ts), 백업/복원, diff 계산
│  ├─ auth/
│  └─ db/           # prisma client, app.db(better-sqlite3) client
└─ types/             # zod 스키마(설계 메타데이터의 단일 진실 공급원)
```

## 로컬 개발

```bash
pnpm install
pnpm prisma migrate dev   # 메타 DB
pnpm db:init               # 운영 DB(app.db) 초기화
pnpm dev                   # http://localhost:3100
```

검사:

```bash
pnpm typecheck
pnpm lint
pnpm test          # vitest, 204개 단위 테스트
pnpm test:e2e       # Playwright, 10개 시나리오
```

> **E2E는 운영 DB를 건드리지 않는다.** `pnpm test:e2e`는 실행마다 `prisma/test-meta.db`와
> `data/test-app.db`를 새로 만들어(마이그레이션 적용 + 관리자 계정만 시드) 그 위에서만 돈다 —
> dev 서버에 `META_DB_PATH`/`APP_DB_PATH`를 주입하는 방식이며, 경로 결정은 `src/lib/db/paths.ts`
> 한 곳에 모여 있다. 각 테스트는 자기가 만든 페이지만 쓰고 끝나면 지운다.

> 로컬 프로덕션 빌드(`pnpm build && pnpm start`)와 `pnpm dev`는 서로 다른 `.next` 출력 폴더를 쓰도록 분리되어 있다(`next.config.ts`의 `distDir`) — 운영 배포(pm2)와 개발 서버를 동시에 켜둬도 서로의 빌드 산출물을 깨뜨리지 않는다.

## 운영 배포

`next start`를 pm2로 상시 실행하고 Cloudflare Tunnel(`https://demo.dove9999.com`)로 외부에 노출한다. pm2·cloudflared 둘 다 관리자 권한 없이 로그인 시 자동 복구되도록 등록되어 있다. 처음부터 다시 구성하는 절차, 백업/복원, 보안 체크리스트는 [deploy/README.md](deploy/README.md)에 전부 정리되어 있다.

## 운영 구성 — 반도체 품질관리(QMS)

이 빌더로 만들어 현재 배포되어 있는 서비스. 설계 데이터는 전부 관리자 화면에서 편집·재배포할 수 있다.

| 화면 | 내용 |
|---|---|
| 품질 대시보드 | KPI 4종(진행 로트·평균 수율·미결 이슈·SPC 이탈, 실시간 집계), 일별 수율 추이/이동평균, 불량 유형·이슈 단계 분포, 주의 로트·미결 이슈 목록 |
| 로트 관리 / 수입 검사 | 로트 목록 + 신규 로트 등록 폼, 협력사 자재 수입검사 실적 |
| 검사 실적 / SPC 계측 | 검사 실적 등록 폼, X̄ 관리도·공정능력(Cp/Cpk)·Cpk 박스플롯·정규확률도 |
| 불량 분석 / 품질 이슈 / 시정 조치 | 불량 이력, 파레토·분포 분석, NCR 접수 폼(접수와 동시에 CAPA를 한 트랜잭션으로 개설), CAPA 진행 현황 |
| 설비 현황 | 설비 마스터, 가동률 분포·유형별 비교, PM 일정 |

엔티티 9종(`lots`, `inspections`, `defects`, `measurements`, `equipments`, `quality_issues`,
`capa_actions`, `incoming_materials`, `daily_quality`) · 시드 데이터 289행.

## 알려진 제한사항

- `select`/`native-select`/`date-picker` 등 일부 입력 컴포넌트는 값 바인딩을 지원하지 않는다(정적 렌더) — 운영 폼은 `input`으로 구성하고 ENUM은 액션의 고정값으로 채운다.
- 우측 플로팅 패널은 화면 폭 1024px 미만에서는 숨는다.
- `data-table`의 정렬·검색·페이지네이션은 서버가 미리 가져온 한 페이지 분량 안에서만 클라이언트로 동작한다(`POST /api/runtime/query`로 서버 사이드 재조회하는 확장은 아직 없음).
- 오버레이 계열(`dialog`/`sheet`/`drawer` 등)의 `openModal`/`closeModal` 효과는 수신만 되고 실제로 열리지는 않는다.
- 컴포넌트 렌더 오류는 화면에서는 정상적으로 격리되지만, 해당 최초 SSR 응답의 HTTP 상태 코드는 500으로 남는다(Next.js App Router 스트리밍 SSR의 특성).

자세한 배경과 발견 경위는 [PROGRESS.md](PROGRESS.md)의 각 Phase 완료 기록, 특히 마지막 "P8 완료" 항목을 참고.
