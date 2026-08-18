# CLAUDE.md — WebApp_V1 프로젝트 규칙

이 파일은 Claude Code가 이 저장소에서 작업할 때 **항상 준수해야 하는 규칙**이다.
기능 요구사항의 상세 내용은 `SPEC.md`에 있다. 이 문서는 "어떻게 일할지"를 정의한다.

---

## 1. 프로젝트 한 줄 요약

관리자가 **화면·컴포넌트·DB·동작을 GUI로 설계**하면, 검증을 거쳐 **운영 사이트(`/home`)에 즉시 배포**되는 사내 업무용 노코드 웹 애플리케이션 빌더.

---

## 2. 기술 스택 (고정 — 변경 금지)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js 15 (App Router)** | React 19, TypeScript strict |
| 스타일 | **Tailwind CSS v4** | |
| UI 킷 | **shadcn/ui** (공식 CLI로 설치) | 디자인 레퍼런스는 SPEC.md §3 Figma 링크 |
| 아이콘 | **lucide-react** | shadcn 기본 아이콘 세트 |
| 메타 DB | **SQLite + Prisma** (`prisma/meta.db`) | 설계 메타데이터 전용 |
| 운영 DB | **SQLite + better-sqlite3** (`data/app.db`) | 관리자가 설계한 테이블. 동적 DDL |
| 드래그&드롭 | **@dnd-kit/core**, `@dnd-kit/sortable` | 페이지 트리 / 캔버스 배치 |
| 관계도 | **@xyflow/react** (React Flow 12) | 노드 그래프, `snapToGrid` |
| 폼/검증 | **react-hook-form + zod** | |
| 상태 | **zustand** (에디터 로컬 상태) | 서버 상태는 Server Actions + `revalidateTag` |
| 인증 | **iron-session** 기반 쿠키 세션 | 관리자 1계정, SPEC.md §7.1 |
| 테스트 | **vitest** (단위) + **@playwright/test** (E2E) | |
| 배포 | **`next start` + Cloudflare Tunnel** | `demo.dove9999.com` (2026-08-18, 기존 `dove-web-service` 터널 재사용으로 확정 — 최초 계획이던 `demo1.`이 아님) |

> 위 표에 없는 라이브러리를 새로 추가해야 하면, 추가 **전에** 사용자에게 이유와 대안을 보고하고 승인받는다.

---

## 3. 디렉토리 구조 (이 구조를 유지한다)

```
WebApp_V1/
├─ CLAUDE.md                  # 이 파일
├─ SPEC.md                    # 요구사항/구현 명세
├─ PROGRESS.md                # 진행률 로그 (§6 참조, 매 Phase 갱신)
├─ prisma/
│  ├─ schema.prisma           # 메타 DB 스키마 (고정 스키마)
│  └─ migrations/
├─ data/
│  └─ app.db                  # 운영 DB (동적 스키마, git 무시)
├─ src/
│  ├─ app/
│  │  ├─ (public)/home/[[...slug]]/page.tsx   # 운영 렌더러 (동적 라우트)
│  │  ├─ (admin)/admin/
│  │  │  ├─ layout.tsx        # 관리자 셸 (3분할)
│  │  │  ├─ builder/page.tsx  # 1단계: layout 구성
│  │  │  ├─ graph/page.tsx    # 2단계: 관계도
│  │  │  ├─ data/page.tsx     # DB 설계
│  │  │  ├─ validate/page.tsx # 3단계: 구성 검증
│  │  │  └─ deploy/page.tsx   # 4단계: 수정본 배포
│  │  ├─ login/page.tsx
│  │  └─ api/                 # Route Handlers (SPEC.md §10)
│  ├─ components/
│  │  ├─ ui/                  # shadcn/ui 생성물 — 직접 수정 최소화
│  │  ├─ shell/               # AppSidebar, Breadcrumb, TopBar 등
│  │  ├─ builder/             # 에디터 전용 컴포넌트
│  │  └─ runtime/             # 운영 렌더러 컴포넌트
│  ├─ lib/
│  │  ├─ registry/            # 컴포넌트 카탈로그 정의 (SPEC.md §8)
│  │  ├─ runtime/             # 스펙 → React 렌더 인터프리터
│  │  ├─ data-engine/         # 동적 DDL/DML, 쿼리 빌더
│  │  ├─ validation/          # 검증 규칙 엔진 (SPEC.md §11)
│  │  ├─ actions/             # 액션 실행기 (SPEC.md §9)
│  │  ├─ auth/
│  │  └─ db/                  # prisma client, sqlite client
│  └─ types/                  # 공유 타입 (spec 스키마 zod 정의 포함)
├─ tests/
│  ├─ unit/
│  └─ e2e/
└─ deploy/
   ├─ cloudflared/config.yml
   └─ README.md
```

---

## 4. 코딩 규칙

