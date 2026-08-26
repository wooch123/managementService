#!/usr/bin/env bash
#
# Ubuntu(및 데비안 계열)에서 이 저장소를 **받은 그대로 서비스 상태까지** 올린다.
#
#   git clone … && cd … && ./run.sh
#
# 하는 일: 필요한 것을 확인하고 없으면 설치한 뒤, 의존성 설치 → 준비 → 빌드 → 실행까지 이어 붙인다.
# 이미 갖춰진 단계는 건너뛴다(몇 번을 실행해도 결과가 같다).
#
#   1) Node.js 20+        없으면 NodeSource(apt)로, sudo가 없으면 nvm으로 홈에 설치
#   2) pnpm               corepack → npm 전역 → npm 사용자 홈 순으로 시도
#   3) pnpm install       lockfile 그대로. 다른 OS라 잠금이 안 맞으면 한 번 더 완화해 시도
#   4) 준비               세션 서명 키(.env.local)·Prisma 클라이언트·빈 폴더
#   5) 빌드·실행          기본은 프로덕션(next build → next start), `dev`면 개발 서버
#
# 설계(prisma/meta.db)와 업무 데이터(data/app.db), 게시판 첨부는 저장소에 함께 들어 있어
# 따로 넣을 것이 없다.
#
# 사용법:
#   ./run.sh                    프로덕션 모드로 빌드 후 실행 (http://localhost:3000)
#   ./run.sh dev                개발 서버 (파일을 고치면 바로 반영)
#   ./run.sh --port 8080        포트 지정
#   ./run.sh --host             0.0.0.0에 바인딩 (같은 망의 다른 기기에서 접속)
#   ./run.sh --skip-build       빌드를 건너뛰고 기존 산출물로 실행
#   ./run.sh setup              설치·준비까지만 하고 실행하지 않음
#
set -euo pipefail

cd "$(dirname "$0")"

# ── 표시 ────────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_OFF=''
fi
step()  { printf '\n%s▸ %s%s\n' "$C_BOLD" "$1" "$C_OFF"; }
info()  { printf '  %s\n' "$1"; }
ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_OFF" "$1"; }
warn()  { printf '  %s!%s %s\n' "$C_YELLOW" "$C_OFF" "$1"; }
die()   { printf '\n%s✗ %s%s\n\n' "$C_RED" "$1" "$C_OFF" >&2; exit 1; }

# ── 옵션 ────────────────────────────────────────────────────────────────────
MODE=start          # start | dev | setup
PORT=3000
HOST=127.0.0.1
SKIP_BUILD=0
SKIP_INSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    dev)            MODE=dev ;;
    start)          MODE=start ;;
    setup)          MODE=setup ;;
    --port)         PORT="${2:?--port 다음에 포트 번호가 필요합니다}"; shift ;;
    --port=*)       PORT="${1#*=}" ;;
    --host)         HOST=0.0.0.0 ;;
    --host=*)       HOST="${1#*=}" ;;
    --skip-build)   SKIP_BUILD=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "모르는 옵션입니다: $1   (./run.sh --help)" ;;
  esac
  shift
done

case "$PORT" in (*[!0-9]*|'') die "포트는 숫자여야 합니다: $PORT" ;; esac

printf '%s\n' "${C_DIM}WebApp_V1 — 로컬 실행 준비${C_OFF}"

# ── 0) 이 저장소가 맞는지 ───────────────────────────────────────────────────
[ -f package.json ] || die "package.json이 없습니다. 저장소 루트에서 실행하세요."
[ -f prisma/meta.db ] || die "prisma/meta.db가 없습니다. 저장소를 다시 받아 주세요(설계 데이터가 저장소에 함께 들어 있습니다)."
[ -f data/app.db ]   || die "data/app.db가 없습니다. 저장소를 다시 받아 주세요(업무 데이터가 저장소에 함께 들어 있습니다)."

# sudo를 쓸 수 있는지 — root면 필요 없고, 없으면 홈 디렉터리 설치로 우회한다.
SUDO=''
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    SUDO='sudo'                      # 암호 없이 바로 쓸 수 있다
  elif command -v sudo >/dev/null 2>&1; then
    SUDO='sudo'                      # 암호를 물을 수 있다
  fi
fi

