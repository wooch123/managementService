# SPEC.md — WebApp_V1 구현 명세서

> **문서 목적**: 이 문서는 Claude Code가 코드를 생성하기 위한 실행 가능한 명세다. 모호한 서술 대신 데이터 모델, API 계약, 화면 요소, 수용 기준을 명시한다.
> **원본 요구사항**: `요구사항 명세.txt` (2026-08-17 기준), `layout_sample.png`
> **작업 규칙**: `CLAUDE.md` 참조

---

## 목차

1. [제품 정의와 범위](#1-제품-정의와-범위)
2. [핵심 아키텍처: 설계-배포 분리 모델](#2-핵심-아키텍처-설계-배포-분리-모델)
3. [디자인 시스템](#3-디자인-시스템)
4. [전역 레이아웃 명세](#4-전역-레이아웃-명세)
5. [데이터 모델 — 메타 DB](#5-데이터-모델--메타-db)
6. [데이터 모델 — 운영 DB (동적)](#6-데이터-모델--운영-db-동적)
7. [인증](#7-인증)
8. [관리자 모드 화면 명세](#8-관리자-모드-화면-명세)
9. [액션 시스템](#9-액션-시스템)
10. [API 계약](#10-api-계약)
11. [구성 검증 규칙](#11-구성-검증-규칙)
12. [운영 모드 (`/home`) 렌더링 명세](#12-운영-모드-home-렌더링-명세)
13. [배포](#13-배포)
14. [Phase별 구현 계획](#14-phase별-구현-계획)
15. [요구사항 추적 매트릭스](#15-요구사항-추적-매트릭스)
16. [미결 사항](#16-미결-사항)

---

## 1. 제품 정의와 범위

### 1.1 한 문장 정의

현업 담당자가 코드를 쓰지 않고 **업무 화면을 설계하고, 그 화면이 붙을 데이터베이스를 설계하고, 사용자 상호작용의 동작을 정의한 뒤, 검증을 거쳐 운영 사이트에 배포**할 수 있는 사내 웹 애플리케이션.

### 1.2 두 개의 모드

| 모드 | 경로 | 대상 | 성격 |
|---|---|---|---|
| **운영 모드** | `/home`, `/home/{page-slug}` | 현업 사용자 | 배포된 스펙을 해석해 렌더링. 읽기/쓰기 업무 수행 |
| **관리자 모드** | `/admin/*` | 관리자 (로그인 필수) | 스펙을 편집·검증·배포 |

`/` 접근 시 `/home`으로 리다이렉트한다.

### 1.3 관리자 워크플로 (4단계, 순서 고정)

```
① layout 구성 ──▶ ② 관계도 ──▶ ③ 구성 검증 ──▶ ④ 수정본 배포
   /admin/builder    /admin/graph    /admin/validate    /admin/deploy
```

관리자 셸 상단에 이 4단계를 **스텝퍼(Stepper)** 로 항상 표시한다. 각 단계는 자유롭게 이동 가능하지만, ④ 배포 버튼은 ③ 검증이 **에러 0건**으로 통과한 상태에서만 활성화된다.

DB 설계는 ①과 ② 사이에 자연스럽게 오가는 작업이므로 별도 탭 `/admin/data`로 분리하되, 스텝퍼상으로는 ① 단계에 속한 보조 화면으로 취급한다.

### 1.4 V1 범위 (In Scope)

- 페이지 CRUD, 계층 구조(2단: 메뉴 / 서브메뉴), 드래그&드롭 순서 변경
- 페이지 아이콘 선택 (lucide 전체, 검색 가능)
- shadcn/ui 전체 컴포넌트를 그룹별로 제공하는 컴포넌트 팔레트
- 캔버스에 컴포넌트 드래그&드롭 배치 + 12칼럼 그리드 스냅
- 우측 속성 패널로 컴포넌트별 속성 편집
- 엔티티(테이블)/필드/관계 설계, 컴포넌트-데이터 바인딩
- 관계도(노드 그래프): Page / Component / Entity / Action 노드와 연결선
- 검증 엔진 (§11 규칙 전체)
- 리비전 스냅샷 기반 배포 + 롤백
- 운영 모드 렌더러 (배포된 스펙 해석)

### 1.5 V1 제외 (Out of Scope — 명시적으로 만들지 않는다)

- 다중 사용자 계정/권한(RBAC): 관리자 1계정만. 운영 모드는 익명 접근.
- 실시간 협업 편집(CRDT)
- 커스텀 코드(JS) 주입 필드
- 외부 API 커넥터
- 다국어(i18n)
- 모바일 전용 편집기 (운영 화면의 반응형은 In Scope, 편집기는 데스크톱 전용)

---

## 2. 핵심 아키텍처: 설계-배포 분리 모델

이 프로젝트의 성패는 이 절의 설계에 달려 있다. **코드 생성(codegen)이 아니라 스펙 해석(interpretation)** 방식을 채택한다.

### 2.1 왜 인터프리터인가

관리자가 배포를 누를 때 Next.js 소스 파일을 생성하고 재빌드하는 방식은 로컬 PC 호스팅 환경에서 배포마다 수십 초~수 분의 다운타임과 빌드 실패 리스크를 만든다. 대신:

> **배포 = 드래프트 스펙(JSON)을 불변 리비전으로 스냅샷하고, `activeRevisionId` 포인터를 교체하는 것.**

운영 라우트는 활성 리비전을 읽어 런타임에 컴포넌트 트리를 렌더링한다. 배포는 원자적이고, 즉시 반영되며, 포인터를 되돌리면 롤백이다.

### 2.2 3개의 저장 계층

```
┌─────────────────────────────────────────────────────────┐
│ ① 메타 DB  prisma/meta.db  (Prisma, 고정 스키마)         │
│    Page / ComponentNode / Entity / Field / Relation /   │
│    Action / GraphNode / GraphEdge / Revision / User     │
│    → 관리자가 편집하는 "드래프트" 설계 원본               │
├─────────────────────────────────────────────────────────┤
│ ② 리비전 스냅샷  Revision.specJson (메타 DB 내 TEXT)     │
│    → 배포 시점의 설계 전체를 직렬화한 불변 JSON           │
│    → 운영 모드가 읽는 유일한 소스                        │
├─────────────────────────────────────────────────────────┤
│ ③ 운영 DB  data/app.db  (better-sqlite3, 동적 스키마)    │
│    관리자가 설계한 엔티티가 실제 테이블로 존재            │
│    → 현업 사용자의 업무 데이터                           │
└─────────────────────────────────────────────────────────┘
```

**중요**: 설계 메타데이터와 업무 데이터를 같은 DB에 섞지 않는다. 메타 DB는 Prisma 마이그레이션으로 관리되는 정적 스키마이고, 운영 DB는 런타임 DDL로 변하는 동적 스키마다. 하나의 Prisma 스키마로 둘을 모두 다루려는 시도는 반드시 실패한다.

### 2.3 배포 트랜잭션

배포 버튼을 누르면 다음이 **순서대로** 실행되고, 어느 단계든 실패하면 전체를 되돌린다.

```
1. 드래프트 스펙 로드 → zod 파싱 (구조 무효 시 즉시 중단)
2. 검증 엔진 실행 (§11) → error 1건 이상이면 중단
3. app.db 파일 백업 → data/backups/app-{revisionNo}-{ts}.db
4. 스키마 diff 계산: 이전 활성 리비전의 엔티티 정의 vs 드래프트
5. app.db에 마이그레이션 SQL 적용 (BEGIN IMMEDIATE 트랜잭션)
   - 지원: CREATE TABLE / ADD COLUMN / CREATE INDEX / RENAME
   - 파괴적 변경(DROP COLUMN, 타입 변경, NOT NULL 추가)은
     "확인 다이얼로그 + 영향 행 수 표시" 후에만 진행
6. Revision 레코드 생성 (specJson, migrationSql, revisionNo = max+1)
7. Deployment.activeRevisionId = 새 리비전 (단일 행 테이블)
8. revalidateTag('published-spec') → 운영 모드 캐시 무효화
```

실패 시: SQL 트랜잭션 롤백 → 백업 파일 복원 → 리비전 레코드 삭제 → 사용자에게 실패 단계와 원인 표시.

### 2.4 스펙 JSON 형태 (리비전 스냅샷)

```ts
// src/types/spec.ts — zod 스키마가 진실 공급원
type PublishedSpec = {
  specVersion: 1;
  revisionNo: number;
  publishedAt: string;      // ISO
  pages: PageSpec[];
  entities: EntitySpec[];
  actions: ActionSpec[];
  relations: RelationSpec[];
  theme: { radius: number; baseColor: string };
};

type PageSpec = {
  id: string;
  slug: string;             // URL 세그먼트, 소문자-하이픈
  title: string;
  icon: string | null;      // lucide 아이콘 이름 (e.g. "shopping-cart")
  parentId: string | null;  // 2단 계층
  order: number;
  isVisible: boolean;
  isHome: boolean;          // /home 기본 표시 페이지 (정확히 1개)
  layout: { cols: 12; rowHeight: number; gap: number };
  nodes: ComponentNodeSpec[];  // 평면 배열, parentNodeId로 트리 구성
};

type ComponentNodeSpec = {
  id: string;
  type: string;             // 컴포넌트 카탈로그 키 (e.g. "data-table")
  parentNodeId: string | null;
  order: number;
  grid: { col: number; span: number; row: number; rowSpan: number };
  props: Record<string, unknown>;       // 카탈로그 propsSchema로 검증
  binding: BindingSpec | null;          // §6.4
  events: Record<string, string>;       // 이벤트명 → actionId
};
```

---

## 3. 디자인 시스템

### 3.1 레퍼런스

- **Figma**: [shadcn_ui kit for Figma (PRO) 2026.7](https://www.figma.com/design/aYBArRThYTynjrqJBNRIdQ/shadcn_ui-kit-for-Figma--PRO----2026.7--Community-?node-id=11002-7884)
  → 요구사항에서 언급되는 "shadcn"은 모두 이 킷의 요소를 의미한다. 컴포넌트 시각 스펙(간격, 반경, 상태별 스타일)이 코드와 어긋날 경우 Figma를 기준으로 맞춘다.
- **코드**: [ui.shadcn.com](https://ui.shadcn.com) 공식 컴포넌트. `pnpm dlx shadcn@latest add <name>` 으로 설치.
- **레이아웃 참조 이미지**: `layout_sample.png` (프로젝트 루트)
  > 원본 요구사항 문서에는 경로가 `F:\Codex\Web_application\layout_sample.png`로 적혀 있으나 실제 파일은 `F:\Claude\WebApp_V1\layout_sample.png`에 있다. 후자를 사용한다.

### 3.2 토큰

```
radius: 0.625rem (shadcn 기본)
baseColor: neutral
font: Geist Sans / Geist Mono
다크 모드: class 전략, 시스템 설정 따름 + 토글 제공
```

### 3.3 컴포넌트 설치 목록

Phase 1에서 아래 전체를 한 번에 설치한다. (§8.3 팔레트가 전부를 노출해야 하므로 부분 설치는 의미가 없다.)

```
# Default components
accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button
button-group calendar card carousel chart checkbox collapsible combobox
command context-menu data-table date-picker dialog drawer dropdown-menu
empty field hover-card input input-group input-otp item kbd label menubar
native-select navigation-menu pagination popover progress radio-group
resizable scroll-area select separator sheet sidebar skeleton slider
spinner switch table tabs textarea toast toggle toggle-group tooltip
typography

# Utility components (요구사항 R29 — 반드시 포함)
attachment bubble marker message message-scroller questionnaire direction
```

> 설치 시점의 레지스트리에 위 항목 중 존재하지 않는 것이 있으면 **임의로 건너뛰지 말고** 어떤 항목이 없었는지 기록해 진행 보고에 포함한다. 반대로 레지스트리에 새로 추가된 컴포넌트가 있으면 함께 설치하고 §8.3 카탈로그에 그룹을 지정해 등록한다.

---

## 4. 전역 레이아웃 명세

`layout_sample.png` 를 기준으로 한다. 운영 모드와 관리자 모드가 이 셸을 공유하되, 관리자 모드는 본문 영역이 3분할된다.

### 4.1 공통 셸 구조

```
┌───────────────┬─────────────────────────────────────────────┐
│ ▣ Brand       │ [◧] │ Store  >  ...  >  Orders              │ ← 헤더 56px
│   v1.0.1   ⌃⌄ ├─────────────────────────────────────────────┤
├───────────────┤                                             │
│ ▸ Playground  │  Orders                     [🔍 Search] [+] │ ← 페이지 헤더
│ ▾ Models      │                                             │
│    Sub Item   │  ┌──────── 본문 (12칼럼 그리드) ────────┐    │
│    Sub Item   │  │                                     │    │
│ ▸ Email       │  │                                     │    │
│ ▸ Affiliates  │  └─────────────────────────────────────┘    │
│ ▸ Settings    │                                             │
│               │                                             │
├───────────────┤                                             │
│ 👤 사용자      │                                             │
│   ⌃⌄          │                                             │
└───────────────┴─────────────────────────────────────────────┘
  사이드바 256px
```

### 4.2 사이드바 (`components/shell/AppSidebar.tsx`)

shadcn `sidebar` 컴포넌트 기반.

| 영역 | 내용 |
|---|---|
| 헤더 | 사각 브랜드 아이콘(40×40, radius 8) + 앱 이름 + 버전 텍스트 + `ChevronsUpDown` 아이콘 |
| 본문 | 페이지 메뉴. 각 항목 = `[아이콘 16px] [라벨] [자식 있으면 ChevronRight]`. 자식 있는 항목은 `collapsible`로 펼침, 자식은 좌측 들여쓰기 + 아이콘 없음 |
| 푸터 | 아바타 32px + 이름/이메일 2줄 + `ChevronsUpDown`. 클릭 시 dropdown-menu (관리자 모드에서는 로그아웃 포함) |

- 너비 256px, 접기 시 아이콘만 표시(48px). 헤더의 `[◧]` 버튼이 토글.
- 현재 페이지 항목은 배경 강조.
- 반응형: `< 768px`에서 사이드바는 `sheet`로 전환(오버레이 드로어).

### 4.3 헤더

- 좌측: 사이드바 토글 버튼, 세로 구분선, breadcrumb.
- Breadcrumb은 페이지 계층에서 자동 생성. 3단 초과 시 중간을 `...` (dropdown-menu)로 축약.
- 관리자 모드에서는 breadcrumb 우측에 4단계 스텝퍼와 `드래프트 변경 N건` 배지, `배포` 버튼을 배치.

### 4.4 본문 그리드

- 12칼럼, gap 16px, 좌우 패딩 24px, 최대 폭 제한 없음(전체 폭 사용).
- 행 높이 기본 8px 단위. 컴포넌트는 `col/span/row/rowSpan`으로 배치된다.
- 반응형 축소 규칙: `≥1280px` 12칼럼 / `768–1279px` 6칼럼(span은 비율 유지 후 반올림, 최소 1) / `<768px` 1칼럼(순서대로 세로 스택). 이 규칙은 렌더러가 자동 적용하며 관리자가 별도 설정하지 않는다.

---

## 5. 데이터 모델 — 메타 DB

`prisma/schema.prisma`. SQLite. 아래를 그대로 구현한다.

```prisma
datasource db { provider = "sqlite"; url = "file:./meta.db" }
generator client { provider = "prisma-client-js" }

// ── 인증 ──
model AdminUser {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// ── 페이지 (드래프트) ──
model Page {
  id        String  @id @default(cuid())
  slug      String  @unique
  title     String
  icon      String?              // lucide 아이콘 kebab-case 이름
  parentId  String?
  parent    Page?   @relation("PageTree", fields: [parentId], references: [id])
  children  Page[]  @relation("PageTree")
  order     Int
  isVisible Boolean @default(true)
  isHome    Boolean @default(false)
  layoutCols Int    @default(12)
  rowHeight  Int    @default(8)
  gap        Int    @default(16)
  nodes     ComponentNode[]
  graphNode GraphNode?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([parentId, order])
}

// ── 컴포넌트 인스턴스 (드래프트) ──
model ComponentNode {
  id           String  @id @default(cuid())
  pageId       String
  page         Page    @relation(fields: [pageId], references: [id], onDelete: Cascade)
  type         String                    // 카탈로그 키
  parentNodeId String?
  parentNode   ComponentNode?  @relation("NodeTree", fields: [parentNodeId], references: [id])
  childNodes   ComponentNode[] @relation("NodeTree")
  order        Int
  gridCol      Int @default(1)
  gridSpan     Int @default(12)
  gridRow      Int @default(1)
  gridRowSpan  Int @default(4)
  propsJson    String  @default("{}")    // 카탈로그 propsSchema로 검증
  bindingJson  String?                   // BindingSpec
  eventsJson   String  @default("{}")    // { onClick: actionId, ... }
  label        String?                   // 관계도/트리 표시용 별칭
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([pageId, parentNodeId, order])
}

// ── 데이터 설계 ──
model Entity {
  id          String  @id @default(cuid())
  name        String  @unique            // 표시명 (한글 허용)
  tableName   String  @unique            // 물리 테이블명 snake_case
  description String?
  fields      Field[]
  order       Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Field {
  id         String  @id @default(cuid())
  entityId   String
  entity     Entity  @relation(fields: [entityId], references: [id], onDelete: Cascade)
  name       String                       // 표시명
  columnName String                       // 물리 컬럼명 snake_case
  dataType   String                       // TEXT|INTEGER|REAL|BOOLEAN|DATE|DATETIME|JSON|ENUM|REF
  isRequired Boolean @default(false)
  isUnique   Boolean @default(false)
  isPrimary  Boolean @default(false)
  defaultVal String?
  enumValues String?                      // JSON 배열 (dataType=ENUM)
  refEntityId String?                     // dataType=REF 일 때 대상 엔티티
  order      Int
  @@unique([entityId, columnName])
  @@index([entityId, order])
}

// ── 관계 (관계도의 연결선) ──
model Relation {
  id         String @id @default(cuid())
  fromType   String   // PAGE | COMPONENT | ENTITY | ACTION
  fromId     String
  toType     String
  toId       String
  kind       String   // CONTAINS | READS | WRITES | TRIGGERS | NAVIGATES | REFERENCES
  cardinality String? // ONE_TO_ONE | ONE_TO_MANY | MANY_TO_MANY  (ENTITY↔ENTITY)
  labelText  String?
  metaJson   String @default("{}")
  createdAt DateTime @default(now())
  @@unique([fromType, fromId, toType, toId, kind])
}

// ── 동작 정의 ──
model Action {
  id          String @id @default(cuid())
  name        String @unique
  kind        String   // CREATE|UPDATE|DELETE|QUERY|NAVIGATE|OPEN_MODAL|CLOSE_MODAL|TOAST|EXPORT_CSV|COMPOSITE
  configJson  String @default("{}")   // kind별 스키마 — §9
  description String?
  graphNode   GraphNode?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ── 관계도 노드 좌표 ──
model GraphNode {
  id        String @id @default(cuid())
  refType   String   // PAGE | COMPONENT | ENTITY | ACTION
  refId     String   @unique
  x         Int
  y         Int
  width     Int    @default(220)
  height    Int    @default(120)
  isPinned  Boolean @default(false)
  pageId    String? @unique
  page      Page?   @relation(fields: [pageId], references: [id], onDelete: Cascade)
  actionId  String? @unique
  action    Action? @relation(fields: [actionId], references: [id], onDelete: Cascade)
}

// ── 배포 ──
model Revision {
  id           String @id @default(cuid())
  revisionNo   Int    @unique
  specJson     String              // PublishedSpec 직렬화
  migrationSql String?             // 이 리비전에서 app.db에 적용한 DDL
  note         String?
  publishedAt  DateTime @default(now())
  publishedBy  String
}

model Deployment {
  id               String @id @default("singleton")
  activeRevisionId String?
  updatedAt        DateTime @updatedAt
}

// ── 검증 결과 캐시 ──
model ValidationRun {
  id         String   @id @default(cuid())
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  errorCount Int      @default(0)
  warnCount  Int      @default(0)
  resultJson String   @default("[]")   // ValidationIssue[]
  specHash   String                    // 드래프트 해시 — 변경 시 결과 무효화
}
```

### 5.1 시딩

`prisma/seed.ts`:
- `AdminUser`: `admin` / bcrypt(`123456`)
- `Deployment`: `{ id: "singleton", activeRevisionId: null }`
- 초기 페이지 3개(`대시보드`(isHome), `주문 관리`, `설정`)와 샘플 엔티티 1개(`주문`)를 만들어 빈 화면을 피한다.

---

## 6. 데이터 모델 — 운영 DB (동적)

### 6.1 파일과 접근

`data/app.db`, `better-sqlite3` 동기 API. WAL 모드, `foreign_keys = ON`.
접근은 전부 `src/lib/data-engine/*`를 경유한다.

### 6.2 타입 매핑

| 설계 dataType | SQLite 물리 타입 | 저장 형태 | 폼 입력 컴포넌트 |
|---|---|---|---|
| TEXT | TEXT | 문자열 | input / textarea |
| INTEGER | INTEGER | 정수 | input[type=number] |
| REAL | REAL | 실수 | input[type=number] |
| BOOLEAN | INTEGER | 0/1 | switch / checkbox |
| DATE | TEXT | `YYYY-MM-DD` | date-picker |
| DATETIME | TEXT | ISO 8601 UTC | date-picker + time |
| JSON | TEXT | JSON 문자열 | textarea (JSON 검증) |
| ENUM | TEXT | 허용값 중 하나 + CHECK 제약 | select / radio-group |
| REF | TEXT | 대상 테이블 `id` + FK | combobox (대상 조회) |

### 6.3 모든 동적 테이블의 암묵 컬럼

관리자가 정의하지 않아도 항상 생성한다:

```sql
id          TEXT PRIMARY KEY,       -- cuid, 애플리케이션 생성
created_at  TEXT NOT NULL,          -- ISO
updated_at  TEXT NOT NULL
```

관리자가 `isPrimary` 필드를 지정하면 그 필드에 `UNIQUE NOT NULL` 인덱스를 추가하되, 물리 PK는 항상 `id`를 유지한다. (PK 교체는 SQLite에서 테이블 재작성을 요구하므로 V1에서 허용하지 않는다.)

### 6.4 바인딩 스펙

컴포넌트가 데이터에 연결되는 방식.

```ts
type BindingSpec =
  | { mode: 'static' }                                    // 데이터 없음
  | { mode: 'list';   entityId: string; select: string[];
      filters: Filter[]; sort: Sort[]; pageSize: number }  // table, data-table, chart, carousel
  | { mode: 'single'; entityId: string; select: string[];
      keySource: 'route' | 'selection' | 'fixed';
      keyValue?: string }                                  // card, detail form
  | { mode: 'field';  entityId: string; fieldId: string }  // input, select, switch …
  | { mode: 'aggregate'; entityId: string; fn: 'count'|'sum'|'avg'|'min'|'max';
      fieldId?: string; filters: Filter[] };               // stat tile

type Filter = { fieldId: string; op: 'eq'|'ne'|'gt'|'gte'|'lt'|'lte'|'contains'|'in'|'isNull';
                source: 'fixed'|'query'|'component'; value?: unknown; ref?: string };
type Sort   = { fieldId: string; dir: 'asc'|'desc' };
```

**쿼리 빌더 규칙**: `fieldId`/`entityId`는 반드시 활성 스펙에서 조회해 실제 컬럼명/테이블명으로 치환한다. 치환에 실패하면 쿼리를 만들지 않고 에러를 던진다. 값은 100% 파라미터 바인딩.

### 6.5 스키마 마이그레이션 엔진

`src/lib/data-engine/migrate.ts`. 이전 리비전의 엔티티 정의와 드래프트를 비교해 작업 목록을 만든다.

| 변경 | 처리 | 위험도 |
|---|---|---|
| 엔티티 추가 | `CREATE TABLE` | safe |
| 필드 추가 (nullable 또는 default 있음) | `ALTER TABLE ADD COLUMN` | safe |
| 필드 추가 (required, default 없음) | 기존 행 존재 시 **차단** → default 요구 | blocked |
| 필드 rename | `ALTER TABLE RENAME COLUMN` | safe |
| 엔티티 rename | `ALTER TABLE RENAME TO` | safe |
| 인덱스/UNIQUE 추가 | `CREATE [UNIQUE] INDEX` (중복 값 있으면 차단) | conditional |
| 필드 타입 변경 | 테이블 재작성(임시 테이블 + INSERT SELECT + swap). 캐스팅 불가 행 있으면 차단 | destructive |
| 필드 삭제 | 확인 다이얼로그(영향 행 수 표시) 후 `DROP COLUMN` | destructive |
| 엔티티 삭제 | 확인 다이얼로그 후 `DROP TABLE`. 참조 FK 있으면 차단 | destructive |

`destructive` 작업은 배포 화면에서 별도 섹션에 노란 경고와 함께 나열하고, 관리자가 각 항목을 체크해야 진행된다.

---

## 7. 인증

### 7.1 자격증명

| 항목 | 값 |
|---|---|
| ID | `admin` |
| PW | `123456` |

`bcrypt` 해시로 `AdminUser` 테이블에 시딩한다. 평문을 코드/환경변수에 남기지 않는다.

### 7.2 로그인 화면 `/login`

- **관리자 모드 셸을 쓰지 않는 독립 화면**. 사이드바/헤더 없음.
- 중앙 정렬 `card`, 너비 400px:
  - 제목 "관리자 로그인", 설명 텍스트
  - `label + input` (아이디), `label + input[type=password]` (비밀번호, 우측에 눈 아이콘 토글)
  - 전체 폭 `button` "로그인" (제출 중 `spinner` + disabled)
  - 실패 시 폼 상단에 `alert` variant=destructive, 문구: "아이디 또는 비밀번호가 올바르지 않습니다."
- `zod` 스키마로 클라이언트/서버 양쪽 검증.

### 7.3 세션과 가드

- `iron-session` 쿠키: `httpOnly`, `sameSite=lax`, `secure`(운영), TTL 8시간, 슬라이딩 갱신.
- `src/middleware.ts`: `/admin/:path*` 요청에 세션 없으면 `/login?next=<원래경로>`로 307 리다이렉트.
- 로그인 성공 시 `next` 파라미터로 복귀, 없으면 `/admin/builder`.
- 로그인 시도 **5회 실패 → 해당 IP 10분 잠금** (인메모리 카운터. 단일 인스턴스 전제).
- 모든 쓰기 API는 라우트 핸들러 내부에서 세션을 재확인한다. 미들웨어만 신뢰하지 않는다.
- 사이드바 푸터 dropdown → "로그아웃": 세션 파괴 후 `/login`.

---

## 8. 관리자 모드 화면 명세

### 8.0 관리자 셸 (`/admin/layout.tsx`)

헤더에 4단계 스텝퍼:

```
①layout 구성 ──▶ ②관계도 ──▶ ③구성 검증 ──▶ ④수정본 배포
```

- 각 스텝은 링크. 현재 스텝은 강조.
- ③은 마지막 검증 결과에 따라 배지 표시: 미실행 `–`, 통과 `✓`, 에러 `● N`.
- ④ 버튼은 검증 통과 + 드래프트 변경 존재 시에만 활성.
- 우측에 다크모드 토글, 드래프트 변경 건수 배지.

---

### 8.1 ① layout 구성 — `/admin/builder`

요구사항의 3분할 구조를 그대로 구현한다.

```
┌────────────┬────────────┬───────────────────────────┬──────────────┐
│ 페이지 트리 │ 요소 팔레트 │        캔버스              │  속성 패널    │
│  (좌 사이드)│ (네비게이터)│                           │  (우 사이드)  │
│   240px    │   260px    │        flex-1             │    320px     │
└────────────┴────────────┴───────────────────────────┴──────────────┘
```

`resizable` 컴포넌트로 각 패널 폭 조절 가능. 최소 폭 각 200/220/400/280px.

#### 8.1.1 페이지 트리 (좌측 사이드바)

- 2단 계층 트리. 각 행: `[드래그 핸들 ⠿] [아이콘] [제목] [숨김 시 EyeOff] [⋯ 메뉴]`
- **드래그&드롭**: `@dnd-kit/sortable`
  - 같은 부모 내 순서 변경
  - 다른 부모로 이동(들여쓰기/내어쓰기). 드롭 위치 인디케이터는 삽입선(2px)으로 표시.
  - **깊이 제한 2단**. 3단째 드롭 시도는 인디케이터를 빨간색으로 바꾸고 드롭을 거부한다.
  - 드롭 완료 시 낙관적 UI 업데이트 → `PATCH /api/pages/reorder` → 실패 시 롤백 + toast.
- 상단: `[+ 페이지 추가]` 버튼, 검색 `input`.
- `⋯ 메뉴` (dropdown-menu): 이름 변경 / 복제 / 홈으로 지정 / 숨기기 / 삭제(alert-dialog 확인).
- 페이지 선택 시 캔버스가 해당 페이지를 로드.

#### 8.1.2 요소 팔레트 (네비게이터)

- 검색 `input` (컴포넌트명/한글별칭/설명 대상 fuzzy 검색)
- `accordion`으로 그룹 구분. 그룹과 소속은 §8.3 카탈로그 표를 따른다.
- 각 항목: 44px 높이 카드, `[아이콘] [한글명] [영문명(작게)]`. hover 시 `hover-card`로 미리보기 이미지와 설명.
- **드래그**: 팔레트 항목을 캔버스로 드래그하면 새 인스턴스가 생성된다. 드래그 중 반투명 고스트 프리뷰 표시.
- 하단 탭: `컴포넌트` / `구조(트리)`. `구조` 탭은 현재 페이지의 컴포넌트 트리를 보여주고, 여기서도 드래그로 순서/중첩 변경이 가능하다.

#### 8.1.3 캔버스

- 실제 shadcn 컴포넌트를 렌더링하는 **WYSIWYG**. 스크린샷/와이어프레임 대체물이 아니다.
- 배경에 12칼럼 그리드 가이드(점선, 토글 가능).
- 드롭 시 **그리드 스냅**: 커서 위치를 가장 가까운 `col`/`row`로 반올림.
- 선택된 노드: 2px 파란 외곽선 + 좌상단에 컴포넌트 타입 라벨 + 우측/하단/모서리에 **리사이즈 핸들**(칼럼 단위로 스냅).
- 컨테이너형 컴포넌트(card, tabs, accordion, resizable, sheet, dialog, item …)는 **드롭 존을 가진다**. 내부로 드롭하면 `parentNodeId`가 설정된다. 드롭 가능 컨테이너는 hover 시 내부에 점선 테두리를 표시.
- 컴포넌트 우클릭 → `context-menu`: 복제(Ctrl+D) / 삭제(Del) / 앞으로·뒤로 / 부모에서 꺼내기 / 액션 연결.
- 키보드: 방향키 = 1칼럼/1행 이동, Shift+방향키 = 리사이즈, Ctrl+Z / Ctrl+Shift+Z = undo/redo (50단계, zustand temporal).
- 상단 툴바: 뷰포트 프리뷰 전환(데스크톱/태블릿/모바일), 그리드 토글, 미리보기(새 탭으로 `/admin/preview/{pageId}`), undo/redo.
- **빈 페이지**: `empty` 컴포넌트로 "좌측 팔레트에서 요소를 끌어다 놓으세요" 안내.

#### 8.1.4 속성 패널 (우측 사이드바)

선택 대상에 따라 내용이 바뀐다. `tabs`로 3분할: `속성` / `데이터` / `동작`.

**선택 없음** → 페이지 속성:
- 제목, slug(자동 생성 + 수동 편집, 중복 시 즉시 에러), 아이콘 선택 버튼(§8.1.5), 부모 페이지 `select`, 표시/숨김 `switch`, 홈 지정 `switch`, 행 높이/gap `slider`.

**컴포넌트 선택 시**
- `속성` 탭: 카탈로그의 `propsSchema`(zod)로부터 **폼을 자동 생성**한다. 타입별 위젯 매핑:
  `string`→input, `string(enum)`→select, `number`→input[number] 또는 slider, `boolean`→switch, `string[]`→태그 입력, `object[]`→반복 행 편집기(테이블 컬럼 정의 등), `icon`→아이콘 피커, `color`→색상 선택.
  각 필드에 설명 툴팁. 값 변경은 300ms 디바운스 후 저장, 캔버스에 즉시 반영.
- `데이터` 탭: 바인딩 편집기. `mode` 선택 → 엔티티 `combobox` → 필드 다중 선택 → 필터 빌더(행 추가 방식) → 정렬 → 페이지 크기. 하단에 **"현재 데이터 5행 미리보기"** 테이블. 바인딩 불가 컴포넌트는 "이 컴포넌트는 데이터 바인딩을 지원하지 않습니다" 안내.
- `동작` 탭: 컴포넌트가 지원하는 이벤트 목록(카탈로그 `events`)을 나열하고, 각 이벤트에 액션을 연결한다(`combobox` + `[+ 새 액션]`). 연결된 액션은 요약 뱃지로 표시하고 클릭 시 액션 편집 `sheet`가 열린다(§9).
- 하단 고정 영역: 노드 ID(복사 가능), 삭제 버튼.

#### 8.1.5 아이콘 피커 (요구사항 필수)

`components/builder/IconPicker.tsx`

- 트리거: 페이지 속성의 아이콘 버튼 또는 아이콘 타입 prop.
- `dialog` (720×560) 안에:
  - 상단 검색 `input` (아이콘 이름 + 별칭/태그 검색, 즉시 필터)
  - 카테고리 필터 `toggle-group` (전체 / 화살표 / 파일 / 커뮤니케이션 / 미디어 / 상거래 / 지도 / 개발 / 기타)
  - **lucide-react의 모든 아이콘**을 8열 그리드로 표시. `@tanstack/react-virtual`로 가상 스크롤(1,500개 이상이므로 필수).
  - 각 셀: 아이콘 24px + 이름(말줄임). hover 시 tooltip으로 전체 이름.
  - 선택 시 즉시 반영 + 닫기. `없음` 옵션 제공.
  - 최근 사용 아이콘 12개를 상단에 별도 행으로 표시.
- 아이콘 목록은 `lucide-react/dynamicIconImports` 로 이름을 얻고, 렌더는 동적 import + `Suspense`. **전체 아이콘을 정적 import 하지 않는다** (번들 폭증).

---

### 8.2 DB 설계 — `/admin/data`

2분할: 좌측 엔티티 목록(240px) / 우측 필드 편집기.

- **엔티티 목록**: `[+ 엔티티 추가]`, 각 항목에 이름·필드 수·행 수. 드래그로 순서 변경. `⋯` 메뉴에 이름 변경/복제/삭제.
- **필드 편집기**: `data-table` 형태의 인라인 편집 그리드.
  컬럼: `⠿(드래그)` / 표시명 / 컬럼명(자동 생성, 편집 가능) / 타입 `select` / 필수 `switch` / 유니크 `switch` / 기본값 / 부가설정 / `⋯`
  - 타입이 `ENUM`이면 부가설정에 값 목록 편집기, `REF`면 대상 엔티티 `combobox`가 나타난다.
  - 컬럼명은 표시명에서 `slugify → snake_case` 자동 생성. 예약어(`id`, `created_at`, `updated_at`, SQLite 키워드) 충돌 시 즉시 에러.
  - 필드 순서는 드래그&드롭.
- 우측 상단 탭: `스키마` / `데이터`.
  - `데이터` 탭: 해당 엔티티의 실제 `app.db` 행을 `data-table`로 보여주고, 관리자가 직접 CRUD 할 수 있다(초기 데이터 입력·테스트용).
- 하단에 **적용 대기 중인 스키마 변경 요약**을 표시: `+ 테이블 1, + 컬럼 3, ⚠ 파괴적 1`. 실제 DDL은 배포 시에만 실행된다는 안내 문구를 함께 표시.

---

### 8.3 컴포넌트 카탈로그

`src/lib/registry/catalog.ts`. 팔레트·속성 폼·검증·런타임 렌더가 모두 이 한 파일을 참조한다.

```ts
type ComponentDef = {
  key: string;                  // "data-table"
  label: string;                // "데이터 테이블"
  group: ComponentGroup;
  icon: string;                 // lucide 이름
  description: string;
  isContainer: boolean;         // 자식 노드 허용
  allowedChildren?: string[];   // 미지정 = 전부 허용
  bindingModes: BindingMode[];  // [] = 바인딩 불가
  events: EventDef[];           // { name: 'onClick', label: '클릭 시', payload?: ... }
  propsSchema: z.ZodObject<any>;
  defaultProps: Record<string, unknown>;
  defaultGrid: { span: number; rowSpan: number };
  render: (ctx: RenderContext) => ReactNode;   // 런타임 렌더러
};
```

#### 그룹 분류 (팔레트 아코디언 순서)

| 그룹 | 컴포넌트 |
|---|---|
| **레이아웃** | card, separator, aspect-ratio, resizable, scroll-area, tabs, accordion, collapsible, item, sidebar |
| **입력** | input, textarea, native-select, select, combobox, checkbox, radio-group, switch, slider, toggle, toggle-group, date-picker, calendar, input-otp, input-group, field, label |
| **데이터 표시** | table, data-table, chart, carousel, pagination, badge, avatar, progress, typography, empty, skeleton |
| **내비게이션** | breadcrumb, navigation-menu, menubar, dropdown-menu, context-menu, command |
| **피드백/오버레이** | alert, alert-dialog, dialog, drawer, sheet, popover, hover-card, tooltip, toast, spinner |
| **액션** | button, button-group, kbd |
| **유틸리티** | attachment, bubble, marker, message, message-scroller, questionnaire, direction, live-chat |
| **통계 차트** | histogram, boxplot, scatter, regression, bubble-chart, pareto, xbar-r · i-mr · p 관리도, capability, run, moving-average, cdf, qq, residual, heatmap, radar, waterfall, funnel (계산은 `src/lib/stats.ts`) |
| **게시판** | board — 목록 · 조회 · 글쓰기가 배치 즉시 동작하는 프리셋. 글은 메타 DB `BoardPost`에 저장하고 `boardKey`(기본값 = 노드 id)로 게시판을 구분한다. 동적 DDL 경로를 쓰지 않는 이유는 배치 후 엔티티 설계·배포를 거치면 "배치 즉시 동작"이 성립하지 않기 때문이다 |

> shadcn 레지스트리는 계속 확장된다. 카탈로그는 위 목록을 기본으로 하되, `pnpm shadcn:sync` 스크립트로 설치된 `components/ui/*` 파일을 스캔해 **카탈로그에 없는 컴포넌트를 콘솔에 경고**하도록 한다. 요구사항의 "모든 요소를 그룹별로 제공"을 지속적으로 만족시키기 위한 장치다.

#### 카탈로그 정의 예시 (구현 시 이 형식을 따른다)

```ts
export const dataTableDef: ComponentDef = {
  key: 'data-table',
  label: '데이터 테이블',
  group: 'data',
  icon: 'table-2',
  description: '정렬·필터·페이지네이션을 지원하는 데이터 그리드',
  isContainer: false,
  bindingModes: ['list'],
  events: [
    { name: 'onRowClick',      label: '행 클릭 시',      payload: 'row' },
    { name: 'onSelectionChange', label: '선택 변경 시',   payload: 'rows' },
    { name: 'onCreateClick',   label: '새로 만들기 클릭', payload: null },
  ],
  propsSchema: z.object({
    title: z.string().default(''),
    columns: z.array(z.object({
      fieldId: z.string(),
      header: z.string(),
      width: z.number().optional(),
      align: z.enum(['left','center','right']).default('left'),
      format: z.enum(['text','number','currency','date','datetime','badge','boolean']).default('text'),
    })).default([]),
    showSearch: z.boolean().default(true),
    showExport: z.boolean().default(false),
    selectable: z.boolean().default(false),
    density:   z.enum(['compact','default','comfortable']).default('default'),
    emptyText: z.string().default('데이터가 없습니다'),
  }),
  defaultProps: { /* … */ },
  defaultGrid: { span: 12, rowSpan: 40 },
  render: (ctx) => <RuntimeDataTable {...ctx} />,
};
```

---

### 8.4 ② 관계도 — `/admin/graph`

React Flow 12 기반. 요구사항: 클래스 다이어그램 형태, 노드 드래그&드롭, **그리드 기반 정렬**.

#### 8.4.1 캔버스 설정

```ts
<ReactFlow
  snapToGrid snapGrid={[20, 20]}
  nodesDraggable nodesConnectable elementsSelectable
  connectionMode={ConnectionMode.Loose}
  defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }}
  minZoom={0.2} maxZoom={2}
>
  <Background variant={BackgroundVariant.Dots} gap={20} />
  <Controls /> <MiniMap />
</ReactFlow>
```

- 노드 좌표는 이동이 끝날 때(`onNodeDragStop`) `GraphNode`에 저장. 드래그 중에는 저장하지 않는다.
- **정렬 도구** (툴바): 좌/우/상/하 정렬, 가로/세로 균등 배분, 그리드에 스냅(전체), 자동 레이아웃(`dagre` 계층 배치, 방향 전환 가능). 자동 레이아웃 실행 전 확인 다이얼로그(수동 배치가 덮어써지므로).
- 다중 선택: 드래그 박스 / Shift+클릭. 선택 그룹 통째로 이동 가능.

#### 8.4.2 노드 타입 (4종, 클래스 다이어그램 스타일)

각 노드는 헤더(타입 아이콘 + 이름 + 색상 띠) + 본문(멤버 목록) 구조.

| 노드 | 색상 | 본문에 표시 | 핸들 |
|---|---|---|---|
| **Page** | blue | slug, 자식 컴포넌트 수, 아이콘 | 우(source), 좌(target) |
| **Component** | violet | 타입, 바인딩 요약, 연결된 이벤트 수 | 상하좌우 |
| **Entity** | emerald | 필드 목록 `필드명: 타입 [PK/UQ/NN]` (최대 8개, 초과 시 `+N개 더`) | 상하좌우 |
| **Action** | amber | kind, 대상 엔티티/페이지 요약 | 좌(target), 우(source) |

노드 클릭 → 우측 `sheet`에 상세 편집(해당 요소의 속성 패널 재사용). 더블클릭 → 해당 편집 화면으로 이동.

#### 8.4.3 엣지 (연결 관계)

| kind | 허용 조합 | 라벨 | 선 스타일 |
|---|---|---|---|
| `CONTAINS` | Page→Component, Component→Component | 포함 | 실선, 흰 다이아몬드 |
| `READS` | Component→Entity | 조회 | 실선 화살표 |
| `WRITES` | Action→Entity | 기록 | 굵은 실선 화살표 |
| `TRIGGERS` | Component→Action | 실행 | 점선 화살표 |
| `NAVIGATES` | Action→Page, Component→Page | 이동 | 점선 화살표 (곡선) |
| `REFERENCES` | Entity→Entity | 참조 (`1:1`/`1:N`/`N:M` 카디널리티 라벨) | 실선, 까마귀발 |

- 연결을 그리면 **즉시 허용 여부를 판정**한다. 불가 조합이면 연결이 성립하지 않고 toast로 이유를 표시("Component는 Component에 WRITES로 연결할 수 없습니다").
- 드래그로 연결한 뒤 kind가 둘 이상 가능하면 작은 popover로 kind를 선택하게 한다.
- 엣지 클릭 시 라벨/카디널리티 편집, Del로 삭제.
- **`CONTAINS`와 `REFERENCES` 엣지는 읽기 전용 파생 엣지**다. 각각 컴포넌트 트리와 REF 필드에서 자동 생성되며, 관계도에서 직접 만들거나 지울 수 없다(회색 처리). 나머지 4종은 관계도에서 직접 편집 가능하며, `Relation` 테이블이 진실 공급원이다.
- `TRIGGERS` 엣지를 관계도에서 만들면 컴포넌트의 `eventsJson`에도 반영된다(양방향 동기화). 이벤트가 둘 이상이면 어느 이벤트인지 묻는다.

#### 8.4.4 뷰 옵션

- 필터 `toggle-group`: 노드 타입별 표시/숨김.
- "고아 노드만 보기" 토글 — 연결이 하나도 없는 노드 강조.
- 검색 `command` (Ctrl+K): 이름으로 노드 찾아 뷰포트 이동 + 선택.
- 우상단 범례(legend) 카드: 엣지 종류별 선 스타일 설명.

---

### 8.5 ③ 구성 검증 — `/admin/validate`

- 상단: `[검증 실행]` 버튼, 마지막 실행 시각, 요약 통계 카드 4개 (오류 / 경고 / 정보 / 검사한 항목 수).
- 드래프트가 변경되면(`specHash` 불일치) 이전 결과에 "설계가 변경되었습니다. 다시 검증하세요" `alert`를 띄우고 결과를 흐리게 처리한다.
- 결과 목록: `accordion`을 규칙 카테고리(구조 / 데이터 / 동작 / 관계 / 배포 안전성)로 묶고, 각 이슈 행에:
  - severity 배지 (`error` destructive / `warning` 노랑 / `info` 회색)
  - 규칙 코드 (`E-DATA-003`)
  - 메시지 (무엇이 왜 문제인지, 한국어)
  - 대상 링크 — 클릭 시 해당 요소가 선택된 상태로 편집 화면 이동
  - 자동 수정 가능하면 `[자동 수정]` 버튼 (§11의 `fixable` 규칙만)
- 필터: severity, 카테고리, 텍스트 검색.
- 하단: 오류 0건이면 성공 `alert`와 `[배포 화면으로 →]` 버튼. 1건 이상이면 배포 버튼 비활성 + 이유 표시.

---

### 8.6 ④ 수정본 배포 — `/admin/deploy`

- **좌측: 변경 요약 (diff)**
  - 페이지: 추가/수정/삭제/순서변경 목록
  - 컴포넌트: 페이지별 추가/수정/삭제 건수
  - 데이터 스키마: §6.5 표의 작업 목록. `destructive` 항목은 별도 섹션에 경고색 + 영향 행 수 + 개별 체크박스.
  - 액션/관계 변경 목록
  - 각 항목 펼치면 이전 값 → 새 값 비교.
- **우측: 배포 실행**
  - 배포 노트 `textarea` (선택)
  - `[운영에 배포]` 버튼 → `alert-dialog` 확인 (파괴적 변경이 있으면 문구를 그대로 타이핑해 확인하게 한다)
  - 진행 표시: 7단계(§2.3)를 체크리스트로 실시간 표시
  - 완료 시 `toast` + 리비전 번호 + `[운영 사이트 열기]` 링크
- **하단: 리비전 이력** `table`
  - 번호 / 배포 시각 / 노트 / 상태(활성) / `[스펙 보기]`(JSON dialog) / `[이 버전으로 롤백]`
  - 롤백: `activeRevisionId`만 교체(즉시). **데이터 스키마는 자동으로 되돌리지 않는다** — 스키마 롤백은 데이터 손실 위험이 있으므로, 롤백 다이얼로그에 "스키마 변경은 유지됩니다. 필요하면 백업 파일로 복원하세요"와 백업 파일 경로를 명시한다.

---

## 9. 액션 시스템

관리자가 "사용자와 상호작용 가능한 component의 동작"을 정의하는 수단.

### 9.1 액션 종류와 config 스키마

```ts
type ActionConfig =
  | { kind: 'CREATE'; entityId: string; sourceNodeId?: string;
      fieldMap: Record<string, ValueSource>; onSuccess?: string; onError?: string }
  | { kind: 'UPDATE'; entityId: string; keySource: ValueSource;
      fieldMap: Record<string, ValueSource>; onSuccess?: string; onError?: string }
  | { kind: 'DELETE'; entityId: string; keySource: ValueSource;
      confirmText?: string; onSuccess?: string }
  | { kind: 'QUERY';  entityId: string; filters: Filter[]; targetNodeId: string }
  | { kind: 'NAVIGATE'; pageId: string; params?: Record<string, ValueSource> }
  | { kind: 'OPEN_MODAL'  ; targetNodeId: string }   // dialog/sheet/drawer 노드
  | { kind: 'CLOSE_MODAL' ; targetNodeId: string }
  | { kind: 'TOAST'; variant: 'default'|'success'|'destructive'; message: string }
  | { kind: 'EXPORT_CSV'; entityId: string; filters: Filter[]; filename: string }
  | { kind: 'COMPOSITE'; steps: string[]; stopOnError: boolean };  // actionId 배열, 순차 실행

type ValueSource =
  | { from: 'literal';   value: unknown }
  | { from: 'component'; nodeId: string }        // 입력 컴포넌트의 현재 값
  | { from: 'selection'; nodeId: string; field: string }  // 테이블 선택 행의 필드
  | { from: 'route';     param: string }
  | { from: 'now' }
  | { from: 'user' };                            // V1: 상수 'anonymous'
```

### 9.2 액션 편집기 (`sheet`, 480px)

- 이름 `input`, 종류 `select`
- 종류에 따라 폼이 바뀐다 (엔티티 선택 → 필드 매핑 테이블: `대상 필드 | 값 출처 select | 값/참조 지정`)
- `CREATE`/`UPDATE`는 "폼 컴포넌트로부터 자동 매핑" 버튼 제공 — 선택한 폼 컨테이너 내부 입력 컴포넌트의 `field` 바인딩을 읽어 매핑을 채운다.
- 성공/실패 후속 액션 `combobox`.
- 하단 요약 문장으로 사람이 읽을 수 있게 표시: *"주문 테이블에 새 행을 만든다. 고객명 ← 입력#3, 금액 ← 입력#4. 성공 시: 토스트 '저장되었습니다'"*
- `COMPOSITE`는 스텝 목록을 드래그&드롭으로 정렬.

### 9.3 런타임 실행

- 액션 실행은 서버에서만 일어난다. 클라이언트는 `POST /api/runtime/action`에 `{ actionId, context }`만 보낸다.
- 서버는 **활성 리비전의 액션 정의**를 읽어 실행한다. 클라이언트가 보낸 config는 신뢰하지 않는다.
- `context`에는 컴포넌트 값과 선택 행 키만 담긴다. 서버가 `ValueSource`를 해석해 실제 값을 조립한다.
- 실행 결과: `{ ok, data?, error?, effects: Effect[] }`. `effects`는 클라이언트가 처리할 UI 지시(토스트 표시, 모달 열기/닫기, 페이지 이동, 특정 노드 데이터 갱신).
- `COMPOSITE`는 한 SQLite 트랜잭션으로 감싼다. `stopOnError=true`면 첫 실패에서 전체 롤백.
- 모든 실행은 `data/action.log` (JSONL)에 기록: 시각, actionId, ok, 소요ms, 에러.

---

## 10. API 계약

모든 응답은 `{ ok: true, data }` 또는 `{ ok: false, error: { code, message, details? } }`.
`/api/admin/*`는 세션 필수. `/api/runtime/*`는 공개.

### 10.1 인증

| Method | Path | Body | 설명 |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` | 세션 쿠키 설정 |
| POST | `/api/auth/logout` | – | 세션 파괴 |
| GET | `/api/auth/session` | – | `{ authenticated, username? }` |

### 10.2 페이지

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/admin/pages` | 트리 전체 |
| POST | `/api/admin/pages` | 생성 |
| PATCH | `/api/admin/pages/:id` | 수정 |
| DELETE | `/api/admin/pages/:id` | 삭제 (자식 있으면 `409`, 처리 방식 선택 요구) |
| PATCH | `/api/admin/pages/reorder` | `{ items: [{id, parentId, order}] }` 일괄 |

### 10.3 컴포넌트 노드

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/admin/pages/:id/nodes` | 해당 페이지 노드 전체 |
| POST | `/api/admin/nodes` | `{pageId, type, parentNodeId, grid}` 생성 (defaultProps 적용) |
| PATCH | `/api/admin/nodes/:id` | props/grid/binding/events 부분 수정 |
| DELETE | `/api/admin/nodes/:id` | 자손 함께 삭제 |
| POST | `/api/admin/nodes/:id/duplicate` | 자손 포함 복제 |
| PATCH | `/api/admin/nodes/reorder` | 일괄 이동/중첩 변경 |

### 10.4 데이터 설계

| Method | Path | 설명 |
|---|---|---|
| GET/POST | `/api/admin/entities` | 목록 / 생성 |
| PATCH/DELETE | `/api/admin/entities/:id` | 수정 / 삭제 |
| GET/POST | `/api/admin/entities/:id/fields` | 필드 목록 / 추가 |
| PATCH/DELETE | `/api/admin/fields/:id` | 수정 / 삭제 |
| GET | `/api/admin/entities/:id/rows` | 관리자용 데이터 조회 (page, pageSize, sort, filter) |
| POST/PATCH/DELETE | `/api/admin/entities/:id/rows[/:rowId]` | 관리자용 CRUD |
| GET | `/api/admin/schema/diff` | 활성 리비전 대비 스키마 변경 계획 |

### 10.5 관계도 / 액션

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/admin/graph` | 노드+엣지 전체 (파생 엣지 포함) |
| PATCH | `/api/admin/graph/nodes` | 좌표 일괄 저장 |
| POST/DELETE | `/api/admin/relations[/:id]` | 엣지 생성 / 삭제 |
| GET/POST | `/api/admin/actions` | 목록 / 생성 |
| PATCH/DELETE | `/api/admin/actions/:id` | 수정 / 삭제 |

### 10.6 검증 / 배포

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/admin/validate` | 검증 실행 → `ValidationIssue[]` |
| POST | `/api/admin/validate/fix` | `{ issueCodes: string[] }` 자동 수정 |
| GET | `/api/admin/deploy/preview` | diff + 스키마 변경 계획 |
| POST | `/api/admin/deploy` | `{ note?, acceptDestructive: string[] }` → 배포 |
| GET | `/api/admin/revisions` | 리비전 이력 |
| POST | `/api/admin/revisions/:id/activate` | 롤백 |

### 10.7 런타임 (운영 모드)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/runtime/spec` | 활성 리비전 스펙 (ETag 캐시) |
| POST | `/api/runtime/query` | `{ nodeId, page?, sort?, filters? }` → 바인딩 실행 결과. **활성 스펙의 바인딩 정의만 사용**한다 |
| POST | `/api/runtime/action` | `{ actionId, context }` → `{ ok, data?, effects }` |
| GET | `/api/runtime/export/:nodeId` | CSV 다운로드 |

> **보안 원칙**: 런타임 API는 클라이언트가 보낸 엔티티명·컬럼명·필터를 절대 그대로 쓰지 않는다. `nodeId`/`actionId`로 서버 측 스펙을 조회해 쿼리를 조립한다. 이것이 노코드 런타임에서 가장 흔한 취약점이다.

---

## 11. 구성 검증 규칙

```ts
type ValidationIssue = {
  code: string;                      // E-STRUCT-001
  severity: 'error' | 'warning' | 'info';
  category: 'structure'|'data'|'action'|'relation'|'deploy';
  message: string;                   // 한국어
  target: { type: 'PAGE'|'COMPONENT'|'ENTITY'|'FIELD'|'ACTION'|'RELATION'|'GLOBAL'; id: string };
  fixable: boolean;
};
```

### 11.1 구조 (structure)

| 코드 | sev | 조건 | fixable |
|---|---|---|---|
| E-STRUCT-001 | error | 페이지가 0개 | – |
| E-STRUCT-002 | error | `isHome` 페이지가 정확히 1개가 아님 | ✓ (첫 페이지로 지정) |
| E-STRUCT-003 | error | slug 중복 또는 형식 위반(`^[a-z0-9][a-z0-9-]*$`) | ✓ (접미 번호) |
| E-STRUCT-004 | error | 페이지 계층 순환 참조 | – |
| E-STRUCT-005 | error | 계층 깊이 > 2 | – |
| E-STRUCT-006 | error | 컴포넌트 트리 순환 참조 | – |
| E-STRUCT-007 | error | 카탈로그에 없는 컴포넌트 타입 | – |
| E-STRUCT-008 | error | 비컨테이너 컴포넌트에 자식 존재 | – |
| E-STRUCT-009 | error | `allowedChildren` 위반 | – |
| W-STRUCT-010 | warn | 컴포넌트가 0개인 표시 페이지 | – |
| W-STRUCT-011 | warn | 그리드 좌표가 12칼럼을 넘어감 | ✓ (clamp) |
| W-STRUCT-012 | warn | 같은 grid 셀에 완전히 겹친 컴포넌트 | – |
| W-STRUCT-013 | warn | 아이콘 없는 최상위 페이지 | – |

### 11.2 데이터 (data)

| 코드 | sev | 조건 | fixable |
|---|---|---|---|
| E-DATA-001 | error | 엔티티에 필드가 0개 | – |
| E-DATA-002 | error | 테이블명/컬럼명 중복, 예약어, 형식 위반 | ✓ |
| E-DATA-003 | error | `REF` 필드의 `refEntityId`가 없거나 존재하지 않는 엔티티 | – |
| E-DATA-004 | error | `ENUM` 필드의 값 목록이 비어 있음 | – |
| E-DATA-005 | error | 바인딩이 참조하는 `entityId`/`fieldId`가 존재하지 않음 | – |
| E-DATA-006 | error | 바인딩 mode가 컴포넌트의 `bindingModes`에 없음 | – |
| E-DATA-007 | error | 컬럼 타입과 컴포넌트 입력 타입 불일치 (예: DATE 필드에 slider) | – |
| E-DATA-008 | error | required 필드 추가인데 기존 행 존재 + default 없음 | – |
| E-DATA-009 | error | UNIQUE 추가인데 기존 데이터에 중복 존재 | – |
| E-DATA-010 | error | 타입 변경 시 캐스팅 불가 행 존재 | – |
| W-DATA-011 | warn | 어떤 컴포넌트도 참조하지 않는 엔티티 | – |
| W-DATA-012 | warn | `list` 바인딩에 정렬 미지정 | ✓ (created_at desc) |
| W-DATA-013 | warn | 필터의 `component` 참조 대상이 같은 페이지에 없음 | – |
| W-DATA-014 | warn | 1000행 이상 예상 테이블에 페이지네이션 없는 table | – |

### 11.3 동작 (action)

| 코드 | sev | 조건 | fixable |
|---|---|---|---|
| E-ACT-001 | error | 이벤트에 연결된 `actionId`가 존재하지 않음 | ✓ (연결 해제) |
| E-ACT-002 | error | 액션의 `entityId`/`pageId`/`targetNodeId`가 존재하지 않음 | – |
| E-ACT-003 | error | `CREATE`인데 required 필드가 `fieldMap`에 누락 | – |
| E-ACT-004 | error | `fieldMap`의 `ValueSource`가 참조하는 노드가 없음 | – |
| E-ACT-005 | error | `UPDATE`/`DELETE`에 `keySource` 없음 | – |
| E-ACT-006 | error | `COMPOSITE` 순환 참조 | – |
| E-ACT-007 | error | `OPEN_MODAL` 대상이 모달형 컴포넌트가 아님 | – |
| E-ACT-008 | error | 컴포넌트가 지원하지 않는 이벤트명에 액션 연결 | ✓ |
| W-ACT-009 | warn | 어떤 이벤트에도 연결되지 않은 액션 | – |
| W-ACT-010 | warn | `DELETE` 액션에 확인 문구 없음 | ✓ |
| W-ACT-011 | warn | 저장 액션에 성공/실패 후속 처리 없음 | – |
| W-ACT-012 | warn | 폼 입력 컴포넌트가 어떤 액션의 `fieldMap`에도 사용되지 않음 | – |

### 11.4 관계 (relation)

| 코드 | sev | 조건 |
|---|---|---|
| E-REL-001 | error | 엣지의 from/to 요소가 존재하지 않음 |
| E-REL-002 | error | 허용되지 않은 (fromType, toType, kind) 조합 |
| E-REL-003 | error | `REFERENCES` 엣지가 실제 REF 필드와 불일치 |
| E-REL-004 | error | `TRIGGERS` 엣지와 컴포넌트 `eventsJson` 불일치 |
| W-REL-005 | warn | 연결이 하나도 없는 고아 노드 |
| W-REL-006 | warn | `N:M` 관계인데 연결 테이블 엔티티 없음 |
| W-REL-007 | warn | 어떤 액션·컴포넌트도 도달할 수 없는 페이지 (내비게이션 그래프 기준) |

### 11.5 배포 안전성 (deploy)

| 코드 | sev | 조건 |
|---|---|---|
| E-DEP-001 | error | 파괴적 변경이 있는데 관리자 확인 미체크 |
| E-DEP-002 | error | 마이그레이션 SQL 드라이런 실패 |
| E-DEP-003 | error | 드래프트 스펙이 zod 파싱 실패 |
| W-DEP-004 | warn | 이전 리비전 대비 삭제되는 페이지 존재 (북마크 깨짐) |
| I-DEP-005 | info | 변경 사항 없음 |

### 11.6 검증 엔진 구현 규칙

- `src/lib/validation/rules/*.ts` — 규칙 하나당 파일 하나, `(spec, ctx) => ValidationIssue[]` 순수 함수로 작성.
- `ctx`에는 `app.db` 조회 함수(행 수, 중복 검사)를 주입한다. 규칙 함수가 직접 DB에 접근하지 않는다 → 단위 테스트 용이.
- 규칙 레지스트리가 전체를 순회하고 결과를 합친다. **모든 규칙은 단위 테스트를 갖는다** (통과 케이스 1개 + 위반 케이스 1개 이상).

---

## 12. 운영 모드 (`/home`) 렌더링 명세

### 12.1 라우팅

- `src/app/(public)/home/[[...slug]]/page.tsx` — 캐치올.
- `slug` 없음 → `isHome` 페이지. slug 매칭 실패 → 404 화면(`empty` 컴포넌트 + 홈으로 가기).
- 활성 스펙 로드는 `unstable_cache` + `revalidateTag('published-spec')`. 배포 시에만 무효화.
- 활성 리비전이 없으면(최초 상태) 안내 화면: "아직 배포된 구성이 없습니다. 관리자 모드에서 페이지를 구성하고 배포하세요." + `/admin` 링크.

### 12.2 렌더 파이프라인

```
활성 스펙 → 해당 PageSpec 선택
  → 사이드바 메뉴 생성 (isVisible 페이지 트리, order 순)
  → 컴포넌트 노드를 parentNodeId/order로 트리 조립
  → 각 노드: 카탈로그[type].render(ctx) 호출
      ctx = { node, props(zod 파싱), data(바인딩 결과), dispatch, children }
  → 서버 컴포넌트로 렌더, 상호작용 필요한 노드만 클라이언트 경계로 분리
```

- 바인딩 데이터는 **서버에서 미리 조회**해 초기 렌더에 포함한다(폭포수 요청 방지). 페이지네이션·필터 변경 등 이후 갱신만 `/api/runtime/query`를 호출.
- 알 수 없는 컴포넌트 타입은 앱을 깨뜨리지 않고 자리표시자(점선 박스 + 타입명)로 렌더하고 콘솔에 경고.
- 각 노드는 **에러 바운더리**로 감싼다. 하나가 실패해도 페이지 전체가 죽지 않는다 (`alert` variant=destructive로 대체 표시).
- 로딩 중에는 카탈로그가 정의한 `skeleton` 형태를 보여준다.

### 12.3 상호작용

- 클라이언트 노드는 `dispatch(eventName)` 호출 → `POST /api/runtime/action` → 응답의 `effects`를 순서대로 처리:
  `toast` → shadcn toast / `navigate` → `router.push` / `openModal`·`closeModal` → 모달 상태 / `refresh` → 해당 노드 데이터 재조회 (`router.refresh()` 또는 대상 노드만 revalidate).
- 실패 시 destructive toast + 사유. 폼 필드 단위 오류는 해당 입력 아래에 표시.

---

## 13. 배포

### 13.1 도메인과 터널

`demo1.dove9999.com` → 로컬 PC의 `localhost:3000`.

```yaml
# deploy/cloudflared/config.yml
tunnel: webapp-v1
credentials-file: C:\Users\<user>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: demo1.dove9999.com
    service: http://localhost:3000
  - service: http_status:404
```

절차 (`deploy/README.md`에 그대로 기록):

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create webapp-v1
cloudflared tunnel route dns webapp-v1 demo1.dove9999.com
cloudflared service install          # Windows 서비스로 상시 실행
```

### 13.2 앱 상시 실행

```powershell
pnpm build
pnpm add -g pm2
pm2 start "pnpm start" --name webapp-v1
pm2 save
pm2 startup                          # 부팅 시 자동 시작
```

### 13.3 운영 설정

- `.env.production`: `SESSION_SECRET`(32바이트 랜덤), `NODE_ENV=production`, `APP_URL=https://demo1.dove9999.com`
- Cloudflare Access로 `/admin/*`, `/login` 경로에 추가 보호를 걸 것을 권장(선택). 걸지 않을 경우 관리자 비밀번호가 유일한 방어선임을 `deploy/README.md`에 명시한다.
- 백업: `app.db`와 `meta.db`를 매일 03:00에 `data/backups/`로 복사하는 Windows 예약 작업 스크립트(`deploy/backup.ps1`). 30일 보관.
- 헬스체크: `GET /api/health` → `{ ok, revisionNo, uptime }`.

### 13.4 보안 체크리스트 (배포 전 필수 확인)

- [ ] `SESSION_SECRET`이 기본값이 아니다
- [ ] 관리자 비밀번호가 해시로만 저장된다
- [ ] 동적 SQL 경로에 문자열 연결이 없다 (`grep`으로 확인)
- [ ] `/api/runtime/*`가 클라이언트 제공 테이블/컬럼명을 쓰지 않는다
- [ ] 운영 모드 번들에 관리자 코드가 포함되지 않는다 (`@next/bundle-analyzer`로 확인)
- [ ] 에러 응답에 스택 트레이스/SQL이 노출되지 않는다

---

## 14. Phase별 구현 계획

가중치 합 = 100. 진행률 보고 시 이 값을 사용한다(`CLAUDE.md` §6.3).

| Phase | 내용 | 가중치 | 예상 |
|---|---|---|---|
| P0 | 프로젝트 부트스트랩 | 5 | 1.5h |
| P1 | 셸 레이아웃 + 인증 | 10 | 3h |
| P2 | 페이지 관리 + 아이콘 피커 | 12 | 4h |
| P3 | 컴포넌트 카탈로그 + 캔버스 빌더 | 22 | 8h |
| P4 | 데이터 설계 + 데이터 엔진 | 16 | 6h |
| P5 | 관계도 | 13 | 5h |
| P6 | 액션 시스템 | 10 | 4h |
| P7 | 검증 엔진 | 7 | 3h |
| P8 | 배포 파이프라인 + 운영 렌더러 | 5 | 3h |
| — | 도메인 배포 + 마감 | (P8 포함) | 1.5h |
| | **합계** | **100** | **≈39h** |

> 예상 시간은 초기 추정치다. 각 Phase 종료 시 실제 소요를 기록하고 남은 Phase 추정을 보정한다(`PROGRESS.md`).

---

### P0 — 프로젝트 부트스트랩 (가중치 5)

**작업**
1. `pnpm create next-app` (TypeScript, Tailwind v4, App Router, src 디렉토리)
2. `pnpm dlx shadcn@latest init` (neutral, CSS variables)
3. §3.3 컴포넌트 전체 설치
4. 의존성: `@dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @xyflow/react dagre zustand zundo react-hook-form zod @hookform/resolvers prisma @prisma/client better-sqlite3 bcryptjs iron-session lucide-react @tanstack/react-virtual @tanstack/react-table nanoid`
5. dev: `vitest @vitest/coverage-v8 @playwright/test eslint prettier @next/bundle-analyzer`
6. `CLAUDE.md` §3 디렉토리 구조 생성
7. Prisma 스키마(§5) 작성 + `migrate dev` + `seed.ts`
8. `data-engine` 초기화 스크립트(`pnpm db:init`) — `app.db` 생성, WAL, foreign_keys
9. `package.json` 스크립트: `dev build start lint typecheck test test:e2e db:init db:seed shadcn:sync`
10. `PROGRESS.md` 생성

**수용 기준**
- [ ] `pnpm dev` 실행 시 에러 없이 기동
- [ ] `pnpm typecheck`, `pnpm lint` 무경고
- [ ] `prisma studio`에서 시딩된 `AdminUser`, `Deployment`, 초기 페이지 3개 확인
- [ ] `data/app.db` 생성, `PRAGMA journal_mode` = `wal`
- [ ] `components/ui`에 §3.3 목록 전체 존재 (`shadcn:sync`가 누락 0건 보고)

---

### P1 — 셸 레이아웃 + 인증 (가중치 10)

**작업**
1. `components/shell/AppSidebar.tsx` — §4.2 (헤더/본문/푸터, 접기, collapsible 서브메뉴)
2. `components/shell/AppHeader.tsx` — §4.3 (토글, breadcrumb 자동 생성)
3. 다크모드 토글 (`next-themes`)
4. `/login` 화면 — §7.2
5. `lib/auth/session.ts` (iron-session), `middleware.ts` 가드 — §7.3
6. `/api/auth/*` 3개 엔드포인트, 로그인 실패 잠금
7. `/admin/layout.tsx` — 4단계 스텝퍼 (§8.0), 정적 배지 상태
8. `/` → `/home` 리다이렉트

**수용 기준**
- [ ] `layout_sample.png`와 셸을 나란히 비교해 사이드바 폭/헤더 높이/브랜드 블록/푸터 사용자 블록 구조가 일치
- [ ] 사이드바 접기/펼치기, 서브메뉴 펼침 동작
- [ ] `< 768px`에서 사이드바가 sheet로 전환
- [ ] 미로그인 상태로 `/admin/builder` 접근 → `/login?next=/admin/builder` 리다이렉트
- [ ] `admin`/`123456` 로그인 성공 → `/admin/builder` 복귀
- [ ] 오답 로그인 → destructive alert, 5회 실패 → 10분 잠금 메시지
- [ ] 로그아웃 후 `/admin` 재접근 차단
- [ ] E2E: 로그인→관리자 진입→로그아웃 시나리오 통과

---

### P2 — 페이지 관리 + 아이콘 피커 (가중치 12)

**작업**
1. `/api/admin/pages` CRUD + `reorder` (§10.2)
2. 페이지 트리 컴포넌트 — dnd-kit sortable, 2단 깊이 제한, 삽입선 인디케이터 (§8.1.1)
3. 낙관적 업데이트 + 실패 롤백
4. 페이지 속성 폼 (제목/slug/부모/표시/홈/아이콘)
5. slug 자동 생성 + 중복 실시간 검사
6. `IconPicker` — lucide 전체, 가상 스크롤, 검색, 카테고리 필터, 최근 사용 (§8.1.5)
7. 사이드바가 실제 페이지 트리를 반영

**수용 기준**
- [ ] 페이지 생성/이름변경/복제/삭제 동작, 삭제 시 자식 처리 방식 선택 다이얼로그
- [ ] 드래그로 같은 부모 내 순서 변경 → 새로고침 후 유지
- [ ] 드래그로 다른 부모로 이동 → 사이드바에 서브메뉴로 반영
- [ ] 3단 깊이 드롭 시도 거부 + 시각 피드백
- [ ] 아이콘 피커에서 "cart" 검색 → 관련 아이콘 표시, 선택 시 트리·사이드바에 즉시 반영
- [ ] 아이콘 피커 스크롤이 1,500개 이상에서 60fps 수준으로 부드러움 (가상 스크롤 적용 확인)
- [ ] 아이콘 피커를 열지 않은 페이지의 초기 JS 번들이 아이콘 전체를 포함하지 않음
- [ ] slug 중복 입력 시 저장 차단 + 인라인 에러
- [ ] E2E: 페이지 3개 생성 → 하나를 다른 페이지 자식으로 이동 → 아이콘 지정 → 순서 변경 → 새로고침 후 상태 유지

---

### P3 — 컴포넌트 카탈로그 + 캔버스 빌더 (가중치 22, 최대 난이도)

**작업**
1. `lib/registry/catalog.ts` — §8.3 전체 컴포넌트 정의 (key/label/group/icon/isContainer/bindingModes/events/propsSchema/defaultProps/defaultGrid/render)
2. `shadcn:sync` 스크립트 — 설치본 vs 카탈로그 누락 검사
3. 팔레트 (§8.1.2) — 아코디언 그룹, 검색, hover-card 미리보기, 드래그 소스
4. `구조(트리)` 탭 — 컴포넌트 트리, 드래그로 중첩/순서 변경
5. 캔버스 (§8.1.3) — 12칼럼 그리드, 드롭 스냅, 선택/리사이즈 핸들, 컨테이너 드롭 존, context-menu, 키보드 조작
6. undo/redo — zustand + zundo, 50단계
7. 속성 패널 `속성` 탭 — zod 스키마 → 폼 자동 생성기 (§8.1.4). 이 자동 생성기가 P3의 핵심 산출물이다
8. `/api/admin/nodes` CRUD + duplicate + reorder
9. `/admin/preview/{pageId}` — 편집 크롬 없는 미리보기
10. `resizable` 4분할 패널 + 폭 유지

**수용 기준**
- [ ] 팔레트가 §8.3의 7개 그룹과 모든 컴포넌트를 노출 (`shadcn:sync` 누락 0건)
- [ ] 팔레트에서 캔버스로 드래그 → 그리드에 스냅되어 배치, 실제 shadcn 컴포넌트로 렌더
- [ ] card 안으로 button 드롭 → `parentNodeId` 설정, 시각적으로도 내부에 위치
- [ ] 비컨테이너(input 등)에는 드롭 불가 (드롭 존 미표시)
- [ ] 리사이즈 핸들로 span 변경 → 칼럼 단위 스냅
- [ ] 방향키 이동 / Shift+방향키 리사이즈 / Del 삭제 / Ctrl+D 복제
- [ ] Ctrl+Z / Ctrl+Shift+Z 로 배치·속성 변경 10회 연속 되돌리기·다시하기
- [ ] `data-table`의 `columns`(object[]) 속성이 반복 행 편집기로 자동 생성됨
- [ ] 속성 변경 → 300ms 내 캔버스 반영, 새로고침 후 유지
- [ ] 뷰포트 프리뷰 전환 시 §4.4 반응형 규칙대로 칼럼이 축소
- [ ] 페이지 전환 후 돌아와도 배치 유지
- [ ] E2E: 빈 페이지에 card 배치 → 내부에 input 2개 + button 배치 → 속성 편집 → 미리보기에서 동일 렌더 확인

---

### P4 — 데이터 설계 + 데이터 엔진 (가중치 16)

**작업**
1. `/admin/data` 화면 — 엔티티 목록 + 필드 인라인 편집 그리드 (§8.2)
2. `/api/admin/entities`, `/api/admin/fields` CRUD
3. 이름 정규화 (`slugify` → snake_case), 예약어/중복 검사
4. `lib/data-engine/`:
   - `client.ts` (better-sqlite3, WAL, FK)
   - `ddl.ts` (CREATE TABLE / ADD COLUMN / RENAME / INDEX / 테이블 재작성)
   - `diff.ts` (§6.5 표의 변경 계획 산출)
   - `query.ts` (BindingSpec → 파라미터화 SQL. 식별자는 스펙 조회로만 해석)
   - `crud.ts` (행 CRUD, 암묵 컬럼 관리)
5. `데이터` 탭 — 실제 행 CRUD (관리자 직접 입력)
6. 속성 패널 `데이터` 탭 — 바인딩 편집기 + 필터 빌더 + 5행 미리보기 (§8.1.4)
7. `GET /api/admin/schema/diff`

**수용 기준**
- [ ] 엔티티 생성 → 필드 5종(TEXT/INTEGER/BOOLEAN/DATE/ENUM) 추가 → 표시명 한글, 컬럼명 snake_case 자동 생성
- [ ] `REF` 필드로 두 엔티티 연결 가능
- [ ] 예약어(`id`, `select`) 컬럼명 입력 시 차단
- [ ] `데이터` 탭에서 행 생성·수정·삭제가 `app.db`에 실제 반영 (sqlite CLI로 교차 확인)
- [ ] `data-table`에 `list` 바인딩 연결 → 5행 미리보기에 실제 데이터 표시
- [ ] 필터 빌더로 `상태 = 완료` 조건 추가 → 미리보기 결과가 필터링됨
- [ ] 스키마 diff가 §6.5의 safe/blocked/destructive 분류를 정확히 산출
- [ ] 단위 테스트: `query.ts`가 악의적 문자열(`"; DROP TABLE"`)을 필드명·값으로 받아도 인젝션 불가 (전용 테스트 파일 필수)
- [ ] 단위 테스트: 9개 dataType의 왕복 변환(저장→조회) 정확성

---

### P5 — 관계도 (가중치 13)

**작업**
1. `/admin/graph` — React Flow 12, `snapToGrid [20,20]`, Background dots, Controls, MiniMap (§8.4.1)
2. 커스텀 노드 4종 (Page/Component/Entity/Action) — 클래스 다이어그램 스타일 (§8.4.2)
3. Entity 노드에 필드 목록 렌더 (타입·PK/UQ/NN 표기)
4. 엣지 6종 + 조합 허용 규칙 + 스타일 (§8.4.3)
5. 파생 엣지(`CONTAINS`, `REFERENCES`) 자동 생성 + 읽기 전용 처리
6. `TRIGGERS` 엣지 ↔ 컴포넌트 `eventsJson` 양방향 동기화
7. 정렬 툴바 (정렬/균등배분/스냅/dagre 자동 레이아웃)
8. 다중 선택 + 그룹 이동
9. 노드 클릭 → 상세 편집 sheet, 더블클릭 → 편집 화면 이동
10. 필터 / 고아 노드 강조 / Ctrl+K 검색 / 범례
11. `/api/admin/graph`, `/api/admin/relations`

**수용 기준**
- [ ] 4종 노드가 모두 표시되고, 요소 추가 시 관계도에 자동 등장
- [ ] 노드 드래그 시 20px 그리드에 스냅, 이동 종료 시 좌표 저장 → 새로고침 후 유지
- [ ] Entity 노드가 필드 목록과 제약 표기를 보여줌
- [ ] Component→Entity `READS` 연결 가능
- [ ] Component→Component `WRITES` 연결 시도 → 거부 + 이유 toast
- [ ] `CONTAINS` 엣지가 컴포넌트 트리를 정확히 반영하고 수동 삭제 불가
- [ ] 관계도에서 `TRIGGERS` 엣지 생성 → 빌더의 해당 컴포넌트 `동작` 탭에 반영
- [ ] 정렬 툴바 6개 기능 동작, 자동 레이아웃 전 확인 다이얼로그
- [ ] 다중 선택 후 그룹 이동, 좌표 일괄 저장
- [ ] Ctrl+K로 노드 검색 → 뷰포트 이동 + 선택
- [ ] 노드 40개 / 엣지 60개 규모에서 드래그가 끊기지 않음

---

### P6 — 액션 시스템 (가중치 10)

**작업**
1. `lib/actions/schema.ts` — §9.1 zod 정의
2. 액션 편집기 sheet (§9.2) — 종류별 동적 폼, 필드 매핑 테이블, 폼 자동 매핑, 사람이 읽는 요약
3. `COMPOSITE` 스텝 드래그 정렬
4. `/api/admin/actions` CRUD
5. 속성 패널 `동작` 탭 — 이벤트별 액션 연결 (§8.1.4)
6. `lib/actions/executor.ts` — 서버 실행기. `ValueSource` 해석, 트랜잭션, `Effect[]` 반환 (§9.3)
7. `POST /api/runtime/action`
8. `data/action.log` JSONL 기록

**수용 기준**
- [ ] 10종 액션 kind 전부 편집 가능
- [ ] `CREATE` 액션에 "폼 컴포넌트로부터 자동 매핑" 실행 → 필드 매핑이 자동 채워짐
- [ ] 사람이 읽는 요약 문장이 정확하게 생성됨
- [ ] `COMPOSITE` 3스텝 구성 후 드래그로 순서 변경
- [ ] 버튼의 `onClick`에 액션 연결 → 미리보기에서 클릭 시 실제로 행이 생성됨
- [ ] `COMPOSITE`에서 2번째 스텝 실패 시 1번째도 롤백 (트랜잭션 검증 테스트)
- [ ] 클라이언트가 조작된 `context`(존재하지 않는 엔티티명 주입)를 보내도 서버가 무시하고 스펙 기준으로 동작
- [ ] `action.log`에 실행 기록 남음
- [ ] `effects` 4종(toast/navigate/openModal/refresh)이 클라이언트에서 처리됨

---

### P7 — 검증 엔진 (가중치 7)

**작업**
1. `lib/validation/rules/*.ts` — §11의 **모든 규칙** 구현 (structure 13, data 14, action 12, relation 7, deploy 5)
2. 규칙 레지스트리 + 실행기 + `ctx` DB 주입
3. `specHash` 계산 → 드래프트 변경 감지
4. `/admin/validate` 화면 (§8.5) — 통계 카드, 카테고리 아코디언, 필터, 대상 링크 이동, 자동 수정
5. `POST /api/admin/validate`, `/validate/fix`
6. `ValidationRun` 기록
7. 스텝퍼 ③ 배지 연동, ④ 버튼 활성화 조건 연동

**수용 기준**
- [ ] §11의 51개 규칙 전부 구현되고 각각 단위 테스트(통과/위반) 보유
- [ ] 의도적으로 깨뜨린 설계(존재하지 않는 엔티티 바인딩, 홈 페이지 2개, 순환 COMPOSITE)에서 해당 코드가 정확히 검출됨
- [ ] `fixable` 규칙의 `[자동 수정]` 버튼이 실제로 문제를 해소
- [ ] 이슈의 대상 링크 클릭 → 해당 요소 선택 상태로 편집 화면 이동
- [ ] 설계 변경 후 이전 결과가 "재검증 필요"로 무효화
- [ ] 오류 0건일 때만 ④ 배포 버튼 활성

---

### P8 — 배포 파이프라인 + 운영 렌더러 (가중치 5)

**작업**
1. `lib/runtime/interpreter.tsx` — 스펙 → React 트리 (§12.2). 노드별 에러 바운더리, 미지 타입 자리표시자
2. `/home/[[...slug]]` 라우트 + 사이드바 메뉴 생성 + 404 + 미배포 안내 (§12.1)
3. 서버 사이드 바인딩 프리페치
4. `POST /api/runtime/query`, `GET /api/runtime/export/:nodeId`
5. `effects` 클라이언트 핸들러 (§12.3)
6. `lib/deploy/publish.ts` — §2.3 7단계 트랜잭션 + 백업 + 롤백
7. `/admin/deploy` 화면 (§8.6) — diff, 파괴적 변경 체크, 진행 체크리스트, 리비전 이력, 롤백
8. `GET /api/admin/deploy/preview`, `POST /api/admin/deploy`, `/api/admin/revisions/:id/activate`
9. `unstable_cache` + `revalidateTag('published-spec')`
10. `GET /api/health`
11. 배포 산출물: `deploy/cloudflared/config.yml`, `deploy/README.md`, `deploy/backup.ps1`
12. §13.4 보안 체크리스트 전 항목 실측 확인

**수용 기준**
- [ ] 미배포 상태에서 `/home` 접근 → 안내 화면
- [ ] 배포 후 `/home`에 관리자가 만든 페이지 목록과 레이아웃이 **정확히 동일하게** 표시 (이것이 프로젝트 최종 목표)
- [ ] 운영 화면의 `data-table`이 `app.db` 실제 데이터를 표시, 정렬·검색·페이지네이션 동작
- [ ] 운영 화면의 버튼 클릭 → 액션 실행 → 데이터 변경 + toast
- [ ] 새 컴포넌트 추가 후 재배포 → 운영에 즉시 반영 (재빌드 없음)
- [ ] 파괴적 스키마 변경 시 확인 절차 없이는 배포 불가
- [ ] 배포 중 SQL 오류 유발 → 백업 복원 + 리비전 미생성 + 활성 리비전 불변 (실패 시나리오 테스트)
- [ ] 리비전 롤백 → `/home`이 이전 구성으로 즉시 복귀
- [ ] 한 컴포넌트가 예외를 던져도 페이지의 나머지가 정상 렌더
- [ ] `https://demo1.dove9999.com` 외부 접근 성공, HTTPS 유효
- [ ] PC 재부팅 후 pm2 + cloudflared 자동 복구
- [ ] `/api/health`가 활성 리비전 번호 반환
- [ ] §13.4 체크리스트 6항목 전부 확인 완료
- [ ] 운영 모드 초기 JS 번들에 빌더/React Flow 코드 미포함 (bundle-analyzer 확인)

---

### 14.1 최종 통합 E2E 시나리오 (P8 종료 조건)

이 시나리오 하나가 요구사항 전체를 관통한다. 반드시 통과해야 한다.

```
1. /home 접속 → "배포된 구성이 없습니다"
2. /admin 접속 → /login 리다이렉트
3. admin / 123456 로그인
4. [① layout 구성]
   - "재고 관리" 페이지 생성, 아이콘 피커에서 "package" 검색해 선택
   - 하위에 "입고", "출고" 서브 페이지 생성
   - "출고"를 드래그해 "입고" 위로 순서 변경
5. [DB 설계]
   - "품목" 엔티티 생성: 품목명(TEXT,필수), 수량(INTEGER), 입고일(DATE), 상태(ENUM: 대기/완료)
   - 데이터 탭에서 3행 직접 입력
6. [① layout 구성 — 계속]
   - "재고 관리" 페이지에 card 배치 → 내부에 data-table 배치
   - data-table을 "품목" 엔티티에 list 바인딩, 컬럼 4개 지정
   - button "새로 만들기" 배치
7. [액션]
   - dialog 노드 배치 + 내부에 input 2개
   - CREATE 액션 "품목 등록" 생성, input들을 필드에 매핑
   - button onClick → OPEN_MODAL, dialog의 저장 버튼 → COMPOSITE(품목 등록 → 토스트 → 모달 닫기 → 테이블 갱신)
8. [② 관계도]
   - Page/Component/Entity/Action 노드 확인
   - data-table → 품목 엔티티 READS 엣지 확인 (자동 또는 수동)
   - 노드들을 드래그해 정렬 툴바로 격자 정렬
9. [③ 구성 검증] → 실행 → 오류 0건 확인 (오류가 있으면 수정 후 재검증)
10. [④ 수정본 배포] → diff 확인 → 배포 → 리비전 1 생성
11. /home 접속 → 사이드바에 "재고 관리 > 입고/출고" 표시, 아이콘 표시
12. /home/재고-관리 → data-table에 5단계에서 입력한 3행 표시
13. "새로 만들기" 클릭 → 모달 → 입력 → 저장 → 토스트 + 테이블에 4번째 행 등장
14. sqlite CLI로 app.db 확인 → 4행 존재
15. 관리자 모드에서 컴포넌트 1개 추가 → 재배포 → /home에 즉시 반영
16. 리비전 1로 롤백 → /home이 이전 구성으로 복귀
```

---

## 15. 요구사항 추적 매트릭스

원본 `요구사항 명세.txt`의 모든 문장이 이 명세에 매핑되었음을 확인한다.

| # | 원본 요구사항 | 반영 위치 | Phase |
|---|---|---|---|
| R1 | 현업 업무 전반을 진행할 웹 애플리케이션 | §1.1, §1.4 | 전체 |
| R2 | local PC가 호스팅 | §13.2 (pm2), CLAUDE.md §2 | P8 |
| R3 | `demo1.dove9999.com`으로 배포 | §13.1 (Cloudflare Tunnel) | P8 |
| R4 | 구현 수준 %와 예상 남은 시간을 중간중간 공유 | **CLAUDE.md §6** (보고 프로토콜), §14 가중치 표 | 전체 |
| R5 | 본문 좌측에 페이지 내비게이션이 있는 레이아웃, 샘플 이미지 참조 | §4 전체 (§4.1 구조도, §4.2 사이드바) | P1 |
| R6 | 운영 `/home` + 관리자 `/admin` 구성 | §1.2, §8, §12 | P1, P8 |
| R7 | 관리자에서 구성한 페이지 목록과 레이아웃이 실제 운영에 배포 | §2 (전체 아키텍처), §12.2, P8 수용 기준 2번 | P8 |
| R8 | 관리자 로그인 `admin` / `123456` | §7.1 | P1 |
| R9 | 관리자 접근 시 별도 로그인 페이지, 로그인해야 진입 | §7.2, §7.3 (middleware 가드) | P1 |
| R10 | 관리자에서 페이지·컴포넌트 배치 | §8.1.1, §8.1.3 | P2, P3 |
| R11 | 각 컴포넌트에 연결될 DB 디자인 | §6, §8.2, §8.1.4 데이터 탭 | P4 |
| R12 | 상호작용 가능한 컴포넌트의 동작 정의 | §9 전체, §8.1.4 동작 탭 | P6 |
| R13 | 4단계 워크플로 (layout → 관계도 → 검증 → 배포) | §1.3, §8.0 스텝퍼 | P1~P8 |
| R14 | Page는 드래그&드롭으로 위치 변경 | §8.1.1 (dnd-kit sortable) | P2 |
| R15 | 모든 요소는 드래그&드롭으로 배치 | §8.1.3 (캔버스 드롭+스냅), §8.1.2 (팔레트 드래그) | P3 |
| R16 | 좌측 사이드바 = 페이지 구성 | §8.1.1 | P2 |
| R17 | 그 옆 = 요소 선택 내비게이터 | §8.1.2 | P3 |
| R18 | 우측 사이드바 = 요소 상세 설정 속성 창 | §8.1.4 | P3 |
| R19 | 클래스 다이어그램 형태의 시각화된 노드 배치 | §8.4.2 (4종 커스텀 노드) | P5 |
| R20 | 연결선으로 Page/Component/DB/Action 관계 설정 | §8.4.3 (엣지 6종), §5 Relation 모델 | P5 |
| R21 | 각 노드도 드래그&드롭으로 위치 조절 | §8.4.1 | P5 |
| R22 | 오와 열을 맞출 수 있게 grid 기반 배치 | §8.4.1 (`snapGrid [20,20]` + 정렬 툴바) | P5 |
| R23 | 구성 검증 — 동작 관계 틀어짐 검증 | §11 (51개 규칙), §8.5 | P7 |
| R24 | 수정본 배포 — 실제 운영 버전에 배포 | §2.3, §8.6, §13 | P8 |
| R25 | UI/UX는 Figma shadcn 킷 요소 반영 | §3.1, §3.3 | P1, P3 |
| R26 | 각 Page는 Icon을 가질 수 있음 | §5 `Page.icon`, §8.1.4 | P2 |
| R27 | 아이콘 클릭 시 shadcn Icons 컬렉션 전체 표시, 검색 가능 | §8.1.5 (lucide 전체 + 가상 스크롤 + 검색) | P2 |
| R28 | Default shadcn/ui components 전체를 그룹별로 제공 | §3.3 설치 목록, §8.3 그룹 분류표 | P3 |
| R29 | Utility Components 포함 | §8.3 "유틸리티" 그룹 | P3 |

**미매핑 요구사항: 없음.**

---

## 16. 미결 사항 / 결정 기록

### 16.1 확정된 결정 (변경 시 사용자 승인 필요)

| 항목 | 결정 | 근거 |
|---|---|---|
| 프레임워크 | Next.js 15 App Router | shadcn/ui 공식 지원, 단일 앱으로 `/home`+`/admin` 처리 |
| 배포 방식 | 스펙 인터프리터 (codegen 아님) | 재빌드 없는 즉시 배포·원자적 롤백. §2.1 |
| DB 분리 | meta.db(Prisma) + app.db(동적) | Prisma 스키마는 런타임 변경 불가. §2.2 |
| 도메인 노출 | Cloudflare Tunnel | 포트포워딩·고정IP·인증서 관리 불필요 |
| 계정 | 관리자 1계정, 운영 익명 | 요구사항에 다중 계정 언급 없음 |
| 아이콘 | lucide-react | shadcn 기본 아이콘 세트 |

### 16.2 구현 중 확인이 필요할 수 있는 항목

1. **Figma 킷 접근**: 커뮤니티 파일이므로 MCP로 직접 읽지 못할 수 있다. 시각 스펙이 코드 기본값과 다를 경우 스크린샷 기준으로 맞추고, 판단이 어려우면 사용자에게 해당 컴포넌트 스크린샷을 요청한다.
2. **한글 slug**: `/home/재고-관리` 같은 한글 URL을 허용할지, 로마자 변환할지. 기본은 **한글 허용**(URL 인코딩)으로 구현하고, 문제 발생 시 로마자 변환 옵션을 페이지 속성에 추가.
3. **운영 모드 접근 제어**: 현재 익명 공개. 사내 데이터가 들어가면 Cloudflare Access 또는 별도 사용자 인증이 필요해진다 — P8 배포 시 사용자에게 명시적으로 확인한다.
4. **동시 편집**: 관리자 1명 전제. 두 브라우저에서 동시 편집하면 마지막 저장이 이긴다. V1에서 락을 구현하지 않되, 배포 시 `specHash`를 비교해 다른 세션의 변경이 있으면 경고한다.
5. **파일 업로드 컴포넌트(`attachment`)**: 실제 파일 저장 위치(`data/uploads/`)와 용량 제한을 P3에서 결정한다.