### 4.1 필수
- **TypeScript strict**. `any` 금지. 불가피하면 `unknown` + 좁히기, 그리고 `// WHY:` 주석.
- 스펙(설계 메타데이터) 관련 모든 객체는 **zod 스키마를 단일 진실 공급원(single source of truth)** 으로 두고 `z.infer`로 타입을 파생한다. 타입과 런타임 검증을 이중으로 작성하지 않는다.
- 운영 DB(`app.db`) 접근은 **반드시** `src/lib/data-engine`을 경유한다. 컴포넌트/라우트에서 직접 SQL 문자열을 만들지 않는다.
- 동적 SQL은 **식별자 화이트리스트 + 파라미터 바인딩** 으로만 만든다. 사용자 입력을 SQL에 문자열 연결하는 코드는 리뷰 즉시 반려 대상.
- 서버 전용 모듈 최상단에 `import 'server-only'`.
- 클라이언트 컴포넌트는 필요한 최소 경계에서만 `'use client'`. 페이지 전체를 클라이언트로 만들지 않는다.

### 4.2 금지
- `localStorage` / `sessionStorage`를 **설계 데이터 저장 용도로** 사용 금지. 모든 설계 상태는 서버(메타 DB)에 저장한다. (편집 중 임시 스냅샷 캐시는 예외로 허용하되 진실 공급원이 되어서는 안 된다.)
- `prisma/meta.db`의 스키마를 런타임에 변경하지 않는다. 동적 스키마는 `app.db`에만 적용된다.
- 운영 페이지(`/home/*`)에 관리자 전용 코드/번들을 포함시키지 않는다.
- 하드코딩된 데모 데이터로 "동작하는 것처럼" 만들지 않는다. 미구현이면 명확히 미구현으로 표시하고 PROGRESS.md에 남긴다.

### 4.3 명명
- 파일: 컴포넌트 `PascalCase.tsx`, 그 외 `kebab-case.ts`
- DB(메타): Prisma 모델 `PascalCase`, 필드 `camelCase`
- DB(운영, 동적): 테이블/컬럼 `snake_case`. 관리자 입력 이름은 `slugify → snake_case`로 정규화하고 원래 표시명은 메타에 별도 보관.

---

## 5. 작업 순서 원칙

1. `SPEC.md`의 **Phase 순서를 지킨다**. Phase N의 수용 기준(Acceptance Criteria)을 전부 통과하기 전에 Phase N+1을 시작하지 않는다.
2. 각 Phase 시작 시 해당 Phase의 수용 기준을 그대로 테스트 파일 스켈레톤으로 옮긴다.
3. Phase 종료 시 다음을 모두 통과해야 한다:
   - `pnpm typecheck` 무경고
   - `pnpm lint` 무경고
   - `pnpm test` 전체 통과
   - 해당 Phase의 E2E 시나리오 통과
4. 스펙과 구현이 충돌하면 **구현을 스펙에 맞춘다**. 스펙이 틀렸다고 판단되면 코드를 먼저 바꾸지 말고 사용자에게 보고한다.

---

## 6. 진행률 보고 프로토콜 (요구사항 명세 3항)

사용자는 **구현 수준(%)과 예상 남은 시간**을 지속적으로 보고받기를 요구했다. 다음을 준수한다.

### 6.1 보고 시점
- 각 Phase **시작 시**와 **종료 시**
- 하나의 Phase 안에서 40분 이상 소요되는 작업 단위가 끝날 때마다
- 사용자가 물어볼 때 즉시

### 6.2 보고 형식 (이 형식 그대로)

```
📊 진행 상황
├ 전체 진척도: 34% (Phase 3 / 8)
├ 현재 작업: 관계도 노드 편집기 — 연결선 검증 로직
├ 이번 Phase: 60% (수용 기준 3/5 통과)
├ 예상 남은 시간: 약 6h 30m (전체) / 45m (현재 Phase)
└ 리스크: 동적 DDL 롤백 처리 미검증
```

### 6.3 % 계산 방식 (임의로 감으로 정하지 말 것)
전체 진척도 = `Σ(완료 Phase 가중치) + (현재 Phase 가중치 × 현재 Phase 내부 진척률)`
- Phase 가중치는 SPEC.md §12 표의 값을 사용한다.
- 현재 Phase 내부 진척률 = `통과한 수용 기준 수 / 전체 수용 기준 수`
- 근거 없는 반올림 상향 금지. 통과하지 않은 기준을 통과로 세지 않는다.

### 6.4 PROGRESS.md
매 보고 시 `PROGRESS.md`에 같은 내용을 타임스탬프와 함께 append 한다. 이 파일이 진척도의 기록이다.

---

## 7. 커밋 규칙

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- 스코프에 Phase를 넣는다: `feat(p3): 관계도 그리드 스냅 배치`
- 하나의 커밋은 하나의 논리적 변경. 동작하지 않는 중간 상태를 커밋하지 않는다.
- 사용자가 요청하지 않으면 push 하지 않는다.

---

## 8. 로컬 실행

```bash
pnpm install
pnpm prisma migrate dev          # 메타 DB
pnpm db:init                     # 운영 DB(app.db) 초기화
pnpm dev                         # http://localhost:3000
pnpm build && pnpm start         # 운영 모드
```

관리자 계정: `admin` / `123456` (SPEC.md §7.1 — 초기 자격증명, 해시로 시딩)

---

## 9. 막혔을 때

같은 오류를 **3회 이상** 다른 방법으로 시도해도 해결되지 않으면 멈추고 사용자에게 보고한다. 보고에는 시도한 방법, 관찰된 증상, 선택 가능한 대안 2~3개와 각각의 트레이드오프를 포함한다. 추측으로 계속 진행하지 않는다.