apt_install() {
  # 데비안 계열에서만. 실패해도 스크립트를 죽이지 않는다(뒤에서 대안을 찾는다).
  command -v apt-get >/dev/null 2>&1 || return 1
  [ -n "$SUDO" ] || [ "$(id -u)" -eq 0 ] || return 1
  info "apt로 설치: $*"
  $SUDO apt-get update -qq >/dev/null 2>&1 || true
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null 2>&1
}

# ── 0-b) 기본 도구 ──────────────────────────────────────────────────────────
# curl은 설치 스크립트를 받는 데, OpenSSL은 Prisma 엔진이 쓴다(슬림 이미지에는 빠져 있곤 하다).
for pkg in curl openssl; do
  command -v "$pkg" >/dev/null 2>&1 || apt_install "$pkg" ca-certificates || true
done

# ── 1) Node.js 20+ ──────────────────────────────────────────────────────────
step "Node.js"

node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//'; }
have_node_20() {
  command -v node >/dev/null 2>&1 || return 1
  major="$(node_major)"
  # 버전을 못 읽으면(빈 값·이상한 형식) 없는 것으로 본다 — [ -ge ]에 빈 값이 가면 오류가 난다.
  case "$major" in (''|*[!0-9]*) return 1 ;; esac
  [ "$major" -ge 20 ]
}

# 이전 실행에서 nvm으로 깔아 뒀다면 이번에도 쓸 수 있게 불러온다.
if ! have_node_20 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

if have_node_20; then
  ok "이미 있음 ($(node -v))"
else
  if command -v node >/dev/null 2>&1; then
    warn "Node $(node -v)는 너무 낮습니다(20 이상 필요) — 새로 설치합니다"
  else
    info "Node.js가 없습니다 — 설치합니다"
  fi

  command -v curl >/dev/null 2>&1 || apt_install curl ca-certificates || true
  command -v curl >/dev/null 2>&1 || die "curl이 필요합니다. 먼저 설치해 주세요: sudo apt-get install -y curl"

  installed=0
  # (a) 데비안 계열 + sudo → NodeSource 저장소 (시스템 전역, 가장 흔한 경로)
  if command -v apt-get >/dev/null 2>&1 && { [ -n "$SUDO" ] || [ "$(id -u)" -eq 0 ]; }; then
    info "NodeSource로 Node 22 설치 중… (몇 분 걸릴 수 있습니다)"
    if { curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null 2>&1; } \
       && apt_install nodejs && have_node_20; then
      installed=1
    else
      warn "NodeSource 설치가 실패했습니다 — nvm으로 다시 시도합니다"
    fi
  fi

  # (b) 폴백: nvm으로 홈 디렉터리에 설치 (관리자 권한이 필요 없다)
  if [ "$installed" -eq 0 ]; then
    info "nvm으로 홈 디렉터리에 설치합니다 (관리자 권한 없이)"
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1 \
        || die "nvm 설치에 실패했습니다. 네트워크를 확인하거나 Node 20 이상을 직접 설치해 주세요."
    fi
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 22 >/dev/null 2>&1 || die "nvm으로 Node 설치에 실패했습니다."
    nvm use 22 >/dev/null 2>&1 || true
  fi

  have_node_20 || die "Node 20 이상을 준비하지 못했습니다. 직접 설치한 뒤 다시 실행해 주세요."
  ok "설치 완료 ($(node -v))"
fi

# ── 2) pnpm ─────────────────────────────────────────────────────────────────
step "pnpm"

# npm 사용자 전역 설치를 쓸 수 있게 PATH를 미리 넓힌다.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"

if command -v pnpm >/dev/null 2>&1; then
  ok "이미 있음 (pnpm $(pnpm --version 2>/dev/null || echo '?'))"
else
  info "pnpm이 없습니다 — 설치합니다"
  installed=0
  # (a) corepack: Node에 딸려 온다. package.json의 packageManager 버전을 그대로 쓴다.
  if command -v corepack >/dev/null 2>&1; then
    if corepack enable pnpm >/dev/null 2>&1 || { [ -n "$SUDO" ] && $SUDO corepack enable pnpm >/dev/null 2>&1; }; then
      corepack prepare --activate >/dev/null 2>&1 || true
      if command -v pnpm >/dev/null 2>&1; then installed=1; fi
    fi
  fi
  # (b) npm 전역
  if [ "$installed" -eq 0 ] && command -v npm >/dev/null 2>&1; then
    if npm install -g pnpm >/dev/null 2>&1; then installed=1; fi
    if [ "$installed" -eq 0 ] && [ -n "$SUDO" ]; then
      if $SUDO npm install -g pnpm >/dev/null 2>&1; then installed=1; fi
    fi
  fi
  # (c) 권한 없이 홈에 설치 — 전역 경로에 쓸 권한이 없을 때
  if [ "$installed" -eq 0 ] && command -v npm >/dev/null 2>&1; then
    if npm install -g --prefix "$HOME/.local" pnpm >/dev/null 2>&1; then installed=1; fi
  fi

  command -v pnpm >/dev/null 2>&1 || die "pnpm 설치에 실패했습니다. 직접 설치해 주세요: npm install -g pnpm"
  ok "설치 완료 (pnpm $(pnpm --version))"
fi

# ── 3) 의존성 ───────────────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 1 ]; then
  step "의존성 (건너뜀)"
else
  step "의존성 설치"
  # 잠금 파일은 Windows에서 만들어졌지만 플랫폼별 항목까지 함께 기록되므로 대개 그대로 맞는다.
  # 그래도 어긋나면(다른 아키텍처 등) 잠금을 갱신하며 한 번 더 시도한다 — 여기서 멈추면
  # "받아서 바로 실행"이라는 목적 자체가 무너진다.
  if pnpm install --frozen-lockfile; then
    ok "설치 완료"
  else
    warn "잠금 파일 그대로는 설치되지 않았습니다 — 잠금을 갱신해 다시 시도합니다"
    pnpm install || die "의존성 설치에 실패했습니다. 위 오류를 확인해 주세요."
    ok "설치 완료(잠금 갱신됨)"
  fi
fi

# ── 4) 준비 ─────────────────────────────────────────────────────────────────
step "실행 준비"
# 세션 서명 키(.env.local), Prisma 클라이언트, 빈 폴더 — 저장소에 담을 수 없는 것만 만든다.
pnpm setup:local || die "준비 단계에서 실패했습니다."

# ── 5) 빌드 · 실행 ──────────────────────────────────────────────────────────
url_host="$HOST"
if [ "$HOST" = "0.0.0.0" ]; then
  # 같은 망의 다른 기기가 쓸 주소를 안내한다. hostname이 없는 환경도 있으므로 실패를 삼킨다.
  url_host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
[ -n "$url_host" ] || url_host=localhost

if [ "$MODE" = "setup" ]; then
  step "준비 완료"
  info "실행: ./run.sh          (프로덕션)"
  info "      ./run.sh dev      (개발 서버)"
  exit 0
fi

if [ "$MODE" = "dev" ]; then
  step "개발 서버 시작"
  info "주소: http://${url_host}:${PORT}/home"
  info "관리자: http://${url_host}:${PORT}/admin  (admin / 123456 — 바꾸려면 pnpm admin:password \"새 비밀번호\")"
  printf '  %s중지: Ctrl+C%s\n\n' "$C_DIM" "$C_OFF"
  exec pnpm exec next dev --turbopack -p "$PORT" -H "$HOST"
fi

if [ "$SKIP_BUILD" -eq 1 ]; then
  step "빌드 (건너뜀)"
  [ -f .next/BUILD_ID ] || die "빌드 산출물이 없습니다(.next). --skip-build 없이 다시 실행해 주세요."
else
  step "빌드"
  info "처음에는 1~3분쯤 걸립니다"
  pnpm build || die "빌드에 실패했습니다. 위 오류를 확인해 주세요."
  ok "빌드 완료"
fi

step "서버 시작"
info "주소: http://${url_host}:${PORT}/home"
info "관리자: http://${url_host}:${PORT}/admin  (admin / 123456 — 바꾸려면 pnpm admin:password \"새 비밀번호\")"
if [ "$HOST" = "0.0.0.0" ]; then
  warn "0.0.0.0에 바인딩합니다 — 같은 망의 다른 기기에서 접속할 수 있습니다."
  warn "관리자 비밀번호를 바꾸지 않았다면 먼저 바꾸세요."
fi
printf '  %s중지: Ctrl+C%s\n\n' "$C_DIM" "$C_OFF"
exec pnpm exec next start -p "$PORT" -H "$HOST"
